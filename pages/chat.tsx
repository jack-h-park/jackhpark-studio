import type { GetServerSideProps } from "next";
import Head from "next/head";

import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
} from "@/types/chat-config";
import { AiPageChrome } from "@/components/AiPageChrome";
import { ChatFullPage } from "@/components/chat/ChatFullPage";
import {
  DEFAULT_LLM_MODEL_ID,
  IS_DEFAULT_MODEL_EXPLICIT,
} from "@/lib/core/llm-registry";
import { isLmStudioConfigured } from "@/lib/core/lmstudio";
import { isOllamaConfigured } from "@/lib/core/ollama";
import { getLocalLlmBackend } from "@/lib/local-llm";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";
import { buildPresetModelResolutions } from "@/lib/server/model-resolution";
import {
  loadNotionNavigationHeader,
  type NotionNavigationHeader,
} from "@/lib/server/notion-header";

type PageProps = {
  adminConfig: AdminChatConfig;
  runtimeMeta: AdminChatRuntimeMeta;
} & NotionNavigationHeader;

export default function ChatPage({
  adminConfig,
  runtimeMeta,
  headerRecordMap,
  headerBlockId,
}: PageProps) {
  return (
    <>
      <Head>
        <title>Jack’s AI Assistant</title>
        <meta
          name="description"
          content="Ask Jack’s AI Assistant everything, now with session-level advanced settings."
        />
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
      >
        <ChatFullPage adminConfig={adminConfig} runtimeMeta={runtimeMeta} />
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [adminConfig, header] = await Promise.all([
    getAdminChatConfig(),
    loadNotionNavigationHeader(),
  ]);
  const runtimeMeta: AdminChatRuntimeMeta = {
    defaultLlmModelId:
      DEFAULT_LLM_MODEL_ID as AdminChatRuntimeMeta["defaultLlmModelId"],
    ollamaConfigured: isOllamaConfigured(),
    lmstudioConfigured: isLmStudioConfigured(),
    localLlmBackendEnv: getLocalLlmBackend(),
    presetResolutions: buildPresetModelResolutions(adminConfig),
    defaultLlmModelExplicit: IS_DEFAULT_MODEL_EXPLICIT,
  };
  return {
    props: {
      adminConfig,
      runtimeMeta,
      ...header,
    },
  };
};
