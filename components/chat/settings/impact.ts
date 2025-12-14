export type ImpactLevel = "none" | "mayReduceMemory";

export type ImpactKey = "preset" | "reset" | "historyBudget" | "summary";

/**
 * Returns the impact level for a specific control.
 * In Phase 1, we mainly flag controls that might reduce context memory.
 */
export function getImpactBadgeForControl(controlId: string): ImpactLevel {
  switch (controlId) {
    case "preset":
    case "reset":
    case "historyBudget":
    case "summary":
      return "mayReduceMemory";
    default:
      return "none";
  }
}

/**
 * Returns the warning message to display in the inline banner
 * when a disruptive change occurs.
 */
export function getImpactWarningMessage(key: ImpactKey): string {
  switch (key) {
    case "preset":
      return "Changing the preset may reduce how much prior conversation is included in the next response.";
    case "reset":
      return "Resetting controls may reduce how much prior conversation is included in the next response.";
    case "historyBudget":
      return "Reducing the history budget may limit how much prior conversation is included in the next response.";
    case "summary":
      return "Enabling summary replacement may reduce exact conversation details available to the model.";
    default:
      return "This change may impact conversation context.";
  }
}
