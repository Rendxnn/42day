import type { Conversation, NormalizedInboundMessage, Tenant } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { addMenuItemToDraftOrder, getOrCreateActiveDraftOrder } from "../draft-order-service/draft-order-service";
import {
  incrementClarificationAttempts,
  updateConversationState,
} from "../conversation-service/conversation-service";
import { buildMenuText, buildWelcomeMenuText, loadTodayPublishedMenu, resolveMenuSelection } from "../menu-service/menu-service";
import { logOutboundTextMessage } from "../message-log/message-log";
import { sendWhatsAppTextMessage } from "../whatsapp-webhook/whatsapp-client";
import { getInitialGuidedFlowResponse } from "../guided-flow-engine/guided-flow-engine";

export type RouteInboundMessageInput = {
  env: ApiBindings;
  tenant: Tenant;
  conversation: Conversation;
  message: NormalizedInboundMessage;
};

export async function routeInboundMessage(input: RouteInboundMessageInput): Promise<void> {
  if (!input.tenant.automationEnabled) {
    console.info("tenant.automation_disabled", {
      tenantId: input.tenant.id,
      providerMessageId: input.message.providerMessageId,
    });
    return;
  }

  if (input.message.type === "location" && input.message.location) {
    await sendAndLogText(
      input,
      "Listo, recibi tu ubicacion. La voy a usar como direccion de entrega cuando sigamos armando tu pedido.",
    );
    return;
  }

  const text = normalizeText(input.message.text);
  const numericSelection = parseNumericSelection(text);
  const isGreeting = matchesGreeting(text);

  if (text.includes("asesor") || text.includes("humano")) {
    console.info("handoff.requested", {
      tenantId: input.tenant.id,
      providerMessageId: input.message.providerMessageId,
    });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "manual",
      manualReason: "support_requested",
    }).catch(() => undefined);

    await sendAndLogText(input, "Listo, te pasamos con alguien del restaurante para que te ayude.");
    return;
  }

  if (
    isGreeting ||
    text.includes("menu") ||
    text.includes("menú") ||
    text.includes("pedido guiado") ||
    text.includes("guiado") ||
    text.includes("hacer pedido")
  ) {
    const menu = await loadTodayPublishedMenu({
      env: input.env,
      schemaName: input.tenant.schemaName,
      tenantSlug: input.tenant.slug,
      timezone: input.tenant.timezone,
    });

    const intro = getInitialGuidedFlowResponse();
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_guided_item_selection",
      context: {
        flow: "guided",
        activeMenuId: menu.menu?.id,
        activeLocationId: menu.location?.id,
      },
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      isGreeting ? buildWelcomeMenuText(menu) : `${intro.responseText}\n\n${buildMenuText(menu)}`,
    );
    return;
  }

  if (input.conversation.state === "awaiting_guided_item_selection" && numericSelection !== null) {
    const menu = await loadTodayPublishedMenu({
      env: input.env,
      schemaName: input.tenant.schemaName,
      tenantSlug: input.tenant.slug,
      timezone: input.tenant.timezone,
    });
    const selectedItem = resolveMenuSelection(menu, numericSelection);

    if (!selectedItem || !menu.location) {
      if (input.conversation.clarificationAttempts >= 2) {
        await updateConversationState({
          env: input.env,
          schemaName: input.tenant.schemaName,
          conversationId: input.conversation.id,
          state: "manual",
          manualReason: "guided_selection_failed",
        }).catch(() => undefined);

        await sendAndLogText(
          input,
          "No logre confirmar bien el producto. Te paso con alguien del restaurante para continuar el pedido.",
        );
        return;
      }

      await incrementClarificationAttempts({
        env: input.env,
        schemaName: input.tenant.schemaName,
        conversationId: input.conversation.id,
      }).catch(() => undefined);

      await sendAndLogText(
        input,
        `No encontre ese numero en el menu de hoy.\n\n${buildMenuText(menu)}`,
      );
      return;
    }

    const draft = await getOrCreateActiveDraftOrder({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversation: input.conversation,
      customerId: input.conversation.customerId,
      locationId: menu.location.id,
      deliveryFeeFixed: menu.location.deliveryFeeFixed,
    });

    const updatedDraft = await addMenuItemToDraftOrder({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      menuItem: selectedItem,
      quantity: 1,
      deliveryFeeFixed: menu.location.deliveryFeeFixed,
    });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_fulfillment_type",
      context: {
        flow: "guided",
        activeMenuId: menu.menu?.id,
        activeLocationId: menu.location.id,
        lastSelectedMenuItemId: selectedItem.id,
      },
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    const itemName = selectedItem.displayName ?? selectedItem.product?.name ?? "Producto";

    await sendAndLogText(
      input,
      [
        `Agregue ${itemName} a tu pedido.`,
        `Llevas ${updatedDraft.items.length} item(s) y un subtotal de ${formatCop(updatedDraft.subtotal)}.`,
        "",
        "Ahora dime como lo quieres:",
        "1. Domicilio",
        "2. Pickup",
      ].join("\n"),
    );
    return;
  }

  await sendAndLogText(
    input,
    "No te entendi del todo, pero te ayudo enseguida.\n\nEscribe menu para ver las opciones o asesor si prefieres hablar con alguien del restaurante.",
  );
}

async function sendAndLogText(input: RouteInboundMessageInput, text: string): Promise<void> {
  const result = await sendWhatsAppTextMessage(input.env, {
    to: input.message.from,
    text,
  });

  await logOutboundTextMessage({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    text,
    result,
  }).catch((error: unknown) => {
    console.error("message_log.outbound_failed", {
      error: error instanceof Error ? error.message : String(error),
      conversationId: input.conversation.id,
    });
  });
}

function normalizeText(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function parseNumericSelection(text: string): number | null {
  if (!/^\d+$/.test(text)) {
    return null;
  }

  return Number(text);
}

function matchesGreeting(text: string): boolean {
  return ["hola", "buenas", "buenos dias", "buen dia", "buenas tardes", "buenas noches", "hey", "holi"].includes(text);
}

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
