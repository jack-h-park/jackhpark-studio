"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
//import { useRouter } from 'next/router'
import { type PageBlock } from "notion-types";
import {
  formatDate,
  getBlockTitle,
  getPageProperty,
  parsePageId,
} from "notion-utils";
import * as React from "react";
import BodyClassName from "react-body-classname";
import { type NotionComponents, useNotionContext } from "react-notion-x";
import { EmbeddedTweet, TweetNotFound, TweetSkeleton } from "react-tweet";
import { useSearchParam } from "react-use";

import type * as types from "@/lib/types";
import * as config from "@/lib/config";
import { mapImageUrl } from "@/lib/map-image-url";
import { getCanonicalPageUrl, mapPageUrl } from "@/lib/map-page-url";
import { useDarkMode } from "@/lib/use-dark-mode";
import { useSidePeek } from "@/lib/use-side-peek";

import { ChatPanel } from "./ChatPanel";
import { Footer } from "./Footer";
//import { GitHubShareButton } from './GitHubShareButton'
import { Loading } from "./Loading";
import { NotionPageHeader } from "./NotionPageHeader";
import { NotionPageRenderer } from "./NotionPageRenderer";
import { Page404 } from "./Page404";
import { PageAside } from "./PageAside";
import { PageHead } from "./PageHead";
import { SidePeek } from "./SidePeek";

// --- Gallery preview eligibility -------------------------------------------
// Limit image-preview modal to specific inline database (collection) IDs only.
// Provide these IDs (block IDs) in `site.config.ts` as `galleryPreviewDatabaseIds`.
// IDs may include dashes; they will be normalized (dashes removed) before comparison.
const normalizeId = (id?: string | null) => (id ? id.replaceAll('-', "") : "");
const PREVIEW_DATABASE_IDS = new Set<string>(
  ((config as any)?.galleryPreviewDatabaseIds ?? []).map((id: string) =>
    normalizeId(id),
  ),
);

if (process.env.NODE_ENV !== "production") {
  console.debug(
    "[GalleryPreview] PREVIEW_DATABASE_IDS size:",
    PREVIEW_DATABASE_IDS.size,
    Array.from(PREVIEW_DATABASE_IDS).slice(0, 5),
  );
}

// Traverse up to find the nearest Notion block ID, from `data-block-id` or class `notion-block-<id>`
const getEnclosingBlockId = (start: Element | null): string | null => {
  let el = start as HTMLElement | null;
  const classIdRegex = /\bnotion-block-([a-f0-9]{32})\b/i;
  while (el && el !== document.body) {
    // 1) attribute-based
    const attrId = el.getAttribute?.("data-block-id");
    if (attrId) return attrId;
    // 2) className-based (react-notion-x sometimes uses notion-block-<id>)
    const cls = el.className?.toString?.() ?? "";
    const m = classIdRegex.exec(cls);
    if (m && m[1]) return m[1];
    el = el.parentElement as HTMLElement | null;
  }
  return null;
};

// Mark/unmark gallery views inside whitelisted collections for gallery image preview (for CSS scoping)
const markPreviewEligibleCollections = () => {
  const collections = Array.from(
    document.querySelectorAll<HTMLElement>(".notion-collection"),
  );
  for (const col of collections) {
    const id =
      col.dataset.blockId ||
      (/\bnotion-block-([a-f0-9]{32})\b/i.exec(col.className)?.[1] ?? null);
    const normalized = normalizeId(id);
    const galleryViews = Array.from(
      col.querySelectorAll<HTMLElement>(".notion-gallery-view"),
    );
    const shouldMark =
      !!normalized &&
      PREVIEW_DATABASE_IDS.has(normalized) &&
      galleryViews.length > 0;
    for (const gv of galleryViews) {
      if (shouldMark) {
        if (!Object.hasOwn(gv.dataset, "galleryPreview")) {
          gv.dataset.galleryPreview = "1";
        }
      } else if (Object.hasOwn(gv.dataset, "galleryPreview")) {
        delete gv.dataset.galleryPreview;
      }
    }
  }
  if (process.env.NODE_ENV !== "production") {
    const count = document.querySelectorAll(
      '.notion-gallery-view[data-gallery-preview="1"]',
    ).length;
    console.debug("[GalleryPreview] marked gallery views:", count);
  }
};

