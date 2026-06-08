import type { ApiBindings } from "../../lib/bindings";
import { interpretMenuWithAi } from "./aiMenuInterpreter";
import { parseCsvMenu } from "./csvParser";
import { parseExcelMenu } from "./excelParser";
import { detectMenuFileType } from "./fileTypeDetector";
import { normalizeMenu } from "./menuNormalizer";
import { parsePdfMenu } from "./pdfParser";
import { parseTxtMenu } from "./txtParser";
import { countParsedItems, validateParsedMenu } from "./validationService";
import type { MenuAnalysisResult, ParsedMenu } from "./types";

export async function processMenuFile(input: {
  env: ApiBindings;
  file: File;
}): Promise<MenuAnalysisResult> {
  const fileType = detectMenuFileType(input.file);
  if (!fileType) {
    throw new Error("unsupported_menu_file_type");
  }

  let deterministic: ParsedMenu | null = null;

  if (fileType.kind === "excel") deterministic = await parseExcelMenu(input.file);
  if (fileType.kind === "csv") deterministic = await parseCsvMenu(input.file);
  if (fileType.kind === "txt") deterministic = await parseTxtMenu(input.file);
  if (fileType.kind === "pdf") deterministic = await parsePdfMenu(input.file);

  if (deterministic) {
    const validated = validateParsedMenu(deterministic);
    if (!shouldUseAiFallback(validated)) {
      const normalized = normalizeMenu(validated);
      return {
        ...normalized,
        fileType: fileType.kind,
        needsAiFallback: false,
        parser: validated.parser,
        source: "deterministic",
        warnings: validated.warnings,
      };
    }

    const aiParsed = validateParsedMenu(await interpretMenuWithAi({
      env: input.env,
      extractedText: validated.extractedText,
      file: fileType.kind === "pdf" ? input.file : undefined,
      fileType,
      previousWarnings: validated.warnings,
    }));
    const normalized = normalizeMenu(aiParsed);
    return {
      ...normalized,
      fileType: fileType.kind,
      needsAiFallback: true,
      parser: aiParsed.parser,
      source: "ai",
      warnings: aiParsed.warnings,
    };
  }

  if (fileType.kind === "image") {
    const aiParsed = validateParsedMenu(await interpretMenuWithAi({
      env: input.env,
      file: input.file,
      fileType,
    }));
    const normalized = normalizeMenu(aiParsed);
    return {
      ...normalized,
      fileType: fileType.kind,
      needsAiFallback: true,
      parser: aiParsed.parser,
      source: "ai",
      warnings: aiParsed.warnings,
    };
  }

  throw new Error("unsupported_menu_file_type");
}

function shouldUseAiFallback(parsed: ParsedMenu): boolean {
  if (parsed.ambiguous) return true;
  const itemCount = countParsedItems(parsed.categories);
  if (itemCount === 0) return true;

  const pricedCount = parsed.categories.reduce(
    (sum, category) => sum + category.items.filter((item) => item.price !== undefined && item.price >= 0).length,
    0,
  );
  return itemCount >= 3 && pricedCount / itemCount < 0.75;
}
