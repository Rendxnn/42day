import type { ProductOption } from "@42day/types";

export type SupportedMenuFileType = "image" | "excel" | "csv" | "pdf" | "txt";

export type MenuFileTypeInfo = {
  extension: string;
  kind: SupportedMenuFileType;
  mimeType: string;
};

export type RawMenuOptionValue = {
  name: string;
  price?: number;
};

export type RawMenuOption = {
  name: string;
  values: RawMenuOptionValue[];
};

export type RawMenuItem = {
  available?: boolean;
  category?: string;
  confidence?: number;
  currency?: string;
  description?: string;
  name?: string;
  options?: RawMenuOption[];
  price?: number;
  source?: string;
};

export type RawMenuCategory = {
  items: RawMenuItem[];
  name: string;
};

export type ParsedMenu = {
  ambiguous: boolean;
  categories: RawMenuCategory[];
  extractedText?: string;
  fileType: SupportedMenuFileType;
  parser: string;
  source: "deterministic" | "ai";
  warnings: string[];
};

export type NormalizedMenuProduct = {
  basePrice: number;
  category: string;
  confidence?: number;
  currency?: string;
  description?: string;
  emoji?: string;
  isAvailable?: boolean;
  name: string;
  options?: ProductOption[];
  productType?: "simple" | "composite";
};

export type MenuAnalysisResult = {
  categories: Array<{
    items: NormalizedMenuProduct[];
    name: string;
  }>;
  fileType: SupportedMenuFileType;
  needsAiFallback: boolean;
  parser: string;
  products: NormalizedMenuProduct[];
  source: "deterministic" | "ai";
  warnings: string[];
};
