import type { MenuFileTypeInfo, SupportedMenuFileType } from "./types";

const supportedExtensions: Record<string, SupportedMenuFileType> = {
  ".csv": "csv",
  ".jpeg": "image",
  ".jpg": "image",
  ".pdf": "pdf",
  ".png": "image",
  ".txt": "txt",
  ".webp": "image",
  ".xls": "excel",
  ".xlsx": "excel",
};

export function detectMenuFileType(file: File): MenuFileTypeInfo | null {
  const name = file.name.toLowerCase();
  const extension = Object.keys(supportedExtensions).find((entry) => name.endsWith(entry)) ?? "";
  const mimeType = file.type || guessMimeType(extension);

  if (extension) {
    const kind = supportedExtensions[extension];
    if (!kind) return null;

    return {
      extension,
      kind,
      mimeType,
    };
  }

  const kind = detectByMimeType(mimeType);
  if (!kind) return null;

  return {
    extension,
    kind,
    mimeType,
  };
}

function detectByMimeType(mimeType: string): SupportedMenuFileType | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/csv") return "csv";
  if (mimeType.startsWith("text/")) return "txt";
  if (
    mimeType.includes("spreadsheet")
    || mimeType.includes("excel")
    || mimeType.includes("officedocument")
  ) {
    return "excel";
  }

  return null;
}

function guessMimeType(extension: string): string {
  return {
    ".csv": "text/csv",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".txt": "text/plain",
    ".webp": "image/webp",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[extension] ?? "application/octet-stream";
}
