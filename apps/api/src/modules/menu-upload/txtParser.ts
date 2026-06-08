import { parseMenuTextLines } from "./structuredRows";
import type { ParsedMenu } from "./types";

export async function parseTxtMenu(file: File): Promise<ParsedMenu> {
  const text = await file.text();
  return parseMenuTextLines({
    fileType: "txt",
    parser: "txtParser",
    text,
  });
}

export function parsePlainTextMenu(text: string, parser = "textExtractor"): ParsedMenu {
  return parseMenuTextLines({
    fileType: "txt",
    parser,
    text,
  });
}
