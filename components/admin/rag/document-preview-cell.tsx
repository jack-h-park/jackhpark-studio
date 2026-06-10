import { FiFileText } from "@react-icons/all-files/fi/FiFileText";
import { type JSX, useEffect, useState } from "react";

import { pickDocumentPreviewSlot } from "@/lib/admin/document-preview";
import {
  buildPreviewSnippet,
  type DocumentDisplayInfo,
  type DocumentRow,
} from "@/lib/admin/rag-document-display";
import styles from "@/pages/admin/documents.module.css";

type DocumentPreviewOverlayProps = {
  doc: DocumentRow;
  info: DocumentDisplayInfo;
};

function DocumentPreviewOverlay({
  doc,
  info,
}: DocumentPreviewOverlayProps): JSX.Element {
  const snippet = buildPreviewSnippet(info.teaserText);
  const hasImagePreview = Boolean(info.previewImageUrl);
  const hasSnippet = Boolean(snippet);

  if (!hasImagePreview && !hasSnippet) {
    return (
      <div className={styles.previewOverlay}>
        <p className={styles.previewSubtitle}>No preview available.</p>
      </div>
    );
  }

  return (
    <div className={styles.previewOverlay}>
      {hasImagePreview ? (
        <>
          <div className={styles.previewImageWrap}>
            <img
              src={info.previewImageUrl}
              alt={doc.displayTitle}
              className={styles.previewImageFull}
              loading="lazy"
            />
          </div>
          <div className="space-y-1">
            <p className={styles.previewTitle}>{doc.displayTitle}</p>
            {info.subtitle ? (
              <p className={styles.previewSubtitle}>{info.subtitle}</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className={styles.previewTitle}>{doc.displayTitle}</p>
          <p className="admin-doc-preview-overlay-body">{snippet}</p>
        </div>
      )}
    </div>
  );
}

export type DocumentPreviewThumbnailProps = {
  doc: DocumentRow;
  info: DocumentDisplayInfo;
};

export function DocumentPreviewThumbnail({
  doc,
  info,
}: DocumentPreviewThumbnailProps): JSX.Element {
  const [coverFailed, setCoverFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const slot = pickDocumentPreviewSlot({
    previewImageUrl: coverFailed ? undefined : info.previewImageUrl,
    iconEmoji: info.iconEmoji,
    iconImageUrl: iconFailed ? undefined : info.iconImageUrl,
  });

  useEffect(() => {
    setCoverFailed(false);
  }, [doc.doc_id, info.previewImageUrl]);

  useEffect(() => {
    setIconFailed(false);
  }, [doc.doc_id, info.iconImageUrl]);

  const placeholderIcon = (
    <FiFileText
      aria-hidden="true"
      className="text-lg text-[color:var(--ai-text-muted)]"
    />
  );

  const renderSlot = () => {
    switch (slot.type) {
      case "previewImage":
        if (!slot.value) {
          break;
        }
        return (
          <img
            src={slot.value}
            alt={doc.displayTitle}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        );
      case "notionEmoji":
        return (
          <span className="text-2xl leading-tight">{slot.value ?? ""}</span>
        );
      case "iconImage":
        if (!slot.value) {
          break;
        }
        return (
          <img
            src={slot.value}
            alt={`${doc.displayTitle} icon`}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={() => setIconFailed(true)}
          />
        );
      default:
        return placeholderIcon;
    }

    return placeholderIcon;
  };

  return (
    <div className="flex justify-center">
      <div className={styles.thumbnailGroup}>
        <div className={styles.thumbnailBox}>{renderSlot()}</div>
        <DocumentPreviewOverlay doc={doc} info={info} />
      </div>
    </div>
  );
}
