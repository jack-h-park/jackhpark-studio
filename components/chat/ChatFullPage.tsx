"use client";

import { FiMessageCircle } from "@react-icons/all-files/fi/FiMessageCircle";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
} from "@/types/chat-config";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ChatMessagesPanel } from "@/components/chat/ChatMessagesPanel";
import {
  ChatConfigProvider,
  useChatConfig,
} from "@/components/chat/context/ChatConfigContext";
import { useChatPromotionSession } from "@/components/chat/context/ChatPromotionSessionContext";
import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { useChatScroll } from "@/components/chat/hooks/useChatScroll";
import {
  type ChatMessage,
  useChatSession,
} from "@/components/chat/hooks/useChatSession";
import { ChatAdvancedSettingsDrawer } from "@/components/chat/settings/ChatAdvancedSettingsDrawer";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

import styles from "./ChatFullPage.module.css";

const CHAT_PROMOTION_MVP_ENABLED =
  process.env.NEXT_PUBLIC_CHAT_PROMOTION_MVP === "1";
const EMPTY_MESSAGES: ChatMessage[] = [];

export function ChatFullPage({
  adminConfig,
  runtimeMeta,
}: {
  adminConfig: AdminChatConfig;
  runtimeMeta: AdminChatRuntimeMeta;
}) {
  return (
    <ChatConfigProvider adminConfig={adminConfig} runtimeMeta={runtimeMeta}>
      <ChatShellContent />
    </ChatConfigProvider>
  );
}

