import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import pMap from "p-map";

import type { NotionPageImage } from "./notion-images";
import { getOpenAIClient } from "../core/openai";
import { debugIngestionLog } from "./debug";

const CAPTIONS_TABLE = "rag_image_captions";
const CAPTION_CONCURRENCY = 2;
const CAPTION_MAX_TOKENS = 300;

export const IMAGE_CAPTION_MODEL =
  process.env.IMAGE_CAPTION_MODEL ?? "gpt-4o-mini";

// Off by default: turning this on changes the content hash of image-bearing
// documents (a deliberate one-time churn) and starts calling the VLM.
export function isImageChunksEnabled(): boolean {
  return (process.env.IMAGE_CHUNKS_ENABLED ?? "false").toLowerCase() === "true";
}

const DEFAULT_IMAGE_CHUNK_DOC_TYPES = "project_article,kb_article";

/**
 * Photography/gallery docs carry one hero photo each that is already served
 * by preview_image_url; captioning only pays off for article diagrams and
 * screenshots. Allowlist is doc_type based and env-overridable.
 */
export function shouldCaptionDocType(docType: string | null | undefined): boolean {
  if (!docType) {
    return false;
  }
  const allowlist = (
    process.env.IMAGE_CHUNKS_DOC_TYPES ?? DEFAULT_IMAGE_CHUNK_DOC_TYPES
  )
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return allowlist.includes(docType.trim().toLowerCase());
}

export type CaptionedImage = {
  image: NotionPageImage;
  caption: string;
  fromCache: boolean;
};

/**
 * Cache key is the image URL ONLY, deliberately excluding surrounding text:
 * Notion attachment URLs embed the attachment id, so replacing an image
 * always changes the URL while text-only edits leave it untouched. Context
 * (heading/paragraph) still influences the generated caption on a miss, and
 * lives in the chunk text — which re-embeds cheaply with the page flow.
 */
export function imageUrlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function buildCaptionPrompt(image: NotionPageImage, docTitle: string): string {
  const contextLines = [
    `Article: ${docTitle}`,
    image.nearestHeading ? `Section: ${image.nearestHeading}` : null,
    image.precedingText ? `Preceding text: ${image.precedingText}` : null,
    image.notionCaption ? `Author caption: ${image.notionCaption}` : null,
  ].filter(Boolean);

  return [
    "Describe this image for a search index over a technical portfolio site.",
    "Cover: what it depicts, any text visible in the image (labels, titles, UI text), and its type (diagram, screenshot, chart, photo).",
    "Write 2-4 dense sentences. No preamble.",
    "",
    ...contextLines,
  ].join("\n");
}

async function generateCaption(
  image: NotionPageImage,
  docTitle: string,
): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: IMAGE_CAPTION_MODEL,
    max_tokens: CAPTION_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildCaptionPrompt(image, docTitle) },
          {
            type: "image_url",
            // "high" detail: diagrams/screenshots only become retrievable if
            // the model can read the text inside them.
            image_url: { url: image.url, detail: "high" },
          },
        ],
      },
    ],
  });

  const caption = response.choices[0]?.message?.content?.trim();
  if (!caption) {
    throw new Error("Caption model returned empty content");
  }
  return caption;
}

/**
 * Resolve captions for a page's images, generating (and persisting) only the
 * cache misses. Per-image failures are logged and dropped rather than
 * failing the document ingest — a missing image chunk is strictly better
 * than a failed page.
 */
export async function captionImagesWithCache({
  images,
  docId,
  docTitle,
  supabase,
}: {
  images: NotionPageImage[];
  docId: string;
  docTitle: string;
  supabase: SupabaseClient;
}): Promise<CaptionedImage[]> {
  if (images.length === 0) {
    return [];
  }

  const hashes = images.map((image) => imageUrlHash(image.url));
  const cached = new Map<string, string>();
  const { data, error } = await supabase
    .from(CAPTIONS_TABLE)
    .select("image_url_hash, caption")
    .in("image_url_hash", hashes);
  if (error) {
    // Cache being unreachable should not disable captioning entirely,
    // but surface it: every image will regenerate (and re-insert below).
    console.warn("[rag:image-captions] cache lookup failed", {
      docId,
      message: error.message,
    });
  }
  for (const row of data ?? []) {
    cached.set(row.image_url_hash as string, row.caption as string);
  }

  const results = await pMap(
    images,
    async (image, index): Promise<CaptionedImage | null> => {
      const hash = hashes[index]!;
      const cachedCaption = cached.get(hash);
      if (cachedCaption) {
        return { image, caption: cachedCaption, fromCache: true };
      }

      try {
        const caption = await generateCaption(image, docTitle);
        const { error: insertError } = await supabase
          .from(CAPTIONS_TABLE)
          .upsert({
            image_url_hash: hash,
            image_url: image.url,
            caption,
            model: IMAGE_CAPTION_MODEL,
          });
        if (insertError) {
          console.warn("[rag:image-captions] cache write failed", {
            docId,
            message: insertError.message,
          });
        }
        return { image, caption, fromCache: false };
      } catch (err) {
        console.warn("[rag:image-captions] caption generation failed", {
          docId,
          url: image.url.slice(0, 120),
          message: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    { concurrency: CAPTION_CONCURRENCY },
  );

  const captioned = results.filter(
    (entry): entry is CaptionedImage => entry !== null,
  );
  debugIngestionLog("image-captions", {
    docId,
    total: images.length,
    fromCache: captioned.filter((entry) => entry.fromCache).length,
    generated: captioned.filter((entry) => !entry.fromCache).length,
    failed: images.length - captioned.length,
  });
  return captioned;
}

/**
 * The chunk text that gets embedded and, at answer time, shown to the LLM.
 * Prefixed so both retrieval filters and the prompt can recognize image
 * chunks without extra metadata plumbing.
 */
export function buildImageChunkText(entry: CaptionedImage): string {
  const { image, caption } = entry;
  return [
    "[Image]",
    caption,
    image.nearestHeading ? `Section: ${image.nearestHeading}` : null,
    image.notionCaption ? `Caption: ${image.notionCaption}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
