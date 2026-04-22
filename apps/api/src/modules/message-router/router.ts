import type { NormalizedInboundMessage, Tenant } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { sendWhatsAppTextMessage } from "../whatsapp-webhook/whatsapp-client";

export type RouteInboundMessageInput = {
  env: ApiBindings;
  tenant: Tenant;
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

  if (text.includes("asesor") || text.includes("humano")) {
    console.info("handoff.requested", {
      tenantId: input.tenant.id,
      providerMessageId: input.message.providerMessageId,
    });

    await sendWhatsAppTextMessage(input.env, {
      to: input.message.from,
      text: "Listo, te pasamos con alguien del restaurante para que te ayude.",
    });
    return;
  }

  await sendWhatsAppTextMessage(input.env, {
    to: input.message.from,
    text:
      "Hola, te ayudo con tu pedido. Puedes ver el menu, hacer pedido guiado, escribirlo como quieras o hablar con alguien del restaurante.",
  });
}

function normalizeText(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}
