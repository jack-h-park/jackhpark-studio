export type ImpactKey = "preset" | "reset" | "historyBudget" | "summary";

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
