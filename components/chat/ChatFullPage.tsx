"use client";

import { FiMessageCircle } from "@react-icons/all-files/fi/FiMessageCircle";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
} from "@/types/chat-config";
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
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
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
                <Image
                  src="/images/7FAD09AA-76ED-4C18-A8E9-34D81940A59E.png"
                  alt="Jack's AI Assistant"
                  width={220}
                  height={220}
                />
              <div className="mt-4 max-w-md text-center mx-auto">
                <p className="text-base font-medium text-foreground leading-relaxed">
                  Ask about Jack’s work, projects, or experience.
                </p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Or explore how this AI assistant works: retrieval (RAG),
                  citations, and telemetry.
                </p>
              </div>
              <div className="mt-6 text-center max-w-xl mx-auto">
                <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                  Try one of these
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {[
                    "What are Jack’s 2–3 most impactful projects, and why?",
                    "Show me how citations work on this site (give an example answer).",
                    "Summarize Jack’s background in 5 bullet points.",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-full border border-ai-border px-3 py-1 text-sm text-muted-foreground transition hover:border-ai-accent hover:text-ai hover:bg-[color-mix(in_srgb,var(--ai-accent),var(--ai-bg))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai-accent"
                      onClick={() => handleSuggestedPromptClick(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
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
