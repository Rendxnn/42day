export type SemanticParserInput = {
  rawMessage: string;
  activeMenu: unknown;
};

export type SemanticParserResult = {
  candidate: unknown;
  missingFields: string[];
  confidence: number;
};

export async function parseFreeFormOrder(_input: SemanticParserInput): Promise<SemanticParserResult> {
  throw new Error("semantic_parser.not_configured");
}
