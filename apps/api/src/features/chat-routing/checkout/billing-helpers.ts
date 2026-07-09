import type { CustomerBillingProfile, DraftOrder } from "@42day/types";

export function applyBillingDefaults(
  billing: NonNullable<DraftOrder["billing"]>,
  draft: DraftOrder,
): NonNullable<DraftOrder["billing"]> {
  if (billing.type === "normal" && draft.fulfillmentType === "delivery" && draft.deliveryAddress) {
    return {
      ...billing,
      billingAddress: billing.billingAddress ?? draft.deliveryAddress,
    };
  }

  return billing;
}

export function readPendingBillingContext(context: Record<string, unknown>): {
  type: "normal" | "electronic";
  shouldReuseDeliveryAddress?: boolean;
  reuseProfile?: CustomerBillingProfile;
} | null {
  const candidate = context.pendingBilling;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const raw = candidate as Record<string, unknown>;
  const type = raw.type === "electronic" ? "electronic" : raw.type === "normal" ? "normal" : null;
  if (!type) {
    return null;
  }

  const reuseProfile = typeof raw.reuseProfileId === "string"
    ? ({
        id: raw.reuseProfileId,
        customerId: "",
        type,
        fullName: typeof raw.fullName === "string" ? raw.fullName : undefined,
        billingAddress: typeof raw.billingAddress === "string" ? raw.billingAddress : undefined,
        legalName: typeof raw.legalName === "string" ? raw.legalName : undefined,
        taxId: typeof raw.taxId === "string" ? raw.taxId : undefined,
        email: typeof raw.email === "string" ? raw.email : undefined,
        createdAt: "",
        updatedAt: "",
      } satisfies CustomerBillingProfile)
    : undefined;

  return {
    type,
    shouldReuseDeliveryAddress: raw.shouldReuseDeliveryAddress === true,
    reuseProfile,
  };
}

export function renderBillingProfile(profile: CustomerBillingProfile, draft: DraftOrder): string {
  if (profile.type === "electronic") {
    return [
      `Nombre o razón social: ${profile.legalName ?? "-"}`,
      `Cédula o NIT: ${profile.taxId ?? "-"}`,
      `Correo: ${profile.email ?? "-"}`,
    ].join("\n");
  }

  return [
    `Nombre completo: ${profile.fullName ?? "-"}`,
    `Dirección: ${profile.billingAddress ?? draft.deliveryAddress ?? "-"}`,
    "Si necesitas factura electrónica, también puedes pedírmela en este paso.",
  ].join("\n");
}

export function parseElectronicBillingText(text: string): DraftOrder["billing"] | null {
  const parts = text.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const [legalName, taxId, email] = parts;
  if (!legalName || !taxId || !email || !email.includes("@")) {
    return null;
  }

  return {
    type: "electronic",
    legalName,
    taxId,
    email,
  };
}
