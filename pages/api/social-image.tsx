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

// Signature gradient — the single brand gradient from the design system,
// mirrored from public/og/logo.svg. Keep the stops in sync with that asset.
const SIGNATURE_GRADIENT =
  "linear-gradient(90deg, #f06292 0%, #b439df 30%, #5b8def 60%, #4dd0e1 100%)";

// Official Jack H. Park Studio logo mark, rebuilt from satori-native primitives
// so next/og renders it crisply at any size (mirrors public/og/logo.svg). Used
// as the social-image fallback when a page has no resolvable title, so the card
// reads as an intentional brand card rather than a nearly blank layout.
function StudioLogoMark() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 220,
          height: 220,
          borderRadius: 44,
          backgroundImage: SIGNATURE_GRADIENT,
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 700,
            fontFamily: "Inter",
            color: "#fff",
          }}
        >
          JHP
        </div>
      </div>

      <div
        style={{
          width: 340,
          height: 6,
          borderRadius: 3,
          marginTop: 36,
          backgroundImage: SIGNATURE_GRADIENT,
        }}
      />

      <div
        style={{
          marginTop: 24,
          fontSize: 24,
          fontFamily: "Inter",
          color: "#9B9A97",
          letterSpacing: 10,
        }}
      >
        STUDIO
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

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#1F2027",
        alignItems: "center",
        justifyContent: "center",
        color: "black",
      }}
    >
      {pageInfo.image && (
        <img
          src={pageInfo.image}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // TODO: satori doesn't support background-size: cover and seems to
            // have inconsistent support for filter + transform to get rid of the
            // blurred edges. For now, we'll go without a blur filter on the
            // background, but Satori is still very new, so hopefully we can re-add
            // the blur soon.

            // backgroundImage: pageInfo.image
            //   ? `url(${pageInfo.image})`
            //   : undefined,
            // backgroundSize: '100% 100%'
            // TODO: pageInfo.imageObjectPosition
            // filter: 'blur(8px)'
            // transform: 'scale(1.05)'
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          width: 900,
          height: 465,
          display: "flex",
          flexDirection: "column",
          border: "16px solid rgba(0,0,0,0.3)",
          borderRadius: 8,
          zIndex: "1",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            backgroundColor: "#fff",
            padding: 24,
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {pageInfo.detail && (
            <div style={{ fontSize: 32, opacity: 0 }}>{pageInfo.detail}</div>
          )}

          {pageInfo.title ? (
            <div
              style={{
                fontSize: 70,
                fontWeight: 700,
                fontFamily: "Inter",
              }}
            >
              {pageInfo.title}
            </div>
          ) : (
            <StudioLogoMark />
          )}

          {pageInfo.detail && (
            <div style={{ fontSize: 32, opacity: 0.6 }}>{pageInfo.detail}</div>
          )}
        </div>
      </div>

      {pageInfo.authorImage && (
        <div
          style={{
            position: "absolute",
            top: 47,
            left: 104,
            height: 128,
            width: 128,
            display: "flex",
            borderRadius: "50%",
            border: "4px solid #fff",
            zIndex: "5",
          }}
        >
          <img
            src={pageInfo.authorImage}
            style={{
              width: "100%",
              height: "100%",
              // transform: 'scale(1.04)'
            }}
          />
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
