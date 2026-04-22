import type { DraftOrder, FulfillmentType, OrderLineItem } from "@42day/types";

export type PricingInput = {
  items: OrderLineItem[];
  fulfillmentType?: FulfillmentType;
  deliveryFeeFixed: number;
  discountTotal?: number;
};

export function calculateDraftTotals(input: PricingInput): Pick<DraftOrder, "subtotal" | "deliveryFee" | "discountTotal" | "total"> {
  const subtotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const deliveryFee = input.fulfillmentType === "delivery" ? input.deliveryFeeFixed : 0;
  const discountTotal = input.discountTotal ?? 0;
  const total = subtotal + deliveryFee - discountTotal;

  return {
    subtotal,
    deliveryFee,
    discountTotal,
    total,
  };
}
