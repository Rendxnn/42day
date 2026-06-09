import type { DraftOrder, MenuItem, OrderLineItemOptionTextInput, TodayMenuPayload } from "@42day/types";
import type { DetectedSignals } from "../../modules/message-router/signal-detector";
import { addMenuItemToDraftOrder, getOrCreateActiveDraftOrder } from "../draft-orders/service";
import { buildManualHandoffMessage } from "../../modules/message-router/response-composer";
import { resolveMenuSelection, resolveMenuSelectionsFromText } from "../menu/service";
import {
  buildOrderLineItemOptionsSnapshot,
  resolveProductConfiguration,
  shouldPersistConfigurationSnapshot,
  type ProductConfigurationResolution,
  type ProductConfigurationSource,
} from "../product-configurator/service";
import type { ConfigurableItemCandidate } from "./context";
import { continueAfterItemAdded } from "./checkout";
import { loadCurrentMenu } from "./helpers";
import { moveToManual } from "./manual-handoff";
import { persistPendingProductConfiguration } from "./product-configuration";
import type { RouteInboundMessageInput } from "./types";

export async function tryHandleGuidedSelection(
  input: RouteInboundMessageInput,
  signals: DetectedSignals,
): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  const resolvedByNumber = signals.numericSelection !== null ? resolveMenuSelection(menu, signals.numericSelection) : null;
  const resolvedByTextList = !resolvedByNumber && signals.normalizedText ? resolveMenuSelectionsFromText(menu, signals.normalizedText) : [];
  const resolvedByText = resolvedByTextList.length === 1 ? resolvedByTextList[0] : null;
  const selectedItem = resolvedByNumber ?? resolvedByText?.item ?? null;
  const quantity = resolvedByText?.quantity ?? 1;

  if (!resolvedByNumber && resolvedByTextList.length > 1 && menu.location) {
    let updatedDraft: DraftOrder | null = null;
    let lastSelectedItem: MenuItem | null = null;

    for (const selection of resolvedByTextList) {
      const stageResult = await stageConfiguredItemSelection(input, {
        menu,
        selectedItem: selection.item,
        quantity: selection.quantity,
        source: "guided",
      });
      if (stageResult.kind === "prompted") {
        return true;
      }
      if (stageResult.kind === "added") {
        updatedDraft = stageResult.draft;
        lastSelectedItem = selection.item;
      }
    }

    if (updatedDraft && lastSelectedItem) {
      await continueAfterItemAdded(input, {
        menu,
        draft: updatedDraft,
        selectedItem: lastSelectedItem,
        quantity: 1,
        signals,
      });
      return true;
    }
  }

  if (!selectedItem || !menu.location) {
    return false;
  }

  const stageResult = await stageConfiguredItemSelection(input, {
    menu,
    selectedItem,
    quantity,
    source: "guided",
  });
  if (stageResult.kind === "prompted") {
    return true;
  }
  if (stageResult.kind !== "added") {
    return false;
  }

  await continueAfterItemAdded(input, {
    menu,
    draft: stageResult.draft,
    selectedItem,
    quantity,
    signals,
  });
  return true;
}

export async function stageConfiguredItemSelection(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  selectedItem: MenuItem;
  quantity: number;
  source: ProductConfigurationSource;
  rawItemText?: string;
  rawOptionTexts?: OrderLineItemOptionTextInput[];
  notes?: string[];
  queuedItems?: ConfigurableItemCandidate[];
}): Promise<{ kind: "added"; draft: DraftOrder } | { kind: "prompted" }> {
  const notes = uniqueNotes(payload.notes ?? []);
  const resolution = resolveProductConfiguration({
    menuItem: payload.selectedItem,
    source: payload.source,
    rawOptionTexts: payload.rawOptionTexts,
    freeTextNotes: notes,
  });

  if (resolution.status === "resolved") {
    return {
      kind: "added",
      draft: await addSelectedItem(input, {
        menu: payload.menu,
        selectedItem: payload.selectedItem,
        quantity: payload.quantity,
        options: shouldPersistConfigurationSnapshot({
          menuItem: payload.selectedItem,
          resolution,
        })
          ? buildOrderLineItemOptionsSnapshot(resolution)
          : undefined,
        notes: notes.join("; ") || undefined,
        unitPrice: resolution.pricing.resolvedUnitPrice,
      }),
    };
  }

  if (resolution.status === "needs_clarification" && resolution.nextOption?.id) {
    await persistPendingProductConfiguration(input, {
      menu: payload.menu,
      selectedItem: payload.selectedItem,
      quantity: payload.quantity,
      source: payload.source,
      rawItemText: payload.rawItemText,
      rawOptionTexts: resolution.rawOptionTexts,
      notes,
      resolution,
      queuedItems: payload.queuedItems,
    });
    return { kind: "prompted" };
  }

  await moveToManual(input, {
    type: "validation_failed_repeatedly",
    manualReason: "product_configuration_unresolved",
    title: "Producto requiere revision",
    description: "El producto tiene configuracion pendiente que el bot no logro resolver.",
    responseText: buildManualHandoffMessage(),
  });
  return { kind: "prompted" };
}

async function addSelectedItem(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  selectedItem: MenuItem;
  quantity: number;
  options?: ReturnType<typeof buildOrderLineItemOptionsSnapshot>;
  notes?: string;
  unitPrice?: number;
}): Promise<DraftOrder> {
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: payload.menu.location?.id,
    deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
  });

  return addMenuItemToDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    menuItem: payload.selectedItem,
    quantity: payload.quantity,
    options: payload.options,
    notes: payload.notes,
    unitPrice: payload.unitPrice,
    deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
  });
}

function uniqueNotes(notes: string[]): string[] {
  return Array.from(new Set(notes.map((entry) => entry.trim()).filter(Boolean)));
}