// -----------------------------------------------------------------------------
// dynamic imports for optional components
// -----------------------------------------------------------------------------

const Code = dynamic(() =>
  import("react-notion-x/build/third-party/code").then(async (m) => {
    // add / remove any prism syntaxes here
    await Promise.allSettled([
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-markup-templating.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-markup.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-bash.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-c.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-cpp.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-csharp.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-docker.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-java.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-js-templates.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-coffeescript.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-diff.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-git.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-go.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-graphql.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-handlebars.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-less.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-makefile.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-markdown.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-objectivec.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-ocaml.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-python.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-reason.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-rust.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-sass.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-scss.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-solidity.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-sql.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-stylus.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-swift.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-wasm.js"),
      // @ts-expect-error Ignore prisma types
      import("prismjs/components/prism-yaml.js"),
    ]);
    return m.Code;
  }),
);

const Collection = dynamic(() =>
  import("react-notion-x/build/third-party/collection").then(
    (m) => m.Collection,
  ),
);
const Equation = dynamic(() =>
  import("react-notion-x/build/third-party/equation").then((m) => m.Equation),
);
const Pdf = dynamic(
  () => import("react-notion-x/build/third-party/pdf").then((m) => m.Pdf),
  {
    ssr: false,
  },
);
const Modal = dynamic(
  () =>
    import("react-notion-x/build/third-party/modal").then((m) => {
      m.Modal.setAppElement(".notion-viewport");
      return m.Modal;
    }),
  {
    ssr: false,
  },
);

function Tweet({ id }: { id: string }) {
  const { recordMap } = useNotionContext();
  const tweet = (recordMap as types.ExtendedTweetRecordMap)?.tweets?.[id];

  return (
    <React.Suspense fallback={<TweetSkeleton />}>
      {tweet ? <EmbeddedTweet tweet={tweet} /> : <TweetNotFound />}
    </React.Suspense>
  );
}

const propertyLastEditedTimeValue = (
  { block, pageHeader }: any,
  defaultFn: () => React.ReactNode,
) => {
  if (pageHeader && block?.last_edited_time) {
    return `Last updated ${formatDate(block?.last_edited_time, {
      month: "long",
    })}`;
  }

  return defaultFn();
};

const propertyDateValue = (
  { data, schema, pageHeader }: any,
  defaultFn: () => React.ReactNode,
) => {
  console.log("🤪 propertyDateValue called:", schema?.name, schema?.type);

  if (pageHeader && schema?.name?.toLowerCase() === "published") {
    const publishDate = data?.[0]?.[1]?.[0]?.[1]?.start_date;

    if (publishDate) {
      return `${formatDate(publishDate, {
        month: "long",
      })}`;
    }
  }

  return defaultFn();
};

const propertyTextValue = (
  { schema, pageHeader, data, block, value }: any,
  defaultFn: () => React.ReactNode,
) => {
  // ✅ Bold the 'author' field in the page header
  if (pageHeader && schema?.name?.toLowerCase() === "author") {
    return <b>{defaultFn()}</b>;
  }

  // ✅ Apply CleanText (including inline DB text cells)
  const raw =
    value ??
    data ??
    block?.properties?.[schema?.id] ??
    schema?.name ??
    defaultFn()?.toString() ??
    "";

  console.log("[propertyTextValue → CleanText]", {
    schemaName: schema?.name,
    raw,
  });
  return <CleanText text={raw} />;
};

