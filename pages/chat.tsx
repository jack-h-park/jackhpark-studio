import Head from "next/head";

import type { AdminChatRuntimeMeta } from "@/types/chat-config";
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
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import {
  createPublicChatPageLoader,
  type PublicChatPageProps,
} from "@/lib/server/public-chat-page";

export default function ChatPage({
  adminConfig,
  runtimeMeta,
  headerRecordMap,
  headerBlockId,
}: PublicChatPageProps) {
  return (
    <>
      <Head>
        <title>Ask JackGPT</title>
        <meta
          name="description"
          content="Ask JackGPT everything about Jack H. Park — his work, experience, and more."
        />
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
        fullBleed
      >
        <ChatFullPage adminConfig={adminConfig} runtimeMeta={runtimeMeta} />
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps = createPublicChatPageLoader({
  loadConfig: getAdminChatConfig,
  loadHeader: loadNotionNavigationHeader,
  buildRuntimeMeta: (adminConfig): AdminChatRuntimeMeta => ({
    defaultLlmModelId:
      DEFAULT_LLM_MODEL_ID as AdminChatRuntimeMeta["defaultLlmModelId"],
    ollamaConfigured: isOllamaConfigured(),
    lmstudioConfigured: isLmStudioConfigured(),
    localLlmBackendEnv: getLocalLlmBackend(),
    presetResolutions: buildPresetModelResolutions(adminConfig),
    defaultLlmModelExplicit: IS_DEFAULT_MODEL_EXPLICIT,
  }),
});
