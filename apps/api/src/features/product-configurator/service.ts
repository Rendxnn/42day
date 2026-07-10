import type {
  MenuItem,
  OrderLineItemOptionTextInput,
  OrderLineItemOptionsSnapshot,
  OrderLineItemResolvedOption,
  OrderLineItemSelectedOptionValue,
  ProductOption,
  ProductOptionValue,
  ProductOptionType,
} from "@42day/types";

export type ProductConfigurationSource = "guided" | "semantic";

export type ProductConfigurationResolution = {
  status: "resolved" | "needs_clarification" | "invalid";
  source: ProductConfigurationSource;
  resolvedOptions: OrderLineItemResolvedOption[];
  freeTextNotes: string[];
  rawOptionTexts: OrderLineItemOptionTextInput[];
  missingRequiredOptions: ProductOption[];
  invalidValueTexts: string[];
  ambiguousValueTexts: string[];
  nextOption?: ProductOption;
  pricing: {
    unitBasePrice: number;
    optionsPriceDelta: number;
    resolvedUnitPrice: number;
  };
  internalReasons: string[];
};

export function resolveProductConfiguration(input: {
  menuItem: MenuItem;
  source: ProductConfigurationSource;
  rawOptionTexts?: OrderLineItemOptionTextInput[];
  freeTextNotes?: string[];
  existingResolvedOptions?: OrderLineItemResolvedOption[];
  forcedOptionId?: string;
}): ProductConfigurationResolution {
  const product = input.menuItem.product;
  const productOptions = [...(product?.options ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
  const unitBasePrice = input.menuItem.priceOverride ?? product?.basePrice ?? 0;
  const rawOptionTexts = (input.rawOptionTexts ?? []).filter((entry) => entry.valueText.trim().length > 0);
  const freeTextNotes = (input.freeTextNotes ?? []).filter((entry) => entry.trim().length > 0);
  const resolvedByOptionId = new Map<string, OrderLineItemResolvedOption>();
  const invalidValueTexts: string[] = [];
  const ambiguousValueTexts: string[] = [];
  const internalReasons: string[] = [];
  const invalidOptionIds: string[] = [];

  for (const resolved of input.existingResolvedOptions ?? []) {
    if (!resolved.optionId) {
      continue;
    }

    resolvedByOptionId.set(resolved.optionId, cloneResolvedOption(resolved));
  }

  if (!product) {
    return buildResult({
      status: "invalid",
      source: input.source,
      resolvedOptions: [],
      freeTextNotes,
      rawOptionTexts,
      missingRequiredOptions: [],
      invalidValueTexts,
      ambiguousValueTexts,
      pricing: {
        unitBasePrice,
        optionsPriceDelta: 0,
        resolvedUnitPrice: unitBasePrice,
      },
      internalReasons: ["product_missing"],
    });
  }

  if (productOptions.length === 0) {
    return buildResult({
      status: "resolved",
      source: input.source,
      resolvedOptions: [],
      freeTextNotes,
      rawOptionTexts,
      missingRequiredOptions: [],
      invalidValueTexts,
      ambiguousValueTexts,
      pricing: {
        unitBasePrice,
        optionsPriceDelta: 0,
        resolvedUnitPrice: unitBasePrice,
      },
      internalReasons,
    });
  }

  applyImplicitRequiredSelections(productOptions, resolvedByOptionId);

  for (const rawOption of rawOptionTexts) {
    const optionCandidates = resolveOptionCandidates({
      productOptions,
      groupText: input.forcedOptionId ? undefined : rawOption.groupText,
      forcedOptionId: input.forcedOptionId,
      valueText: rawOption.valueText,
    });

    if (optionCandidates.kind === "ambiguous") {
      ambiguousValueTexts.push(rawOption.valueText);
      internalReasons.push("option_candidate_ambiguous");
      continue;
    }

    if (optionCandidates.kind === "none") {
      invalidValueTexts.push(rawOption.valueText);
      internalReasons.push("option_candidate_not_found");
      if (input.forcedOptionId) {
        invalidOptionIds.push(input.forcedOptionId);
      }
      continue;
    }

    const option = optionCandidates.option;
    const current = ensureResolvedOption(resolvedByOptionId, option);

    if (option.type === "text") {
      current.textValue = rawOption.valueText.trim();
      current.selectedValues = undefined;
      current.priceDelta = 0;
      continue;
    }

    const valueMatch = resolveValueForOption(option, rawOption.valueText);
    if (valueMatch.kind === "ambiguous") {
      ambiguousValueTexts.push(rawOption.valueText);
      internalReasons.push("option_value_ambiguous");
      if (option.id) {
        invalidOptionIds.push(option.id);
      }
      continue;
    }

    if (valueMatch.kind === "none") {
      invalidValueTexts.push(rawOption.valueText);
      internalReasons.push("option_value_not_found");
      if (option.id) {
        invalidOptionIds.push(option.id);
      }
      continue;
    }

    if (!valueMatch.value.isActive) {
      invalidValueTexts.push(rawOption.valueText);
      internalReasons.push("option_value_inactive");
      if (option.id) {
        invalidOptionIds.push(option.id);
      }
      continue;
    }

    addResolvedOptionValue(current, valueMatch.value);
  }

  const resolvedOptions = productOptions
    .map((option) => option.id ? resolvedByOptionId.get(option.id) : undefined)
    .filter((entry): entry is OrderLineItemResolvedOption => Boolean(entry));

  const missingRequiredOptions = productOptions.filter((option) => {
    const selected = option.id ? resolvedByOptionId.get(option.id) : undefined;
    return selectedCount(option, selected) < minimumRequiredSelections(option);
  });

  for (const option of productOptions) {
    const selected = option.id ? resolvedByOptionId.get(option.id) : undefined;
    const count = selectedCount(option, selected);
    if (option.maxSelect > 0 && count > option.maxSelect) {
      invalidValueTexts.push(option.name);
      internalReasons.push("option_max_exceeded");
      if (option.id) {
        invalidOptionIds.push(option.id);
      }
    }
  }

  const optionsPriceDelta = resolvedOptions.reduce((total, option) => total + option.priceDelta, 0);
  const nextOption = missingRequiredOptions[0] ?? productOptions.find((option) => option.id && invalidOptionIds.includes(option.id));
  const status =
    internalReasons.includes("product_missing")
      ? "invalid"
      : missingRequiredOptions.length > 0 || invalidValueTexts.length > 0 || ambiguousValueTexts.length > 0
        ? "needs_clarification"
        : "resolved";

  return buildResult({
    status,
    source: input.source,
    resolvedOptions,
    freeTextNotes,
    rawOptionTexts,
    missingRequiredOptions,
    invalidValueTexts: uniqueStrings(invalidValueTexts),
    ambiguousValueTexts: uniqueStrings(ambiguousValueTexts),
    nextOption,
    pricing: {
      unitBasePrice,
      optionsPriceDelta,
      resolvedUnitPrice: unitBasePrice + optionsPriceDelta,
    },
    internalReasons: uniqueStrings(internalReasons),
  });
}

export function buildOrderLineItemOptionsSnapshot(
  resolution: ProductConfigurationResolution,
): OrderLineItemOptionsSnapshot {
  return {
    mode: resolution.status === "resolved" ? "resolved" : "pending_clarification",
    source: resolution.source,
    rawOptionTexts: resolution.rawOptionTexts.length > 0 ? resolution.rawOptionTexts : undefined,
    resolvedOptions: resolution.resolvedOptions.length > 0 ? resolution.resolvedOptions : undefined,
    freeTextNotes: resolution.freeTextNotes.length > 0 ? resolution.freeTextNotes : undefined,
    pricing: resolution.pricing,
    validation: {
      status: resolution.status === "invalid" ? "invalid" : resolution.status === "resolved" ? "resolved" : "needs_clarification",
      missingRequiredOptionIds: resolution.missingRequiredOptions.map((option) => option.id).filter((entry): entry is string => Boolean(entry)),
      missingRequiredOptionNames: resolution.missingRequiredOptions.map((option) => option.name),
      invalidValueTexts: resolution.invalidValueTexts.length > 0 ? resolution.invalidValueTexts : undefined,
      ambiguousValueTexts: resolution.ambiguousValueTexts.length > 0 ? resolution.ambiguousValueTexts : undefined,
      reasons: resolution.internalReasons.length > 0 ? resolution.internalReasons : undefined,
    },
  };
}

export function shouldPersistConfigurationSnapshot(input: {
  menuItem: MenuItem;
  resolution: ProductConfigurationResolution;
}): boolean {
  const hasConfiguredProduct = (input.menuItem.product?.options?.length ?? 0) > 0;
  return hasConfiguredProduct || input.resolution.rawOptionTexts.length > 0 || input.resolution.freeTextNotes.length > 0;
}

export function formatResolvedOptionsInline(options: OrderLineItemOptionsSnapshot | undefined): string | undefined {
  if (!options?.resolvedOptions || options.resolvedOptions.length === 0) {
    return undefined;
  }

  const parts = options.resolvedOptions
    .map((option) => {
      const selectedValues = option.selectedValues?.map((value) => value.valueName).join(", ");
      const valueText = selectedValues ?? option.textValue;
      return valueText ? `${option.optionName}: ${valueText}` : undefined;
    })
    .filter((entry): entry is string => Boolean(entry));

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(" | ");
}

export function splitConfigurationAnswerTexts(answerText: string): string[] {
  return answerText
    .split(/\b(?:y|e)\b|,/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildResult(input: ProductConfigurationResolution): ProductConfigurationResolution {
  return input;
}

function resolveOptionCandidates(input: {
  productOptions: ProductOption[];
  groupText?: string;
  forcedOptionId?: string;
  valueText: string;
}): { kind: "single"; option: ProductOption } | { kind: "ambiguous" } | { kind: "none" } {
  if (input.forcedOptionId) {
    const forced = input.productOptions.find((option) => option.id === input.forcedOptionId);
    return forced ? { kind: "single", option: forced } : { kind: "none" };
  }

  if (input.groupText) {
    const matched = matchOptionsByText(input.productOptions, input.groupText);
    if (matched.length === 1) {
      const [option] = matched;
      if (option) {
        return { kind: "single", option };
      }
    }
    if (matched.length > 1) {
      return { kind: "ambiguous" };
    }
  }

  const matchedByValue = input.productOptions.filter((option) => {
    if (option.type === "text") {
      return false;
    }

    return resolveValueForOption(option, input.valueText).kind === "single";
  });

  if (matchedByValue.length === 1) {
    const [option] = matchedByValue;
    if (option) {
      return { kind: "single", option };
    }
  }

  if (matchedByValue.length > 1) {
    return { kind: "ambiguous" };
  }

  return { kind: "none" };
}

function matchOptionsByText(options: ProductOption[], text: string): ProductOption[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  return options.filter((option) => buildOptionCandidateTexts(option).some((candidate) => candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate)));
}

function buildOptionCandidateTexts(option: ProductOption): string[] {
  return uniqueStrings([
    normalizeText(option.id ?? ""),
    normalizeText(option.code ?? ""),
    normalizeText(option.name),
    ...((option.aliases ?? []).map(normalizeText)),
  ]).filter(Boolean);
}

function resolveValueForOption(
  option: ProductOption,
  valueText: string,
): { kind: "single"; value: ProductOptionValue } | { kind: "ambiguous" } | { kind: "none" } {
  const normalized = normalizeText(valueText);
  if (!normalized) {
    return { kind: "none" };
  }

  const exactMatches = option.values.filter((value) => buildValueCandidateTexts(value).includes(normalized));
  if (exactMatches.length === 1) {
    const [value] = exactMatches;
    if (value) {
      return { kind: "single", value };
    }
  }
  if (exactMatches.length > 1) {
    return { kind: "ambiguous" };
  }

  const partialMatches = option.values.filter((value) =>
    buildValueCandidateTexts(value).some((candidate) => candidate.includes(normalized) || normalized.includes(candidate)),
  );
  if (partialMatches.length === 1) {
    const [value] = partialMatches;
    if (value) {
      return { kind: "single", value };
    }
  }
  if (partialMatches.length > 1) {
    return { kind: "ambiguous" };
  }

  return { kind: "none" };
}

function buildValueCandidateTexts(value: ProductOptionValue): string[] {
  return uniqueStrings([
    normalizeText(value.id ?? ""),
    normalizeText(value.code ?? ""),
    normalizeText(value.name),
    ...((value.aliases ?? []).map(normalizeText)),
  ]).filter(Boolean);
}

function ensureResolvedOption(
  resolvedByOptionId: Map<string, OrderLineItemResolvedOption>,
  option: ProductOption,
): OrderLineItemResolvedOption {
  const optionId = option.id;
  if (!optionId) {
    return {
      optionName: option.name,
      optionType: option.type,
      selectedValues: [],
      priceDelta: 0,
    };
  }

  const existing = resolvedByOptionId.get(optionId);
  if (existing) {
    return existing;
  }

  const created: OrderLineItemResolvedOption = {
    optionId,
    optionCode: option.code,
    optionName: option.name,
    optionType: option.type,
    selectedValues: option.type === "text" ? undefined : [],
    priceDelta: 0,
  };
  resolvedByOptionId.set(optionId, created);
  return created;
}

function addResolvedOptionValue(
  option: OrderLineItemResolvedOption,
  value: ProductOptionValue,
): void {
  const selectedValues = option.selectedValues ?? [];
  if (selectedValues.some((entry) => entry.valueId === value.id || normalizeText(entry.valueName) === normalizeText(value.name))) {
    option.selectedValues = selectedValues;
    option.priceDelta = selectedValues.reduce((total, entry) => total + entry.priceDelta, 0);
    return;
  }

  selectedValues.push({
    valueId: value.id,
    valueCode: value.code,
    valueName: value.name,
    priceDelta: value.priceDelta,
  });
  option.selectedValues = selectedValues;
  option.priceDelta = selectedValues.reduce((total, entry) => total + entry.priceDelta, 0);
}

function applyImplicitRequiredSelections(
  productOptions: ProductOption[],
  resolvedByOptionId: Map<string, OrderLineItemResolvedOption>,
): void {
  for (const option of productOptions) {
    if (option.type === "text") {
      continue;
    }

    if (minimumRequiredSelections(option) !== 1 || option.maxSelect !== 1 || !option.id) {
      continue;
    }

    const current = resolvedByOptionId.get(option.id);
    if (selectedCount(option, current) > 0) {
      continue;
    }

    const activeValues = option.values.filter((value) => value.isActive);
    if (activeValues.length !== 1) {
      continue;
    }

    const [onlyActiveValue] = activeValues;
    if (!onlyActiveValue) {
      continue;
    }

    const resolved = ensureResolvedOption(resolvedByOptionId, option);
    addResolvedOptionValue(resolved, onlyActiveValue);
  }
}

function selectedCount(option: ProductOption, resolved: OrderLineItemResolvedOption | undefined): number {
  if (!resolved) {
    return 0;
  }

  if (option.type === "text") {
    return resolved.textValue?.trim() ? 1 : 0;
  }

  return resolved.selectedValues?.length ?? 0;
}

function minimumRequiredSelections(option: ProductOption): number {
  if (option.isRequired) {
    return Math.max(1, option.minSelect);
  }

  return option.minSelect;
}

function cloneResolvedOption(option: OrderLineItemResolvedOption): OrderLineItemResolvedOption {
  return {
    ...option,
    selectedValues: option.selectedValues ? [...option.selectedValues] : undefined,
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((entry) => entry.trim().length > 0)));
}
