import Head from "next/head";

import type * as types from "@/lib/types";
import * as config from "@/lib/config";
import { debugNotionXLogger } from "@/lib/debug-notion-x";
import { getSocialImageUrl } from "@/lib/get-social-image-url";
import {
  COVER_IMAGE_SIZES,
  getNotionCoverImage,
} from "@/lib/notion-cover-image";

export function PageHead({
  site,
  title,
  description,
  pageId,
  image,
  coverImage,
  url,
  isBlogPost,
}: types.PageProps & {
  title?: string;
  description?: string;
  image?: string;
  /** Upstream page cover, when the page has one. Preloaded, not rendered. */
  coverImage?: string;
  url?: string;
  isBlogPost?: boolean;
}) {
  const rssFeedUrl = `${config.host}/feed`;

  // The whole Notion tree is client-rendered (`NotionRenderer` is
  // `dynamic({ ssr: false })`), so the cover <img> does not exist for the
  // preload scanner to find and its request could not start until hydration
  // finished — the band sat empty for seconds. This head is server-rendered, so
  // the hint is in the HTML and the fetch starts at parse time instead.
  //
  // The variants must match what NotionCoverBlurFill renders, which is why both
  // read them from the same helper: a hint that names bytes nothing goes on to
  // use is worse than no hint at all.
  const coverPreload = coverImage ? getNotionCoverImage(coverImage) : null;

  debugNotionXLogger.log("[Header] rendered");

  title = title ?? site?.name;
  description = description ?? site?.description;

  const socialImageUrl = getSocialImageUrl(pageId) || image;

  return (
    <Head>
      <meta charSet="utf-8" />
      <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
      />

      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black" />

      <meta
        name="theme-color"
        media="(prefers-color-scheme: light)"
        content="#fefffe"
        key="theme-color-light"
      />
      <meta
        name="theme-color"
        media="(prefers-color-scheme: dark)"
        content="#2d3439"
        key="theme-color-dark"
      />

      <meta name="robots" content="index,follow" />
      <meta property="og:type" content="website" />

      {site && (
        <>
          <meta property="og:site_name" content={site.name} />
          <meta property="twitter:domain" content={site.domain} />
        </>
      )}

      {config.twitter && (
        <meta name="twitter:creator" content={`@${config.twitter}`} />
      )}

      {description && (
        <>
          <meta name="description" content={description} />
          <meta property="og:description" content={description} />
          <meta name="twitter:description" content={description} />
        </>
      )}

      {socialImageUrl ? (
        <>
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content={socialImageUrl} />
          <meta property="og:image" content={socialImageUrl} />
        </>
      ) : (
        <meta name="twitter:card" content="summary" />
      )}

      {url && (
        <>
          <link rel="canonical" href={url} />
          <meta property="og:url" content={url} />
          <meta property="twitter:url" content={url} />
        </>
      )}

      {coverPreload && (
        <link
          key="notion-page-cover-preload"
          rel="preload"
          as="image"
          href={coverPreload.src}
          imageSrcSet={coverPreload.srcSet}
          imageSizes={COVER_IMAGE_SIZES}
          fetchPriority="high"
        />
      )}

      <link
        rel="alternate"
        type="application/rss+xml"
        href={rssFeedUrl}
        title={site?.name}
      />

      <meta property="og:title" content={title} />
      <meta name="twitter:title" content={title} />
      <title>{title}</title>

      {/* Better SEO for the blog posts */}
      {isBlogPost && (
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "@id": `${url}#BlogPosting`,
            mainEntityOfPage: url,
            url,
            headline: title,
            name: title,
            description,
            author: {
              "@type": "Person",
              name: config.author,
            },
            image: socialImageUrl,
          })}
        </script>
      )}
    </Head>
  );
}
