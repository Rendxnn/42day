import type {
  OrderLineItemOptionTextInput,
  OrderLineItemResolvedOption,
  ProductOption,
} from "@42day/types";
import type { ProductConfigurationSource } from "../../product-configurator/service";

export type ConfigurableItemCandidate = {
  menuItemId: string;
  quantity: number;
  source: ProductConfigurationSource;
  rawItemText?: string;
  rawOptionTexts?: OrderLineItemOptionTextInput[];
  notes?: string[];
};

export type PendingProductConfigurationContext = {
  id: string;
  menuItemId: string;
  productId?: string;
  quantity: number;
  source: ProductConfigurationSource;
  rawItemText?: string;
  rawOptionTexts: OrderLineItemOptionTextInput[];
  notes: string[];
  resolvedOptions: OrderLineItemResolvedOption[];
  pendingOptionId: string;
  pendingOptionName: string;
  pendingOptionType: ProductOption["type"];
  invalidValueTexts?: string[];
  ambiguousValueTexts?: string[];
  startedAt: string;
  queuedItems?: ConfigurableItemCandidate[];
  returnToOrderAdjustment?: boolean;
};
