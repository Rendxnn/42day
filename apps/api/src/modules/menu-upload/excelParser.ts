import { read, utils } from "xlsx";
import { parseStructuredRows } from "./structuredRows";
import type { ParsedMenu } from "./types";

export async function parseExcelMenu(file: File): Promise<ParsedMenu> {
  const workbook = read(await file.arrayBuffer(), {
    cellDates: false,
    raw: false,
    type: "array",
  });
  const rows: string[][] = [];

  for (const sheetName of workbook.SheetNames.slice(0, 5)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const sheetRows = utils.sheet_to_json<string[]>(sheet, {
      blankrows: false,
      defval: "",
      header: 1,
      raw: false,
    });

    if (rows.length > 0 && sheetRows.length > 0) {
      rows.push([sheetName]);
    }

    rows.push(...sheetRows.map((row) => row.map((cell) => String(cell ?? ""))));
  }

  return parseStructuredRows({
    fileType: "excel",
    parser: "excelParser",
    rows,
  });
}
