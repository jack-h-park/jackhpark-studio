import ky from "ky";
import { type NextApiRequest, type NextApiResponse } from "next";
import { ImageResponse } from "next/og";
import { type PageBlock } from "notion-types";
import {
  getBlockIcon,
  getPageProperty,
  isUrl,
  parsePageId,
} from "notion-utils";

import * as libConfig from "@/lib/config";
import interSemiBoldFont from "@/lib/fonts/inter-semibold";
import { getPageTitle } from "@/lib/get-page-title";
import { mapImageUrl } from "@/lib/map-image-url";
import { notion } from "@/lib/notion-api";
import { type NotionPageInfo, type PageError } from "@/lib/types";

// Brand palette, sourced from public/assets/brand-design-system-guide.html.
const SIGNATURE_GRADIENT =
  "linear-gradient(90deg, #f06292 0%, #b439df 30%, #5b8def 60%, #4dd0e1 100%)";
const BRAND_BG = "#191919"; // brand dark neutral
const BRAND_INK = "#f2f0ea"; // warm off-white for primary text
const BRAND_MUTE = "#9b9a97"; // Notion-style muted gray

// Title size steps down as the title grows, so long titles stay on the card
// without overflowing. Only Inter SemiBold (700) is loaded, so the visual
// hierarchy comes from size, color and tracking rather than font weight.
function resolveTitleFontSize(title: string): number {
  const n = title.length;
  if (n <= 24) return 78;
  if (n <= 42) return 66;
  if (n <= 66) return 56;
  if (n <= 96) return 46;
  if (n <= 130) return 40;
  return 34;
}

// Official Jack H. Park Studio logo mark (signature-gradient rounded square +
// JHP), rebuilt from satori-native primitives so next/og renders it crisply at
// any size. Mirrors public/og/logo.svg.
function StudioLogoMark({ size = 72 }: { size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundImage: SIGNATURE_GRADIENT,
      }}
    >
      <div
        style={{
          fontSize: Math.round(size * 0.42),
          fontWeight: 700,
          fontFamily: "Inter",
          color: "#fff",
        }}
      >
        JHP
      </div>
    </div>
  );
}

export const runtime = "edge";

export default async function OGImage(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { searchParams } = new URL(req.url!);
  const pageId = parsePageId(
    searchParams.get("id") || libConfig.rootNotionPageId,
  );
  if (!pageId) {
    return new Response("Invalid notion page id", { status: 400 });
  }

  const pageInfoOrError = await getNotionPageInfo({ pageId });
  if (pageInfoOrError.type === "error") {
    return res.status(pageInfoOrError.error.statusCode).send({
      error: pageInfoOrError.error.message,
    });
  }
  const pageInfo = pageInfoOrError.data;
  const hasTitle = pageInfo.title.trim().length > 0;
  const author = pageInfo.author || libConfig.author;
  const domain = libConfig.domain.replace(/^www\./, "");

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: BRAND_BG,
      }}
    >
      {/* Optional page cover, full-bleed behind a dark scrim so text stays
          legible. Most pages have no cover and render on the flat brand dark. */}
      {pageInfo.image && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            width: "100%",
            height: "100%",
          }}
        >
          <img
            src={pageInfo.image}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              backgroundImage:
                "linear-gradient(180deg, rgba(25,25,25,0.72) 0%, rgba(25,25,25,0.88) 100%)",
            }}
          />
        </div>
      )}

      {/* Signature-gradient hairline along the top edge. */}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: 8,
          backgroundImage: SIGNATURE_GRADIENT,
        }}
      />

      {hasTitle ? (
        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <StudioLogoMark size={40} />
            <div
              style={{
                marginLeft: 16,
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "Inter",
                color: BRAND_MUTE,
                letterSpacing: 4,
              }}
            >
              JACK H. PARK STUDIO
            </div>
          </div>

          <div style={{ display: "flex" }}>
            <div
              style={{
                fontSize: resolveTitleFontSize(pageInfo.title),
                fontWeight: 700,
                fontFamily: "Inter",
                color: BRAND_INK,
                lineHeight: 1.12,
                letterSpacing: -1,
              }}
            >
              {pageInfo.title}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  fontFamily: "Inter",
                  color: BRAND_INK,
                }}
              >
                {author}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: "Inter",
                  color: BRAND_MUTE,
                }}
              >
                {domain}
              </div>
            </div>
            <StudioLogoMark size={64} />
          </div>
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <StudioLogoMark size={200} />
          <div
            style={{
              marginTop: 40,
              fontSize: 30,
              fontWeight: 700,
              fontFamily: "Inter",
              color: BRAND_MUTE,
              letterSpacing: 14,
            }}
          >
            STUDIO
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 24,
              fontWeight: 700,
              fontFamily: "Inter",
              color: "#6b6a65",
            }}
          >
            {domain}
          </div>
        </div>
      )}
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: interSemiBoldFont,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}

