import type { GetServerSideProps } from "next";
import Head from "next/head";

import { AdminChatConfigPage } from "@/components/admin/chat-config/chat-config-page";
import { AiPageChrome } from "@/components/AiPageChrome";
import { DEFAULT_LLM_MODEL_ID } from "@/lib/core/llm-registry";
import { isOllamaEnabled } from "@/lib/core/ollama";
import {
  getAdminChatConfig,
  getAdminChatConfigMetadata,
} from "@/lib/server/admin-chat-config";
import { buildPresetModelResolutions } from "@/lib/server/model-resolution";
import {
  loadNotionNavigationHeader,
  type NotionNavigationHeader,
} from "@/lib/server/notion-header";
import {
  type AdminChatConfig,
  type AdminChatRuntimeMeta,
} from "@/types/chat-config";

export type PageProps = {
  adminConfig: AdminChatConfig;
  lastUpdatedAt: string | null;
  runtimeMeta: AdminChatRuntimeMeta;
} & NotionNavigationHeader;

export default function ChatConfigPage({
  adminConfig,
  lastUpdatedAt,
  runtimeMeta,
  headerRecordMap,
  headerBlockId,
}: PageProps) {
  return (
    <>
      <Head>
        <title>Chat Configuration · Admin</title>
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
      >
        <AdminChatConfigPage
          adminConfig={adminConfig}
          lastUpdatedAt={lastUpdatedAt}
          runtimeMeta={runtimeMeta}
        />
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [adminConfig, metadata, header] = await Promise.all([
    getAdminChatConfig(),
    getAdminChatConfigMetadata(),
    loadNotionNavigationHeader(),
  ]);
  const runtimeMeta: AdminChatRuntimeMeta = {
    defaultLlmModelId:
      DEFAULT_LLM_MODEL_ID as AdminChatRuntimeMeta["defaultLlmModelId"],
    ollamaEnabled: isOllamaEnabled(),
    presetResolutions: buildPresetModelResolutions(adminConfig),
  };
  return {
    props: {
      adminConfig,
      lastUpdatedAt: metadata.updatedAt,
      runtimeMeta,
      ...header,
    },
  };
};
