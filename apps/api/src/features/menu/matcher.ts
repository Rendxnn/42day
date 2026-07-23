import type { MenuItem, TodayMenuPayload } from "@42day/types";

export function resolveMenuSelection(payload: TodayMenuPayload, selection: number): MenuItem | null {
  if (!Number.isInteger(selection) || selection < 1) {
    return null;
  }

  return payload.items[selection - 1] ?? null;
}

export function resolveMenuSelectionFromText(payload: TodayMenuPayload, text: string): { item: MenuItem; quantity: number } | null {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return null;
  }

  const quantity = extractQuantity(normalizedText);
  const searchText = stripQuantityAndNoise(normalizedText);
  if (!searchText) {
    return null;
  }

  const matches = payload.items
    .map((item) => ({
      item,
      score: computeMenuMatchScore(item, searchText),
    }))
    .filter((candidate) => candidate.score >= 0.75)
    .sort((left, right) => right.score - left.score);

  const best = matches[0];
  const second = matches[1];

  if (!best) {
    return null;
  }

  if (second && best.score - second.score < 0.1) {
    return null;
  }

  return {
    item: best.item,
    quantity,
  };
}

export function resolveMenuSelectionsFromText(payload: TodayMenuPayload, text: string): Array<{ item: MenuItem; quantity: number }> {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return [];
  }

  const segments = normalizedText
    .split(/\b(?:y|tambien|ademas)\b|,/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const resolved: Array<{ item: MenuItem; quantity: number }> = [];
  for (const segment of segments) {
    const selection = resolveMenuSelectionFromText(payload, segment);
    if (!selection) {
      continue;
    }

    addOrCombineSelection(resolved, selection);
  }

  // A customer often joins independent products with phrases such as
  // "con jugo". Matching every menu name mentioned in the message keeps that
  // beverage as its own order item instead of treating it as an invalid option
  // of the main dish. Existing segment matches take precedence, so we never
  // duplicate an item already understood from the message.
  for (const selection of resolveMentionedMenuItems(payload, normalizedText)) {
    if (resolved.some((entry) => entry.item.id === selection.item.id)) {
      continue;
    }
    resolved.push(selection);
  }

  return resolved;
}

function resolveMentionedMenuItems(payload: TodayMenuPayload, normalizedText: string): Array<{ item: MenuItem; quantity: number }> {
  const sourceTokens = normalizedText.split(/\s+/).filter(Boolean);
  const searchableTokens = sourceTokens
    .map((token, index) => ({ token: singularizeToken(token), index }))
    .filter(({ token }) => token.length > 1 && !isConnectorToken(token));
  const found: Array<{ item: MenuItem; quantity: number; index: number }> = [];

  for (const item of payload.items) {
    const candidate = buildMentionCandidateTexts(item)
      .map((value) => tokenize(value))
      .filter((tokens) => tokens.length > 0)
      .sort((left, right) => right.length - left.length)
      .find((tokens) => findTokenSequence(searchableTokens, tokens) !== null);
    if (!candidate) {
      continue;
    }

    const matchIndex = findTokenSequence(searchableTokens, candidate);
    if (matchIndex === null) {
      continue;
    }

    const originalIndex = searchableTokens[matchIndex]?.index ?? 0;
    found.push({
      item,
      quantity: findQuantityNearMention(sourceTokens, originalIndex),
      index: originalIndex,
    });
  }

  const occupiedRanges: Array<{ start: number; end: number }> = [];
  return found
    .sort((left, right) => right.index - left.index || getMenuItemName(right.item).length - getMenuItemName(left.item).length)
    .filter((candidate) => {
      const tokenCount = tokenize(getMenuItemName(candidate.item)).length;
      const end = candidate.index + Math.max(1, tokenCount) - 1;
      const overlaps = occupiedRanges.some((range) => candidate.index <= range.end && end >= range.start);
      if (overlaps) {
        return false;
      }
      occupiedRanges.push({ start: candidate.index, end });
      return true;
    })
    .sort((left, right) => left.index - right.index)
    .map(({ item, quantity }) => ({ item, quantity }));
}

function addOrCombineSelection(
  selections: Array<{ item: MenuItem; quantity: number }>,
  selection: { item: MenuItem; quantity: number },
): void {
  const existing = selections.find((entry) => entry.item.id === selection.item.id);
  if (existing) {
    existing.quantity += selection.quantity;
    return;
  }
  selections.push(selection);
}

