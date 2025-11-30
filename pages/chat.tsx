import type { GetServerSideProps } from "next";
import Head from "next/head";

import type { AdminChatConfig, AdminChatRuntimeMeta } from "@/types/chat-config";
import { AiPageChrome } from "@/components/AiPageChrome";
import { ChatShell } from "@/components/chat/ChatShell";
import { DEFAULT_LLM_MODEL_ID } from "@/lib/core/llm-registry";
import { isOllamaEnabled } from "@/lib/core/ollama";
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
        <ChatShell adminConfig={adminConfig} runtimeMeta={runtimeMeta} />
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
    defaultLlmModelId: DEFAULT_LLM_MODEL_ID as AdminChatRuntimeMeta["defaultLlmModelId"],
    ollamaEnabled: isOllamaEnabled(),
    presetResolutions: buildPresetModelResolutions(adminConfig),
  };
  return {
    props: {
      adminConfig,
      runtimeMeta,
      ...header,
    },
  };
};