console.log("[Injecting CleanText]");
// Safer text renderer: normalize react-notion-x rich text → plain inline text
function renderRichText(item: any): string {
  if (!Array.isArray(item)) return typeof item === "string" ? item : "";
  const [text, decorations]: [string, any[]] = item as [string, any[]];
  if (!decorations || !Array.isArray(decorations) || decorations.length === 0)
    return text;

  let html: string = text;
  for (const deco of decorations) {
    if (!Array.isArray(deco)) continue;
    const [type, value] = deco as [string, string | undefined];
    switch (type) {
      case "b":
        html = `<b>${html}</b>`;
        break;
      case "i":
        html = `<i>${html}</i>`;
        break;
      case "u":
        html = `<u>${html}</u>`;
        break;
      case "s":
        html = `<s>${html}</s>`;
        break;
      case "a":
        html = `<a href="${value ?? "#"}" target="_blank" rel="noopener noreferrer">${html}</a>`;
        break;
      case "c":
        html = `<code>${html}</code>`;
        break;
    }
  }
  return html;
}

function CleanText(props: any) {
  const raw: any = props?.value ?? props?.text ?? props?.children ?? "";
  console.log("[CleanText called]", props);
  let html = "";
  try {
    if (Array.isArray(raw)) {
      html = raw.map((r) => renderRichText(r)).join("");
    } else if (typeof raw === "string") {
      html = raw;
    } else if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as any).plain_text === "string"
    ) {
      html = (raw as any).plain_text;
    } else {
      html = String(raw);
    }
  } catch (err) {
    console.warn("[CleanText error]", err);
  }

  html = html
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");

  console.log("[HTML preview]", html);

  return (
    <span data-clean-text="1" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

type GalleryPreviewState = {
  src: string;
  alt: string;
  title?: string;
  href?: string;
};

type NotionImageProps = Omit<React.ComponentPropsWithoutRef<"img">, "ref"> & {
  priority?: boolean;
  placeholder?: "blur" | string;
  blurDataURL?: string;
};

const NotionImage = React.forwardRef<HTMLImageElement, NotionImageProps>(
  (
    {
      priority: _priority,
      placeholder: _placeholder,
      blurDataURL,
      loading,
      style,
      ...rest
    },
    ref,
  ) => {
    const mergedStyle =
      _placeholder === "blur" && blurDataURL
        ? {
            ...style,
            backgroundImage: `url(${blurDataURL})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : style;

    return (
      <img
        {...rest}
        ref={ref}
        loading={loading ?? "lazy"}
        style={mergedStyle}
      />
    );
  },
);

NotionImage.displayName = "NotionImage";

export function NotionPage({
  site,
  recordMap,
  canonicalPageMap,
  error,
  pageId,
}: types.PageProps) {
  //const router = useRouter()
  const lite = useSearchParam("lite");

  const {
    isPeekOpen,
    peekRecordMap,
    isLoading: isPeekLoading,
    handleOpenPeek,
    handleClosePeek,
  } = useSidePeek();

  const [galleryPreview, setGalleryPreview] =
    React.useState<GalleryPreviewState | null>(null);

  const [isZoomed, setIsZoomed] = React.useState(false);

  const handleOpenGalleryPreview = React.useCallback(
    (preview: GalleryPreviewState) => {
      console.log("[GalleryPreview] open modal request", preview);
      setGalleryPreview(preview);
    },
    [],
  );

  const handleCloseGalleryPreview = React.useCallback(() => {
    console.log("[GalleryPreview] close modal request");
    setGalleryPreview(null);
    setIsZoomed(false); // Reset zoom state
  }, []);

  const handleToggleZoom = React.useCallback(() => {
    setIsZoomed((prev) => !prev);
  }, []);

  const resolvePageIdFromHref = React.useCallback(
    (href: string | null | undefined): string | null => {
      if (!href) return null;

      const normalized = href.replaceAll(/^\/+/g, "").replaceAll(/\/+$/g, "");
      return parsePageId(normalized) || canonicalPageMap?.[normalized] || null;
    },
    [canonicalPageMap],
  );

  const getPageBlock = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      const plainId = id.replaceAll("-", "");
      return (
        recordMap?.block?.[id]?.value ??
        recordMap?.block?.[plainId]?.value ??
        null
      );
    },
    [recordMap],
  );

  React.useEffect(() => {
    if (!galleryPreview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseGalleryPreview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [galleryPreview, handleCloseGalleryPreview]);

  React.useEffect(() => {
    const handleGalleryClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest(
        "a.notion-collection-card",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;

      // Whitelist check: only intercept clicks for specific inline database (collection) IDs
      const collectionBlockId = getEnclosingBlockId(anchor);
      const normalizedCollectionId = normalizeId(collectionBlockId);
      if (process.env.NODE_ENV !== "production") {
        console.debug(
          "[GalleryClick] collectionBlockId:",
          collectionBlockId,
          "normalized:",
          normalizedCollectionId,
          "whitelisted:",
          PREVIEW_DATABASE_IDS.has(normalizedCollectionId),
        );
      }
      const isPrimaryClick =
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey;
      if (
        !normalizedCollectionId ||
        !PREVIEW_DATABASE_IDS.has(normalizedCollectionId)
      ) {
        // Not a whitelisted gallery:
        // - For gallery cards, stop propagation so SidePeek doesn't hijack,
        //   but DO NOT preventDefault so the browser performs normal navigation.
        if (anchor.closest(".notion-gallery-view") && isPrimaryClick) {
          event.stopPropagation();
        }
        return;
      }

      if (!anchor.closest(".notion-gallery-view")) {
        return;
      }

      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const href = anchor.getAttribute("href") || "";
      const pageId = resolvePageIdFromHref(href);

      let previewSrc: string | null = null;

      const coverRoot = anchor.querySelector<HTMLElement>(
        ".notion-collection-card-cover",
      );
      const imageElement = coverRoot?.querySelector<HTMLImageElement>("img");
      const sourceElement =
        coverRoot?.querySelector<HTMLSourceElement>("source") ?? null;

      if (imageElement) {
        previewSrc =
          imageElement.dataset?.src ||
          imageElement.currentSrc ||
          imageElement.getAttribute("src") ||
          null;
      }

      if (!previewSrc && sourceElement) {
        const srcSet = sourceElement.getAttribute("srcset");
        if (srcSet) {
          const first = srcSet.trim().split(/\s+/)[0];
          if (first) {
            previewSrc = first;
          }
        }
      }

      if (!previewSrc && coverRoot) {
        const backgroundHost =
          coverRoot.querySelector<HTMLElement>('[style*="background-image"]') ||
          coverRoot;

        const inlineBackground =
          backgroundHost.style?.backgroundImage ||
          coverRoot.style?.backgroundImage ||
          "";

        const computedBackground =
          inlineBackground && inlineBackground !== "none"
            ? inlineBackground
            : window
                .getComputedStyle(backgroundHost)
                .getPropertyValue("background-image");

        const backgroundMatch =
          computedBackground && computedBackground !== "none"
            ? /url\((['"]?)(.+?)\1\)/i.exec(computedBackground)
            : null;

        if (backgroundMatch && backgroundMatch[2]) {
          previewSrc = backgroundMatch[2];
        } else {
          const dataBackground =
            backgroundHost.dataset?.src || coverRoot.dataset?.src;
          if (dataBackground) {
            previewSrc = dataBackground;
          }
        }
      }

      if (!previewSrc && pageId) {
        const pageBlock = getPageBlock(pageId);
        const pageCover = pageBlock?.format?.page_cover;
        if (pageBlock && pageCover) {
          previewSrc = mapImageUrl
            ? mapImageUrl(pageCover, pageBlock)
            : pageCover;
        }
      }

      const titleText =
        anchor
          .querySelector(
            ".notion-collection-card-property .notion-page-title-text",
          )
          ?.textContent?.trim() || "";

      const altText =
        imageElement?.getAttribute("alt")?.trim() ||
        titleText ||
        "Gallery preview";

      handleOpenGalleryPreview({
        src: previewSrc ?? "",
        alt: altText,
        title: titleText || undefined,
        href,
      });
    };

    // Only intercept gallery card clicks for whitelisted inline databases.
    document.addEventListener("click", handleGalleryClick, true);
    return () =>
      document.removeEventListener("click", handleGalleryClick, true);
  }, [handleOpenGalleryPreview, resolvePageIdFromHref, getPageBlock]);

  // lite mode is for oembed
  const isLiteMode = lite === "true";

  const { isDarkMode } = useDarkMode();

  const siteMapPageUrl = React.useMemo(() => {
    const params: any = {};
    if (lite) params.lite = lite;

    const searchParams = new URLSearchParams(params);
    return site ? mapPageUrl(site, recordMap!, searchParams) : undefined;
  }, [site, recordMap, lite]);

  const keys = recordMap?.block ? Object.keys(recordMap.block) : [] // prettier-ignore
  const blockId = keys[0];
  const block =
    recordMap?.block && blockId ? recordMap.block[blockId]?.value : null;

  const isBlogPost =
    block?.type === "page" && block?.parent_table === "collection";

  const pageAside = React.useMemo(
    () =>
      config.showPageAside ? (
        <PageAside
          block={block!}
          recordMap={recordMap!}
          isBlogPost={isBlogPost}
        />
      ) : null,
    // Add showPageAside to the dependency array to recalculate whenever this value changes.
    [block, recordMap, isBlogPost],
  );

  // const pageAside = React.useMemo(
  //   () => (
  //     <PageAside
  //       block={block!}
  //       recordMap={recordMap!}
  //       isBlogPost={isBlogPost}
  //     />
  //   ),
  //   [block, recordMap, isBlogPost]
  // )

  const footer = React.useMemo(() => <Footer />, []);

  // const title = block ? getBlockTitle(block, recordMap) || site.name : site.name
  const title = block
    ? getBlockTitle(block, recordMap!) || site?.name || "Untitled"
    : site?.name || "Untitled";

  const canonicalPageUrl =
    config.isDev || !site || !recordMap
      ? undefined
      : getCanonicalPageUrl(site, recordMap)(pageId);

  const socialImage =
    block && recordMap
      ? mapImageUrl(
          getPageProperty<string>("Social Image", block, recordMap) ||
            (block as PageBlock).format?.page_cover,
          block,
        ) || mapImageUrl(config.defaultPageCover, block)
      : config.defaultPageCover;

  const socialDescription =
    (block &&
      recordMap &&
      getPageProperty<string>("Description", block, recordMap)) ||
    config.description;

  const header = React.useMemo(
    () => (
      <PageHead
        pageId={pageId}
        site={site}
        title={title}
        description={socialDescription}
        image={socialImage}
        url={canonicalPageUrl}
        isBlogPost={isBlogPost}
      />
    ),
    [
      pageId,
      site,
      title,
      socialDescription,
      socialImage,
      canonicalPageUrl,
      isBlogPost,
    ],
  );

  const components = React.useMemo<Partial<NotionComponents>>(
    () => ({
      Image: NotionImage,
      nextLink: Link,
      Code,
      Collection,
      Equation,
      Pdf,
      Modal,
      Tweet,
      Header: NotionPageHeader,
      propertyLastEditedTimeValue,
      propertyTextValue,
      propertyDateValue,
      Text: CleanText,
    }),
    [],
  );

  const peekComponents = React.useMemo<Partial<NotionComponents>>(
    () => ({
      ...components,
      Header: (_headerProps: React.ComponentProps<typeof NotionPageHeader>) =>
        null,
    }),
    [components],
  );

  // Keep [data-gallery-preview="1"] in sync so CSS can scope icon/title hiding
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const run = () => {
      try {
        markPreviewEligibleCollections();
      } catch {}
    };
    run();
    // Observe DOM changes under .notion-viewport to re-apply marks when Notion re-renders
    const root = document.querySelector(".notion-viewport") || document.body;
    const mo = new MutationObserver(() => run());
    mo.observe(root, { childList: true, subtree: true, attributes: false });
    return () => mo.disconnect();
  }, [recordMap]);

  React.useEffect(() => {
    if (components) {
      console.log("[Notion components override]", Object.keys(components));
      if (Object.keys(components).includes("Text")) {
        console.info("✅ CleanText successfully registered");
      } else {
        console.warn("⚠️ CleanText not injected");
      }
    }
  }, [components]);

  // 🔍 For debugging: check the entire schema structure
  React.useEffect(() => {
    if (recordMap?.collection) {
      for (const col of Object.values(recordMap.collection)) {
        const schema = col?.value?.schema;
        if (schema) {
          console.log("🧩 Schema detected:");
          for (const [key, val] of Object.entries(schema)) {
            console.log(`${key} - ${val.name}: ${val.type}`);
          }
        }
      }
    }
  }, [recordMap]);

  // Simplify rendering logic
  if (!recordMap && !error) {
    return <Loading />;
  }

  if (error || !block) {
    // If `block` is missing, it means there is no page content, so treat it as a 404
    return <Page404 site={site} pageId={pageId} error={error} />;
  }

  // console.log('notion page', {
  //   isDev: config.isDev,
  //   title,
  //   pageId,
  //   rootNotionPageId: site?.rootNotionPageId,
  //   recordMap
  // })

  if (!config.isServer) {
    // add important objects to the window global for easy debugging
    const g = window as any;
    g.pageId = pageId;
    g.recordMap = recordMap;
    g.block = block;
  }

  console.log("[Render check]", { isPeekOpen, peekRecordMap });

  return (
    <>
      {header}

      {isLiteMode && <BodyClassName className="notion-lite" />}
      {isDarkMode && <BodyClassName className="dark-mode" />}

      {recordMap && (
        <NotionPageRenderer
          recordMap={recordMap}
          canonicalPageMap={canonicalPageMap}
          rootPageId={site?.rootNotionPageId}
          fullPage={!isLiteMode}
          darkMode={isDarkMode}
          components={components}
          mapPageUrl={siteMapPageUrl as any}
          mapImageUrl={mapImageUrl as any}
          pageAside={pageAside}
          footer={footer}
          onOpenPeek={handleOpenPeek}
        />
      )}

      {galleryPreview && (
        <div
          className={`gallery-image-modal__overlay ${
            isZoomed ? "is-zoomed" : ""
          }`}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="gallery-image-modal__backdrop"
            aria-label="Close image preview"
            onClick={handleCloseGalleryPreview}
          />
          <div className="gallery-image-modal__content">
            <div className="gallery-image-modal__inner">
              <button
                type="button"
                className="gallery-image-modal__close"
                onClick={handleCloseGalleryPreview}
                aria-label="Close image preview"
              >
                X
              </button>

              <div
                className="gallery-image-modal__image"
                onClick={handleToggleZoom}
                title={isZoomed ? "Zoom out" : "Zoom in"}
              >
                {galleryPreview.src ? (
                  <img src={galleryPreview.src} alt={galleryPreview.alt} />
                ) : (
                  <div className="gallery-image-modal__image--placeholder">
                    Image preview unavailable.
                  </div>
                )}
              </div>

              {(galleryPreview.title || galleryPreview.href) && (
                <div className="gallery-image-modal__meta">
                  {galleryPreview.title && (
                    <div className="gallery-image-modal__title">
                      {galleryPreview.title}
                    </div>
                  )}

                  {galleryPreview.href && (
                    <a
                      className="gallery-image-modal__link"
                      href={galleryPreview.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open page
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SidePeek isOpen={isPeekOpen} onClose={handleClosePeek}>
        {isPeekLoading && <Loading />}
        {peekRecordMap && (
          <NotionPageRenderer
            recordMap={peekRecordMap}
            rootPageId={site?.rootNotionPageId}
            canonicalPageMap={canonicalPageMap}
            fullPage={!isLiteMode}
            darkMode={isDarkMode}
            components={peekComponents}
            mapPageUrl={siteMapPageUrl as any}
            mapImageUrl={mapImageUrl as any}
          />
        )}
      </SidePeek>

      <style
        // Gallery card title/icon visibility & alignment rules
        dangerouslySetInnerHTML={{
          __html: `
  /* --- Gallery title/icon visibility & alignment (reinforced) -------------- */
  /* NON-preview gallery views: left-align and SHOW everything explicitly */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card * {
    text-align: left !important;
  }
  /* Ensure the card body and first property row render */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-collection-card-body {
    display: block !important;
    justify-content: flex-start !important;
    align-items: flex-start !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-collection-card-property {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  /* Property/title wrappers */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-property,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-property-title {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  /* Title row as flex */
  .notion-gallery-view .notion-collection-card .notion-page-title {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    margin: 0 !important;
    text-align: left !important;
  }
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-title {
    gap: 0.12rem !important; /* tighter spacing */
  }
  /* Anchor wrapping the title */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-link {
    display: inline-flex !important;
    align-items: center !important;
    gap: 0.4rem !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  /* Icon + icon glyph + text must be visible */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon-inline,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-title-icon,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon {
    display: inline-flex !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-title-text {
    display: inline-block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  /* Center the icon glyph inside its inline container */
  .notion-gallery-view .notion-collection-card .notion-page-icon-inline {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    vertical-align: middle !important;
    line-height: 1 !important;
  }
  /* Remove margins/padding from icon/title/text to eliminate hidden space */
  .notion-gallery-view .notion-collection-card .notion-page-icon-inline,
  .notion-gallery-view .notion-collection-card .notion-page-title-icon,
  .notion-gallery-view .notion-collection-card .notion-page-icon,
  .notion-gallery-view .notion-collection-card .notion-page-title-text {
    margin: 0 !important;
    padding: 0 !important;
  }
  /* Tiny extra breathing room between icon and title */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon-inline,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-title-icon,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon {
    margin-right: 0.08rem !important; /* adjust 0.06–0.12rem to taste */
  }
  /* Slightly increase icon size for non-preview gallery cards */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-title-icon,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon {
    width: 1.15em !important;
    height: 1.15em !important;
    min-width: 1.15em !important;
    min-height: 1.15em !important;
  }
  /* Emoji (span-based) icons */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon-span {
    font-size: 1.1em !important;   /* was ~1em; slightly larger */
    line-height: 1 !important;
  }
  /* SVG/IMG inside icon wrappers: size up to match */
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-title-icon svg,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-title-icon img,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon svg,
  .notion-gallery-view:not([data-gallery-preview="1"]) .notion-collection-card .notion-page-icon img {
    width: 1.15em !important;
    height: 1.15em !important;
  }
  .notion-gallery-view .notion-collection-card .notion-page-title-icon,
  .notion-gallery-view .notion-collection-card .notion-page-icon {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1 !important;
  }
  /* Ensure inner SVG/IMG participate correctly without extra baseline offset */
  .notion-gallery-view .notion-collection-card .notion-page-title-icon svg,
  .notion-gallery-view .notion-collection-card .notion-page-title-icon img,
  .notion-gallery-view .notion-collection-card .notion-page-icon svg,
  .notion-gallery-view .notion-collection-card .notion-page-icon img {
    display: block !important;
  }
  /* Preview-enabled gallery views: hide ONLY the icon and the title text */
  .notion-gallery-view[data-gallery-preview="1"] .notion-collection-card .notion-page-icon-inline,
  .notion-gallery-view[data-gallery-preview="1"] .notion-collection-card .notion-page-title-text {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
  }
  `,
        }}
      />

      <ChatPanel />
    </>
  );
}
// inline grouped list title hiding implemented via sanitized NotionPageRenderer.
