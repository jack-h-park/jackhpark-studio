const CANONICAL_DOC_ID_REGEX = /^[0-9a-f]{32}$/;

export type DocIdentifiers = {
  canonicalId: string;
  rawId: string;
};

/**
 * Derive the canonical/normalized doc_id plus the original raw external ID.
 * canonicalId is lower(replace(rawId, '-', '')) and should be a 32-char hex string.
 */
export function deriveDocIdentifiers(rawId: string): DocIdentifiers {
  const trimmedRawId = rawId.trim();
  const canonicalId = trimmedRawId.replaceAll("-", "").toLowerCase();
  const isCanonicalValid = CANONICAL_DOC_ID_REGEX.test(canonicalId);

  if (!isCanonicalValid) {
    console.warn(
      "[doc-identifiers] derived canonicalId is not a 32-character lowercase hex string",
      { rawId: trimmedRawId, canonicalId },
    );
  }

  return {
    canonicalId,
    rawId: trimmedRawId,
  };
}
