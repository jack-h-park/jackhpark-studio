"use client";

import { FiMessageCircle } from "@react-icons/all-files/fi/FiMessageCircle";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import Image from "next/image";
import { useMemo, useState } from "react";

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
import { useChatSession } from "@/components/chat/hooks/useChatSession";
import { ChatAdvancedSettingsDrawer } from "@/components/chat/settings/ChatAdvancedSettingsDrawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

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
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(true);
  const {
    messages,
    isLoading,
    loadingAssistantId,
    sendMessage,
    abortActiveRequest,
  } = useChatSession({ source: "full-page", config: sessionConfig });

  const hasMessages = messages.length > 0;
  const showTelemetry = true;
  const showCitations = true;
  const renderPromptSummary = useMemo(
    () => adminConfig.baseSystemPromptSummary ?? "",
    [adminConfig.baseSystemPromptSummary],
  );

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) {
      return;
    }
    void sendMessage(trimmed);
    setInputValue("");
  };

  const toggleDiagnosticsExpanded = () => {
    setDiagnosticsExpanded((prev) => !prev);
  };

  return (
    <div className={styles.shell}>
      <Card className={styles.panel}>
        <header className={styles.header}>
          <div>
            <HeadingWithIcon
              as="p"
              icon={<FiMessageCircle aria-hidden="true" />}
            >
              Jack’s AI Assistant
            </HeadingWithIcon>
            <p className="ai-settings-section__description">
              {renderPromptSummary}
            </p>
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
          <div className={styles.messages}>
            {!hasMessages && (
              <div className={styles.hero}>
                <Image
                  src="/images/7FAD09AA-76ED-4C18-A8E9-34D81940A59E.png"
                  alt="Jack's AI Assistant"
                  width={220}
                  height={220}
                />
                <p>
                  Ask anything about Jack’s work. Once you send a message, the
                  assistant will stream a response with citations and telemetry.
                </p>
              </div>
            )}
            {hasMessages && (
              <ChatMessagesPanel
                messages={messages}
                isLoading={isLoading}
                loadingAssistantId={loadingAssistantId}
                showTelemetry={showTelemetry}
                diagnosticsExpanded={diagnosticsExpanded}
                onToggleDiagnostics={toggleDiagnosticsExpanded}
                showCitations={showCitations}
                showPlaceholder={false}
                citationLinkLength={60}
              />
            )}
          </div>
          <ChatInputBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSend}
            onStop={abortActiveRequest}
            isLoading={isLoading}
            disabled={isLoading}
            placeholder="Ask me anything about Jack..."
          />
        </div>
      </Card>
      <ChatAdvancedSettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
