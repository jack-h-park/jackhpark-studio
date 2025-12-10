import type { GetServerSideProps } from "next";
import Head from "next/head";

import { ChatConfigPage as AdminChatConfigPage } from "@/components/admin/chat-config/ChatConfigPage";
import { AiPageChrome } from "@/components/AiPageChrome";
import {
  DEFAULT_LLM_MODEL_ID,
  IS_DEFAULT_MODEL_EXPLICIT,
} from "@/lib/core/llm-registry";
import { isLmStudioEnabled } from "@/lib/core/lmstudio";
import { isOllamaEnabled } from "@/lib/core/ollama";
import { getLocalLlmBackend } from "@/lib/local-llm";
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

const PAGE_TITLE = "Chat Configuration";
const PAGE_TAB_TITLE = `Admin · ${PAGE_TITLE} — Jack H. Park`;

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
        <title>{PAGE_TAB_TITLE}</title>
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
      >
        <AdminChatConfigPage
          adminConfig={adminConfig}
          lastUpdatedAt={lastUpdatedAt}
          runtimeMeta={runtimeMeta}
          pageTitle={PAGE_TITLE}
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
    defaultLlmModelExplicit: IS_DEFAULT_MODEL_EXPLICIT,
    ollamaEnabled: isOllamaEnabled(),
    lmstudioEnabled: isLmStudioEnabled(),
    localLlmBackendEnv: getLocalLlmBackend(),
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
