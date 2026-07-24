import type { CustomerBillingProfile, DraftOrder } from "@42day/types";
import { toCustomerSafeAddress } from "../../delivery-coverage/customer-safe-address.ts";

export function applyBillingDefaults(
  billing: NonNullable<DraftOrder["billing"]>,
  draft: DraftOrder,
): NonNullable<DraftOrder["billing"]> {
  if (billing.type !== "normal") return billing;

  const currentBillingAddress = toCustomerSafeAddress(billing.billingAddress);
  const deliveryAddress = toCustomerSafeAddress(
    draft.resolvedDeliveryAddress ?? draft.customerAddressText ?? draft.deliveryAddress,
  );
  const billingAddress = currentBillingAddress ?? (draft.fulfillmentType === "delivery" ? deliveryAddress : undefined);

  if (billingAddress) {
    return {
      ...billing,
      billingAddress,
    };
  }

  const { billingAddress: _unsafeBillingAddress, ...safeBilling } = billing;
  return safeBilling;
}

export function isValidNormalBillingFullName(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);

  return words.length >= 2
    && words.length <= 5
    && words.every((word) => /^[\p{Letter}]{2,}$/u.test(word))
    && !words.some((word) => ["quiero", "cambiar", "pedido", "agregar", "domicilio", "efectivo", "transferencia"].includes(word));
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
    `Dirección: ${toCustomerSafeAddress(profile.billingAddress ?? draft.resolvedDeliveryAddress ?? draft.customerAddressText ?? draft.deliveryAddress)
      ?? (draft.fulfillmentType === "pickup" ? "no requerida para recoger" : "por confirmar")}`,
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

export function resolveBillingReuseDecision(signals: {
  confirmation?: "yes" | "no" | "change" | null;
  wantsElectronicBilling?: boolean;
  billingDataChanged?: boolean;
  billingDecision?: "reuse" | "change" | "switch_to_electronic" | null;
}): {
  reuseExisting: boolean;
  changeBilling: boolean;
  switchToElectronic: boolean;
} {
  const switchToElectronic = signals.billingDecision === "switch_to_electronic" || signals.wantsElectronicBilling === true;
  const changeBilling = signals.billingDecision === "change"
    || signals.confirmation === "no"
    || signals.confirmation === "change"
    || signals.billingDataChanged === true;
  const reuseExisting = signals.billingDecision === "reuse" || signals.confirmation === "yes";

  return {
    reuseExisting,
    changeBilling,
    switchToElectronic,
  };
}
