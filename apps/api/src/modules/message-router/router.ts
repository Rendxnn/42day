import type { Conversation, NormalizedInboundMessage, Tenant } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { logOutboundTextMessage } from "../message-log/message-log";
import { sendWhatsAppTextMessage } from "../whatsapp-webhook/whatsapp-client";

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

  if (text.includes("asesor") || text.includes("humano")) {
    console.info("handoff.requested", {
      tenantId: input.tenant.id,
      providerMessageId: input.message.providerMessageId,
    });

    await sendAndLogText(input, "Listo, te pasamos con alguien del restaurante para que te ayude.");
    return;
  }

  if (text.includes("menu") || text.includes("menú")) {
    await sendAndLogText(
      input,
      "Todavia estoy conectando el menu del dia. Por ahora puedo registrar tu mensaje y pronto te mostrare las opciones aqui mismo.",
    );
    return;
  }

  await sendAndLogText(
    input,
    "Hola, te ayudo con tu pedido. Puedes ver el menu, hacer pedido guiado, escribirlo como quieras o hablar con alguien del restaurante.",
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
