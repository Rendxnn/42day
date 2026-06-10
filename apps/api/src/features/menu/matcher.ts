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

  if (segments.length <= 1) {
    const single = resolveMenuSelectionFromText(payload, text);
    return single ? [single] : [];
  }

  const resolved: Array<{ item: MenuItem; quantity: number }> = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const selection = resolveMenuSelectionFromText(payload, segment);
    if (!selection) {
      continue;
    }

    const key = selection.item.id;
    if (seen.has(key)) {
      const existing = resolved.find((entry) => entry.item.id === key);
      if (existing) {
        existing.quantity += selection.quantity;
      }
      continue;
    }

    seen.add(key);
    resolved.push(selection);
  }

  return resolved;
}

function computeMenuMatchScore(item: MenuItem, searchText: string): number {
  const candidateTexts = buildCandidateTexts(item).map(normalizeText);
  const searchTokens = tokenize(searchText);

  if (candidateTexts.includes(searchText)) {
    return 1;
  }

  for (const candidateText of candidateTexts) {
    const candidateTokens = tokenize(candidateText);
    if (candidateText.includes(searchText) || isReasonablePartialMatch(searchText, searchTokens, candidateText, candidateTokens)) {
      return 0.93;
    }
  }

  let bestScore = 0;
  for (const candidateText of candidateTexts) {
    const candidateTokens = tokenize(candidateText);
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
  const name = item.displayName ?? item.product?.name ?? "";
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

function singularizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function isReasonablePartialMatch(
  searchText: string,
  searchTokens: string[],
  candidateText: string,
  candidateTokens: string[],
): boolean {
  if (!searchText.includes(candidateText)) {
    return false;
  }

  if (candidateTokens.length === 0) {
    return false;
  }

  if (searchTokens.length <= candidateTokens.length + 2) {
    return true;
  }

  return candidateTokens.length >= 2 && searchTokens.length <= candidateTokens.length * 2;
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
