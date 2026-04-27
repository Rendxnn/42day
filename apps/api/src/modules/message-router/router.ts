import type { Conversation, DraftOrder, NormalizedInboundMessage, PaymentMethod, Tenant, TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import {
  addMenuItemToDraftOrder,
  getOrCreateActiveDraftOrder,
  updateDraftOrderDeliveryAddress,
  updateDraftOrderFulfillment,
  updateDraftOrderPaymentMethod,
} from "../draft-order-service/draft-order-service";
import { getLatestCustomerAddress, saveCustomerAddressFromText } from "../customer-address-service/customer-address-service";
import {
  incrementClarificationAttempts,
  updateConversationState,
} from "../conversation-service/conversation-service";
import {
  buildMenuText,
  buildWelcomeMenuText,
  loadTodayPublishedMenu,
  resolveMenuSelection,
  resolveMenuSelectionFromText,
} from "../menu-service/menu-service";
import { logOutboundTextMessage } from "../message-log/message-log";
import { persistConfirmedOrder } from "../order-service/order-service";
import { sendWhatsAppTextMessage } from "../whatsapp-webhook/whatsapp-client";
import { getInitialGuidedFlowResponse } from "../guided-flow-engine/guided-flow-engine";

const DEFAULT_ESTIMATED_MINUTES = 30;

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
    const menu = await loadCurrentMenu(input);
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

  if (input.conversation.state === "awaiting_guided_item_selection") {
    const handledSelection = await tryHandleGuidedSelection(input, text, numericSelection);
    if (handledSelection) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_fulfillment_type" || input.conversation.state === "awaiting_confirmation") {
    const handledFulfillment = await tryHandleFulfillmentSelection(input, text);
    if (handledFulfillment) {
      return;
    }
  }

  if (
    input.conversation.state === "awaiting_address" ||
    (input.conversation.state === "awaiting_confirmation" && input.message.type === "location")
  ) {
    const handledAddress = await tryHandleDeliveryAddress(input, text);
    if (handledAddress) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_payment_method" || input.conversation.state === "awaiting_confirmation") {
    const handledPayment = await tryHandlePaymentMethod(input, text);
    if (handledPayment) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_confirmation") {
    const handledConfirmation = await tryHandleConfirmation(input, text);
    if (handledConfirmation) {
      return;
    }
  }

  if (input.message.type === "location" && input.message.location) {
    await sendAndLogText(
      input,
      "Listo, recibi tu ubicacion. La voy a usar como direccion de entrega cuando sigamos armando tu pedido.",
    );
    return;
  }

  await handleClarification(input, buildStatePrompt(input.conversation.state), `unhandled_${input.conversation.state}`);
}

async function tryHandleGuidedSelection(
  input: RouteInboundMessageInput,
  text: string,
  numericSelection: number | null,
): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  const resolvedByNumber = numericSelection !== null ? resolveMenuSelection(menu, numericSelection) : null;
  const resolvedByText = !resolvedByNumber && text ? resolveMenuSelectionFromText(menu, text) : null;
  const selectedItem = resolvedByNumber ?? resolvedByText?.item ?? null;
  const quantity = resolvedByText?.quantity ?? 1;

  if (!selectedItem || !menu.location) {
    await handleClarification(
      input,
      `No logre ubicar ese producto en el menu de hoy.\n\n${buildMenuText(menu)}`,
      "guided_selection_failed",
    );
    return true;
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
    quantity,
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
      `Perfecto. Te llevo ${quantity} ${pluralizeItem(itemName, quantity)}.`,
      `Subtotal: ${formatCop(updatedDraft.subtotal)}.`,
      "",
      buildFulfillmentPrompt(menu),
    ].join("\n"),
  );
  return true;
}

