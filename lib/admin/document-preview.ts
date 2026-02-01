export type DocumentPreviewSlotType =
  | "previewImage"
  | "notionEmoji"
  | "iconImage"
  | "placeholder";

export type DocumentPreviewSlot = {
  type: DocumentPreviewSlotType;
  value?: string;
};

export type DocumentPreviewCandidates = {
  previewImageUrl?: string;
  iconEmoji?: string;
  iconImageUrl?: string;
};

export function pickDocumentPreviewSlot({
  previewImageUrl,
  iconEmoji,
  iconImageUrl,
}: DocumentPreviewCandidates): DocumentPreviewSlot {
  if (previewImageUrl) {
    return { type: "previewImage", value: previewImageUrl };
  }

  if (iconEmoji) {
    return { type: "notionEmoji", value: iconEmoji };
  }

  if (iconImageUrl) {
    return { type: "iconImage", value: iconImageUrl };
  }

  return { type: "placeholder" };
}