function ChatShellContent() {
  const router = useRouter();
  const { adminConfig, sessionConfig } = useChatConfig();
  const {
    ensureCid,
    getSession,
    setActiveCid,
    setDraft,
    setMessages: setSessionMessages,
    markInterrupted,
  } = useChatPromotionSession();
  const [localCid, setLocalCid] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const routeCid = useMemo(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED || !router.isReady) {
      return null;
    }
    const raw = router.query.cid;
    return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
  }, [router.isReady, router.query.cid]);

  const routeSession = useMemo(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED || !routeCid) {
      return null;
    }
    return getSession(routeCid);
  }, [getSession, routeCid]);

  useEffect(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED) {
      return;
    }
    if (routeSession?.cid) {
      setLocalCid(routeSession.cid);
      setActiveCid(routeSession.cid);
      return;
    }
    if (routeCid) {
      setLocalCid(null);
      return;
    }
    setLocalCid(null);
  }, [routeCid, routeSession, setActiveCid]);

  const activeSession = useMemo(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED || !localCid) {
      return null;
    }
    return getSession(localCid);
  }, [getSession, localCid]);

  const initialMessages = useMemo(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED) {
      return EMPTY_MESSAGES;
    }
    return activeSession?.messages ?? EMPTY_MESSAGES;
  }, [activeSession?.messages]);

  const {
    messages,
    isLoading,
    loadingAssistantId,
    sendMessage,
    abortActiveRequest,
  } = useChatSession({
    source: "full-page",
    config: sessionConfig,
    ...(CHAT_PROMOTION_MVP_ENABLED
      ? {
          sessionKey: localCid ?? "__no-cid__",
          initialMessages,
        }
      : {}),
  });

  const hasMessages = messages.length > 0;
  const { showTelemetry, showCitations } = useChatDisplaySettings();
  const renderPromptSummary = useMemo(
    () => adminConfig.baseSystemPromptSummary ?? "",
    [adminConfig.baseSystemPromptSummary],
  );

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!isLoading) {
      focusInput();
    }
  }, [focusInput, isLoading]);

  useEffect(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED) {
      return;
    }
    setInputValue(activeSession?.draft ?? "");
  }, [activeSession?.draft, localCid]);

  const hasSyncedInitial = useRef(false);

  useEffect(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED || !localCid) {
      return;
    }

    // Guard: Don't overwrite registry with empty messages on initial load
    // if we know there should be initial messages.
    if (
      !hasSyncedInitial.current &&
      messages.length === 0 &&
      initialMessages.length > 0
    ) {
      return;
    }

    if (messages.length > 0) {
      hasSyncedInitial.current = true;
    }

    setSessionMessages(localCid, messages);
  }, [localCid, messages, setSessionMessages, initialMessages.length]);

  const ensureConversationCid = useCallback(() => {
    if (!CHAT_PROMOTION_MVP_ENABLED) {
      return null;
    }
    if (localCid) {
      return localCid;
    }
    const next = ensureCid();
    setLocalCid(next);
    setActiveCid(next);
    void router.replace(
      {
        pathname: "/chat",
        query: { ...router.query, cid: next },
      },
      undefined,
      { shallow: true },
    );
    return next;
  }, [ensureCid, localCid, router, setActiveCid]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) {
      return;
    }

    if (CHAT_PROMOTION_MVP_ENABLED) {
      const cid = ensureConversationCid();
      if (cid) {
        setDraft(cid, "");
        markInterrupted(cid, false);
      }
    }

    void sendMessage(trimmed);
    setInputValue("");
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (!CHAT_PROMOTION_MVP_ENABLED) {
      return;
    }
    const cid = ensureConversationCid();
    if (cid) {
      setDraft(cid, value);
    }
  };

  const handleSuggestedPromptClick = (prompt: string) => {
    handleInputChange(prompt);
    focusInput();
  };

  const lastAssistantMessage = messages
    .toReversed()
    .find((message) => message.role === "assistant");
  const pausedByPromotion =
    CHAT_PROMOTION_MVP_ENABLED &&
    Boolean(activeSession?.interruptedByPromotion) &&
    !isLoading &&
    Boolean(
      lastAssistantMessage &&
      (lastAssistantMessage.isComplete === false ||
        lastAssistantMessage.metrics?.aborted === true),
    );

  const handleResume = () => {
    if (!CHAT_PROMOTION_MVP_ENABLED || isLoading) {
      return;
    }
    const cid = ensureConversationCid();
    if (!cid) {
      return;
    }
    const latestUserMessage = messages
      .toReversed()
      .find((message) => message.role === "user");
    if (!latestUserMessage) {
      return;
    }
    markInterrupted(cid, false);
    void sendMessage(latestUserMessage.content, { skipUserInsert: true });
  };

  const { scrollRef, onScroll } = useChatScroll({
    messages,
    isLoading,
  });

  return (
    <div className={styles.shell}>
      <Card className={styles.panel}>
        <header className={styles.header}>
          <div className="space-y-1">
            <CardTitle icon={<FiMessageCircle aria-hidden="true" size={18} />}>
              Jack’s AI Assistant
            </CardTitle>
            {renderPromptSummary && (
              <CardDescription className="text-sm leading-relaxed ai-text-muted">
                {renderPromptSummary}
              </CardDescription>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDrawerOpen(true)}
            type="button"
            className="gap-2"
          >
            <FiSliders aria-hidden="true" />
            Advanced Settings
          </Button>
        </header>
        <div className={styles.body}>
          {pausedByPromotion && (
            <div className="ai-warning-callout mb-3">
              <div className="flex items-center justify-between gap-3">
                <span>Response paused after promotion.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResume}
                  type="button"
                >
                  Resume
                </Button>
              </div>
            </div>
          )}
          <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
            {!hasMessages && (
              <div className={styles.hero}>
                <ChatEmptyState onSelectPrompt={handleSuggestedPromptClick} />
              </div>
            )}
            {hasMessages && (
              <ChatMessagesPanel
                messages={messages}
                isLoading={isLoading}
                loadingAssistantId={loadingAssistantId}
                showTelemetry={showTelemetry}
                showCitations={showCitations}
                showPlaceholder={false}
                citationLinkLength={60}
              />
            )}
          </div>
          <ChatInputBar
            inputRef={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onSubmit={handleSend}
            onStop={abortActiveRequest}
            isLoading={isLoading}
            disabled={isLoading}
            placeholder="Ask about Jack’s projects, AI architecture, or experience…"
          />
        </div>
      </Card>
      <ChatAdvancedSettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        messages={messages}
      />
    </div>
  );
}