async function tryHandleFulfillmentSelection(input: RouteInboundMessageInput, text: string): Promise<boolean> {
  const fulfillmentType = parseFulfillmentSelection(text, input.conversation.state);
  if (!fulfillmentType) {
    return false;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const updatedDraft = await updateDraftOrderFulfillment({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    fulfillmentType,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  if (fulfillmentType === "delivery") {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      [
        "Listo, va a domicilio.",
        "Enviame tu ubicacion de WhatsApp o escribeme la direccion para seguir.",
      ].join("\n"),
    );
    return true;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_payment_method",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(
    input,
    [
      "Perfecto, queda para recoger en tienda.",
      buildPaymentPrompt(updatedDraft, menu),
    ].join("\n\n"),
  );
  return true;
}

async function tryHandleDeliveryAddress(input: RouteInboundMessageInput, text: string): Promise<boolean> {
  if (input.message.type !== "location" && !looksLikeAddressText(text)) {
    return false;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const address =
    input.message.type === "location"
      ? await getLatestCustomerAddress({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
        })
      : await saveCustomerAddressFromText({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
          addressText: input.message.text ?? text,
        });

  if (!address) {
    await handleClarification(
      input,
      "No pude guardar bien la direccion. Enviamela otra vez o comparte tu ubicacion de WhatsApp.",
      "address_capture_failed",
    );
    return true;
  }

  await updateDraftOrderDeliveryAddress({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    addressText: address.addressText,
    deliveryAddressId: address.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_payment_method",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(
    input,
    [
      `Perfecto, voy a usar esta direccion: ${address.addressText}.`,
      buildPaymentPrompt(draft, menu),
    ].join("\n\n"),
  );
  return true;
}

async function tryHandlePaymentMethod(input: RouteInboundMessageInput, text: string): Promise<boolean> {
  const paymentMethod = parsePaymentMethod(text, input.conversation.state);
  if (!paymentMethod) {
    return false;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const updatedDraft = await updateDraftOrderPaymentMethod({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    paymentMethod,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_confirmation",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildOrderSummaryText(updatedDraft, paymentMethod));
  return true;
}

async function tryHandleConfirmation(input: RouteInboundMessageInput, text: string): Promise<boolean> {
  const confirmation = parseConfirmation(text);
  if (!confirmation) {
    return false;
  }

  if (confirmation === "no") {
    await sendAndLogText(
      input,
      [
        "Todo bien, lo ajustamos.",
        "Puedes escribir de nuevo el producto, decirme domicilio o pickup, o cambiar el pago a efectivo o transferencia.",
      ].join("\n"),
    );
    return true;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const order = await persistConfirmedOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    customerId: input.conversation.customerId,
    draft,
  });

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: draft.paymentMethod === "transfer" ? "awaiting_transfer_proof" : "completed",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  if (draft.paymentMethod === "transfer") {
    await sendAndLogText(
      input,
      [
        `Listo, deje tu pedido ${order.id.slice(0, 8)} pendiente de revision.`,
        "Cuando puedas, enviame el comprobante de la transferencia y el restaurante lo valida por aqui.",
      ].join("\n"),
    );
    return true;
  }

  await sendAndLogText(
    input,
    [
      `Listo, deje tu pedido ${order.id.slice(0, 8)} registrado.`,
      "El restaurante lo revisa y te confirma por aqui en un momento.",
    ].join("\n"),
  );
  return true;
}

async function handleClarification(
  input: RouteInboundMessageInput,
  responseText: string,
  manualReason: string,
): Promise<void> {
  if (input.conversation.clarificationAttempts >= 2) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "manual",
      manualReason,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      "No logre confirmarlo bien por este chat. Te paso con alguien del restaurante para seguir sin enredarnos.",
    );
    return;
  }

  await incrementClarificationAttempts({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
  }).catch(() => undefined);

  await sendAndLogText(input, responseText);
}

async function loadCurrentMenu(input: RouteInboundMessageInput): Promise<TodayMenuPayload> {
  return loadTodayPublishedMenu({
    env: input.env,
    schemaName: input.tenant.schemaName,
    tenantSlug: input.tenant.slug,
    timezone: input.tenant.timezone,
  });
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

function buildFulfillmentPrompt(menu: TodayMenuPayload): string {
  const options: string[] = [];

  if (menu.location?.deliveryEnabled ?? true) {
    options.push("1. Domicilio");
  }

  if (menu.location?.pickupEnabled ?? true) {
    options.push("2. Pickup");
  }

  return ["¿Lo quieres a domicilio o para recoger en la tienda?", ...options].join("\n");
}

function buildPaymentPrompt(_draft: DraftOrder, menu: TodayMenuPayload): string {
  const lines = ["¿Como prefieres pagar?", "1. Efectivo", "2. Transferencia"];

  if (menu.location?.deliveryFeeFixed && menu.location.deliveryFeeFixed > 0) {
    lines.push(`Domicilio actual: ${formatCop(menu.location.deliveryFeeFixed)}.`);
  }

  return lines.join("\n");
}

function buildOrderSummaryText(draft: DraftOrder, paymentMethod: PaymentMethod): string {
  const lines = ["Excelente, te confirmo tu pedido:", ""];

  for (const item of draft.items) {
    lines.push(`${item.quantity} x ${item.name} - ${formatCop(item.lineTotal)}`);
  }

  lines.push("", `Subtotal: ${formatCop(draft.subtotal)}`);

  if (draft.fulfillmentType === "delivery") {
    lines.push(`Domicilio: ${formatCop(draft.deliveryFee)}`);
  } else {
    lines.push("Entrega: Pickup");
  }

  lines.push(`Pago: ${paymentMethod === "cash" ? "Efectivo" : "Transferencia"}`);
  lines.push(`Tiempo estimado: ${DEFAULT_ESTIMATED_MINUTES} min`);
  lines.push(`Total: ${formatCop(draft.total)}`);
  lines.push("", "Si todo esta bien, responde si para registrar el pedido.");

  return lines.join("\n");
}

function buildStatePrompt(state: Conversation["state"]): string {
  switch (state) {
    case "awaiting_guided_item_selection":
      return "Escribeme el numero del producto o el nombre del item que quieres pedir.";
    case "awaiting_fulfillment_type":
      return "Dime si lo quieres a domicilio o para recoger en tienda.";
    case "awaiting_address":
      return "Enviame tu ubicacion de WhatsApp o escribeme la direccion para continuar.";
    case "awaiting_payment_method":
      return "Dime si vas a pagar en efectivo o por transferencia.";
    case "awaiting_confirmation":
      return "Si todo esta bien responde si. Si quieres cambiar algo, dime que ajustamos.";
    case "awaiting_transfer_proof":
      return "Quedo pendiente el comprobante de transferencia para que el restaurante lo revise.";
    default:
      return "Escribe menu para ver las opciones o asesor si prefieres hablar con alguien del restaurante.";
  }
}

function parseFulfillmentSelection(text: string, state: Conversation["state"]): DraftOrder["fulfillmentType"] | null {
  if (!text) {
    return null;
  }

  if (state === "awaiting_fulfillment_type") {
    if (text === "1") {
      return "delivery";
    }

    if (text === "2") {
      return "pickup";
    }
  }

  if (/\b(domicilio|delivery|envio|a domicilio)\b/.test(text)) {
    return "delivery";
  }

  if (/\b(pickup|recoger|recogida|retiro|tienda)\b/.test(text)) {
    return "pickup";
  }

  return null;
}

function parsePaymentMethod(text: string, state: Conversation["state"]): PaymentMethod | null {
  if (!text) {
    return null;
  }

  if (state === "awaiting_payment_method") {
    if (text === "1") {
      return "cash";
    }

    if (text === "2") {
      return "transfer";
    }
  }

  if (/\b(efectivo|cash|contra entrega)\b/.test(text)) {
    return "cash";
  }

  if (/\b(transferencia|transferir|nequi|daviplata)\b/.test(text)) {
    return "transfer";
  }

  return null;
}

function parseConfirmation(text: string): "yes" | "no" | null {
  if (!text) {
    return null;
  }

  if (/^(si|sí|confirmo|correcto|dale|listo|ok|okay)$/.test(text)) {
    return "yes";
  }

  if (/\b(no|cambiar|corregir|editar|ajustar)\b/.test(text)) {
    return "no";
  }

  return null;
}

function looksLikeAddressText(text: string): boolean {
  if (!text) {
    return false;
  }

  if (parseFulfillmentSelection(text, "awaiting_address") || parsePaymentMethod(text, "awaiting_address") || parseConfirmation(text)) {
    return false;
  }

  return text.length >= 8;
}

function normalizeText(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
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

function pluralizeItem(name: string, quantity: number): string {
  if (quantity === 1) {
    return name;
  }

  return name.endsWith("s") ? name : `${name}s`;
}

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
