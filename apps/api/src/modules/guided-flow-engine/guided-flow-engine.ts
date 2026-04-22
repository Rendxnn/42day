export type GuidedFlowResult = {
  responseText: string;
  nextState?: string;
};

export function getInitialGuidedFlowResponse(): GuidedFlowResult {
  return {
    responseText: "Perfecto. Te muestro el menu del dia y vamos armando el pedido paso a paso.",
    nextState: "awaiting_guided_item_selection",
  };
}
