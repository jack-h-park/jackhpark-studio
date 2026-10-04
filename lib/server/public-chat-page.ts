import type { GetServerSideProps, GetServerSidePropsContext } from "next";

import type { NotionNavigationHeader } from "@/lib/server/notion-header";
import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
} from "@/types/chat-config";
import type {
  PublicChatConfig,
  PublicChatRuntimeMeta,
} from "@/types/public-chat-config";
import {
  PUBLIC_CHAT_CACHE_TAG,
  PUBLIC_CHAT_CDN_TTL_SECONDS,
  PUBLIC_CHAT_SWR_SECONDS,
} from "@/lib/server/public-chat-cache";
import {
  toPublicChatConfig,
  toPublicChatRuntimeMeta,
} from "@/lib/server/public-chat-config";

export type PublicChatPageProps = {
  adminConfig: PublicChatConfig;
  runtimeMeta: PublicChatRuntimeMeta;
} & NotionNavigationHeader;

export function createPublicChatPageLoader({
  loadConfig,
  loadHeader,
  buildRuntimeMeta,
  isPersonalized,
}: {
  loadConfig(options: { forceRefresh: true }): Promise<AdminChatConfig>;
  loadHeader(): Promise<NotionNavigationHeader>;
  buildRuntimeMeta(config: AdminChatConfig): AdminChatRuntimeMeta;
  isPersonalized?(context: GetServerSidePropsContext): boolean;
}): GetServerSideProps<PublicChatPageProps> {
  return async (context) => {
    const { res } = context;
    res.setHeader("Cache-Control", "private, no-store");
    res.removeHeader("Vercel-Cache-Tag");

    // Any future session-dependent branch must opt out before reading its
    // session. The anonymous shell never reads cookies or request payloads.
    const bypassCache = Boolean(
      context.req.headers.authorization ||
      context.draftMode ||
      context.preview ||
      // Next serializes query in __NEXT_DATA__ independently of page props.
      Object.keys(context.query).length > 0 ||
      isPersonalized?.(context),
    );
    const [config, header] = await Promise.all([
      loadConfig({ forceRefresh: true }),
      loadHeader(),
    ]);
    const props: PublicChatPageProps = {
      adminConfig: toPublicChatConfig(config),
      runtimeMeta: toPublicChatRuntimeMeta(buildRuntimeMeta(config)),
      ...header,
    };

    if (
      !bypassCache &&
      header.headerRecordMap &&
      res.statusCode === 200 &&
      !res.hasHeader("Set-Cookie")
    ) {
      res.setHeader(
        "Cache-Control",
        `public, max-age=0, s-maxage=${PUBLIC_CHAT_CDN_TTL_SECONDS}, stale-while-revalidate=${PUBLIC_CHAT_SWR_SECONDS}`,
      );
      res.setHeader("Vercel-Cache-Tag", PUBLIC_CHAT_CACHE_TAG);
    }

    return { props };
  };
}
