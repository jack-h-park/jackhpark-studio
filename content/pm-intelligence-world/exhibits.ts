import type { PlayDestination } from "./activities";

export const exhibitDefinitions: Record<
  PlayDestination,
  { title: string; slots: string[]; caption: string }
> = {
  writing: {
    title: "The argument press",
    slots: ["Observation", "Interpretation", "Bounded claim"],
    caption:
      "Assemble three layers. The press keeps the limits alongside the claim.",
  },
  questions: {
    title: "The provenance instrument",
    slots: ["Source anchor", "Linked draft"],
    caption:
      "Reconnect the evidence before preparing an answer for human review.",
  },
  learning: {
    title: "The learning garden",
    slots: ["Demand", "Sourced study", "Reviewed practice"],
    caption:
      "Grow a practice record. Growth here marks exercise progress, not proficiency.",
  },
  decisions: {
    title: "The judgment desk",
    slots: ["Next step", "Reason", "Review trigger"],
    caption:
      "Keep a revisitable judgment. The instrument does not choose for you.",
  },
};
export const decisionTradeoffs: Record<string, string> = {
  verify:
    "A recovery test can reduce uncertainty; rollout waits while the team gathers evidence.",
  revise:
    "A recovery flow narrows the scope; other planned work may need to wait.",
  hold: "Waiting limits immediate exposure; it also delays learning from actual use.",
  proceed:
    "A bounded pilot can create learning; someone must own its limits and review trigger.",
};

export const instrumentActions: Record<
  PlayDestination,
  { label: string; hint: string }
> = {
  writing: {
    label: "Press the argument",
    hint: "Choose a card, then tap the brass press to set this layer.",
  },
  questions: {
    label: "Turn the provenance dial",
    hint: "Choose an anchor, then drag the dial sideways or tap to connect it.",
  },
  learning: {
    label: "Water this learning step",
    hint: "Choose a step, then hold and release the watering can to grow the record.",
  },
  decisions: {
    label: "Turn the judgment dial",
    hint: "Choose a next step, then turn the dial sideways or tap. A reason and review trigger still need your review.",
  },
};