export async function getNotionPageInfo({
  pageId,
}: {
  pageId: string;
}): Promise<
  | { type: "success"; data: NotionPageInfo }
  | { type: "error"; error: PageError }
> {
  const recordMap = await notion.getPage(pageId);

  const keys = Object.keys(recordMap?.block || {});
  const block = recordMap?.block?.[keys[0]!]?.value;

  if (!block) {
    throw new Error("Invalid recordMap for page");
  }

  const blockSpaceId = block.space_id;

  if (
    blockSpaceId &&
    libConfig.rootNotionSpaceId &&
    blockSpaceId !== libConfig.rootNotionSpaceId
  ) {
    return {
      type: "error",
      error: {
        statusCode: 400,
        message: `Notion page "${pageId}" belongs to a different workspace.`,
      },
    };
  }

  const isBlogPost =
    block.type === "page" && block.parent_table === "collection";
  // Leave empty when the page has no resolvable title so the card renders the
  // official logo mark instead of the site name on an otherwise blank layout.
  const title = getPageTitle(recordMap) ?? "";

  const imageCoverPosition =
    (block as PageBlock).format?.page_cover_position ??
    libConfig.defaultPageCoverPosition;
  const imageObjectPosition = imageCoverPosition
    ? `center ${(1 - imageCoverPosition) * 100}%`
    : undefined;

  const imageBlockUrl = mapImageUrl(
    getPageProperty<string>("Social Image", block, recordMap) ||
      (block as PageBlock).format?.page_cover,
    block,
  );
  const imageFallbackUrl = mapImageUrl(libConfig.defaultPageCover, block);

  const blockIcon = getBlockIcon(block, recordMap);
  const authorImageBlockUrl = mapImageUrl(
    blockIcon && isUrl(blockIcon) ? blockIcon : undefined,
    block,
  );
  const authorImageFallbackUrl = mapImageUrl(libConfig.defaultPageIcon, block);
  const [authorImage, image] = await Promise.all([
    getCompatibleImageUrl(authorImageBlockUrl, authorImageFallbackUrl),
    getCompatibleImageUrl(imageBlockUrl, imageFallbackUrl),
  ]);

  const author =
    getPageProperty<string>("Author", block, recordMap) || libConfig.author;

  // const socialDescription =
  //   getPageProperty<string>('Description', block, recordMap) ||
  //   libConfig.description

  // const lastUpdatedTime = getPageProperty<number>(
  //   'Last Updated',
  //   block,
  //   recordMap
  // )
  const publishedTime = getPageProperty<number>("Published", block, recordMap);
  const datePublished = publishedTime ? new Date(publishedTime) : undefined;
  // const dateUpdated = lastUpdatedTime
  //   ? new Date(lastUpdatedTime)
  //   : publishedTime
  //   ? new Date(publishedTime)
  //   : undefined
  const date =
    isBlogPost && datePublished
      ? `${datePublished.toLocaleString("en-US", {
          month: "long",
        })} ${datePublished.getFullYear()}`
      : undefined;
  const detail = date || author || libConfig.domain;

  const pageInfo: NotionPageInfo = {
    pageId,
    title,
    image,
    imageObjectPosition,
    author,
    authorImage,
    detail,
  };

  return {
    type: "success",
    data: pageInfo,
  };
}

async function isUrlReachable(
  url: string | undefined | null,
): Promise<boolean> {
  if (!url) {
    return false;
  }

  try {
    await ky.head(url);
    return true;
  } catch {
    return false;
  }
}

async function getCompatibleImageUrl(
  url: string | undefined | null,
  fallbackUrl: string | undefined | null,
): Promise<string | undefined> {
  const image = (await isUrlReachable(url)) ? url : fallbackUrl;

  if (image) {
    const imageUrl = new URL(image);

    if (imageUrl.host === "images.unsplash.com") {
      if (!imageUrl.searchParams.has("w")) {
        imageUrl.searchParams.set("w", "1200");
        imageUrl.searchParams.set("fit", "max");
        return imageUrl.toString();
      }
    }
  }

  return image ?? undefined;
}
