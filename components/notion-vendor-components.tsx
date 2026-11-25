"use client";
import dynamic from "next/dynamic";
import * as React from "react";
import ReactModal from "react-modal";
import { useNotionContext } from "react-notion-x";
import { Collection } from "react-notion-x/build/third-party/collection";
import { Equation } from "react-notion-x/build/third-party/equation";
import { Modal } from "react-notion-x/build/third-party/modal";
import { EmbeddedTweet, TweetNotFound, TweetSkeleton } from "react-tweet";

import type { ExtendedTweetRecordMap } from "@/lib/types";

import { NotionCode } from "./notion-code";

// Everything here needs the browser or is CPU-heavy to render (Prism, KaTeX,
// the collection views, react-modal, pdf.js, react-tweet). NotionPageBody imports this
// module only after hydration, so none of it is evaluated on the server.

const Pdf = dynamic(
  () => import("react-notion-x/build/third-party/pdf").then((m) => m.Pdf),
  { ssr: false },
);

function Tweet({ id }: { id: string }) {
  const { recordMap } = useNotionContext();
  const tweet = (recordMap as ExtendedTweetRecordMap)?.tweets?.[id];

  return (
    <React.Suspense fallback={<TweetSkeleton />}>
      {tweet ? <EmbeddedTweet tweet={tweet} /> : <TweetNotFound />}
    </React.Suspense>
  );
}

/** Exactly what react-notion-x hands its Collection override. */
type CollectionProps = React.ComponentProps<typeof Collection>;

function CollectionWithDescription(props: CollectionProps) {
  const { recordMap, components } = useNotionContext();
  // collection_id is absent from some block variants in notion-types.
  const collectionId = (props.block as { collection_id?: string } | undefined)
    ?.collection_id;
  const collection = collectionId
    ? recordMap?.collection?.[collectionId]?.value
    : undefined;
  // Notion collections carry a description; notion-types omits it.
  const description = (collection as { description?: unknown } | undefined)
    ?.description;
  // react-notion-x exposes Text on the components map without declaring it.
  const Text = (
    components as {
      Text?: React.ComponentType<{ value: unknown; block?: unknown }>;
    }
  ).Text;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const descRef = React.useRef<HTMLDivElement>(null);

  // 1. If no description, render original Collection to preserve layout
  if (!description) {
    return <Collection {...props} />;
  }

  // 2. If description exists, inject it after the header via DOM manipulation

  React.useEffect(() => {
    const container = containerRef.current;
    const desc = descRef.current;
    if (!container || !desc) return;

    const collectionEl = container.querySelector(".notion-collection");
    if (!collectionEl) return;

    // Standard Notion Structure: header -> view
    const header = collectionEl.querySelector(".notion-collection-header");

    if (header) {
      if (header.nextSibling !== desc) {
        header.after(desc);
      }
    } else {
      // Fallback: prepend if no header found
      if (collectionEl.firstChild !== desc) {
        collectionEl.prepend(desc);
      }
    }

    desc.style.display = "block";
  }, [description]);

  return (
    // No inline width: a block-level div already fills its parent, and an
    // inline width would override the wide-viewport breakout rules that widen
    // this wrapper past the reading column.
    <div ref={containerRef} className="notion-collection-container">
      <div
        ref={descRef}
        className="notion-collection-description"
        style={{ display: "none", marginTop: "0.5em", marginBottom: "1em" }}
      >
        {Text ? (
          <Text value={description} block={props.block} />
        ) : (
          <span>{JSON.stringify(description)}</span>
        )}
      </div>
      <Collection {...props} />
    </div>
  );
}

let modalInitialized = false;

/** Points react-modal at the page frame so it can hide it from screen readers. */
export function initModalAppElement() {
  if (modalInitialized) return;
  const el = document.querySelector(".notion-frame") || document.body;
  ReactModal.setAppElement(el as HTMLElement);
  modalInitialized = true;
}

export const vendorComponents = {
  Code: NotionCode,
  Collection: CollectionWithDescription,
  Equation,
  Pdf,
  Modal,
  Tweet,
};

export type VendorComponents = typeof vendorComponents;
