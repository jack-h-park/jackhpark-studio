"use client";

import { FiMessageCircle } from "@react-icons/all-files/fi/FiMessageCircle";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
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
import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { useChatScroll } from "@/components/chat/hooks/useChatScroll";
import { useChatSession } from "@/components/chat/hooks/useChatSession";
import { ChatAdvancedSettingsDrawer } from "@/components/chat/settings/ChatAdvancedSettingsDrawer";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

import styles from "./ChatFullPage.module.css";

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
  const { adminConfig, sessionConfig } = useChatConfig();
  const [inputValue, setInputValue] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isLoading,
    loadingAssistantId,
    sendMessage,
    abortActiveRequest,
  } = useChatSession({ source: "full-page", config: sessionConfig });

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

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) {
      return;
    }
    void sendMessage(trimmed);
    setInputValue("");
  };

  const handleSuggestedPromptClick = (prompt: string) => {
    setInputValue(prompt);
    focusInput();
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
            onChange={setInputValue}
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