function findTokenSequence(source: Array<{ token: string; index: number }>, candidate: string[]): number | null {
  if (candidate.length === 0 || candidate.length > source.length) {
    return null;
  }

  for (let start = 0; start <= source.length - candidate.length; start += 1) {
    const matches = candidate.every((token, offset) => source[start + offset]?.token === token);
    if (matches) {
      return start;
    }
  }

  return null;
}

function findQuantityNearMention(sourceTokens: string[], mentionIndex: number): number {
  for (let index = mentionIndex - 1; index >= Math.max(0, mentionIndex - 4); index -= 1) {
    const token = sourceTokens[index];
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      return Math.max(1, Number(token));
    }

    const spelled = {
      un: 1,
      una: 1,
      uno: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
    }[token];
    if (spelled) {
      return spelled;
    }
  }

  return 1;
}

function computeMenuMatchScore(item: MenuItem, searchText: string): number {
  const candidateTexts = buildCandidateTexts(item).map(normalizeText);

  if (candidateTexts.includes(searchText)) {
    return 1;
  }

  for (const candidateText of candidateTexts) {
    if (candidateText.includes(searchText) || searchText.includes(candidateText)) {
      return 0.93;
    }
  }

  let bestScore = 0;
  for (const candidateText of candidateTexts) {
    const candidateTokens = tokenize(candidateText);
    const searchTokens = tokenize(searchText);
    if (candidateTokens.length === 0 || searchTokens.length === 0) {
      continue;
    }

    const overlap = searchTokens.filter((token) => candidateTokens.includes(token)).length;
    const coverage = overlap / searchTokens.length;
    const candidateCoverage = overlap / candidateTokens.length;
    bestScore = Math.max(bestScore, coverage * 0.7 + candidateCoverage * 0.3);
  }

  return bestScore;
}

function buildCandidateTexts(item: MenuItem): string[] {
  const name = getMenuItemName(item);
  const normalizedName = normalizeText(name);
  const candidates = new Set<string>([
    normalizedName,
    ...(item.aliases ?? []).map(normalizeText),
    ...(item.product?.aliases ?? []).map(normalizeText),
  ]);

  if (normalizedName.includes("almuerzo del dia")) {
    candidates.add("menu del dia");
    candidates.add("almuerzo del dia");
    candidates.add("almuerzo");
  }

  if (normalizedName.includes("sopa del dia")) {
    candidates.add("sopa del dia");
    candidates.add("sopa");
  }

  return Array.from(candidates).filter(Boolean);
}

// Unlike the regular matcher, the mention scanner must not use broad
// convenience aliases such as "almuerzo". They are useful when the customer
// explicitly chooses a menu item, but would incorrectly detect an unrelated
// dish later in a sentence.
function buildMentionCandidateTexts(item: MenuItem): string[] {
  return Array.from(new Set([
    normalizeText(getMenuItemName(item)),
    ...(item.aliases ?? []).map(normalizeText),
    ...(item.product?.aliases ?? []).map(normalizeText),
  ])).filter(Boolean);
}

function getMenuItemName(item: MenuItem): string {
  return item.displayName ?? item.product?.name ?? "";
}

function extractQuantity(text: string): number {
  const directNumberMatch = text.match(/\b(\d+)\b/);
  if (directNumberMatch) {
    return Math.max(1, Number(directNumberMatch[1]));
  }

  const spelledNumbers: Record<string, number> = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
  };

  const matches = Object.entries(spelledNumbers)
    .map(([token, value]) => {
      const match = new RegExp(`\\b${token}\\b`).exec(text);
      return match ? { index: match.index, value } : null;
    })
    .filter((entry): entry is { index: number; value: number } => Boolean(entry))
    .sort((left, right) => left.index - right.index);

  if (matches[0]) {
    return matches[0].value;
  }

  return 1;
}

function stripQuantityAndNoise(text: string): string {
  return text
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis)\b/g, " ")
    .replace(/\b(porfa|por favor|quiero|me regalas|regalame|deme|dame|para|favor|pedido|porfis|domicilio|delivery|envio|recoger|retiro|pickup|tienda|pago|pagar|efectivo|cash|transferencia|transferir|nequi|daviplata)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => singularizeToken(token.trim()))
    .filter((token) => token.length > 1 && !["de", "del", "la", "el", "los", "las", "con"].includes(token));
}

function isConnectorToken(token: string): boolean {
  return ["de", "del", "la", "el", "los", "las", "con", "a", "al", "para", "por"].includes(token);
}

function singularizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
