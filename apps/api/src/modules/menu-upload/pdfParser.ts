import { parsePlainTextMenu } from "./txtParser";
import type { ParsedMenu } from "./types";

export async function parsePdfMenu(file: File): Promise<ParsedMenu> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractSelectablePdfText(bytes);
  const parsed = parsePlainTextMenu(text, "pdfParser");

  return {
    ...parsed,
    ambiguous: parsed.ambiguous || text.trim().length < 80,
    extractedText: text,
    fileType: "pdf",
    parser: "pdfParser",
    warnings: text.trim().length < 80
      ? [...parsed.warnings, "No se pudo extraer texto seleccionable suficiente del PDF."]
      : parsed.warnings,
  };
}

function extractSelectablePdfText(bytes: Uint8Array): string {
  const latin = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];

  for (const match of latin.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    chunks.push(decodePdfLiteral(match[0].replace(/\s*Tj$/, "")));
  }

  for (const match of latin.matchAll(/\[(.*?)\]\s*TJ/gs)) {
    const arrayBody = match[1] ?? "";
    for (const literal of arrayBody.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      chunks.push(decodePdfLiteral(literal[0]));
    }
    for (const hex of arrayBody.matchAll(/<([0-9a-fA-F\s]+)>/g)) {
      chunks.push(decodePdfHex(hex[1] ?? ""));
    }
  }

  for (const match of latin.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)) {
    chunks.push(decodePdfHex(match[1] ?? ""));
  }

  return chunks
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1");
}

function decodePdfHex(raw: string): string {
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return "";

  const bytes: number[] = [];
  for (let index = 0; index < cleaned.length; index += 2) {
    const byte = Number.parseInt(cleaned.slice(index, index + 2).padEnd(2, "0"), 16);
    if (Number.isFinite(byte)) bytes.push(byte);
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const chars: string[] = [];
    for (let index = 2; index < bytes.length; index += 2) {
      chars.push(String.fromCharCode(((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0)));
    }
    return chars.join("");
  }

  return new TextDecoder("latin1").decode(new Uint8Array(bytes));
}
