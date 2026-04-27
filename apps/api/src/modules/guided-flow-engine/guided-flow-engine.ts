export type GuidedFlowResult = {
  responseText: string;
  nextState?: string;
};

export function getInitialGuidedFlowResponse(): GuidedFlowResult {
  return {
    responseText: "Te dejo el menu disponible para que arranquemos.",
    nextState: "awaiting_guided_item_selection",
  };
}
