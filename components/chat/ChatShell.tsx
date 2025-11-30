"use client";

import { FiMessageCircle } from "@react-icons/all-files/fi/FiMessageCircle";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
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
import { ChatAdvancedSettingsDrawer } from "@/components/chat/settings/ChatAdvancedSettingsDrawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

import styles from "./ChatShell.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

type ChatShellProps = {
  adminConfig: AdminChatConfig;
  runtimeMeta: AdminChatRuntimeMeta;
};

export function ChatShell({ adminConfig, runtimeMeta }: ChatShellProps) {
  return (
    <ChatConfigProvider adminConfig={adminConfig} runtimeMeta={runtimeMeta}>
      <ChatShellContent />
    </ChatConfigProvider>
  );
}

function ChatShellContent() {
  const { adminConfig, sessionConfig } = useChatConfig();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputValue("");
    setIsSending(true);

    try {
      const response = await fetch(
        `/api/chat?engine=${encodeURIComponent(sessionConfig.chatEngine)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            sessionConfig,
          }),
        },
      );

      if (!response.ok) {
        const errorDetail = await parseErrorResponse(response);
        throw new Error(errorDetail ?? "Unable to contact chat API.");
      }

      const body = await response.text();
      const content = body.trim() || "No response available.";
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content,
        },
      ]);
    } catch (err) {
      const message =
        (err instanceof Error && err.message) || "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `Error: ${message}`,
          isError: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const renderPromptSummary = useMemo(
    () => adminConfig.baseSystemPromptSummary ?? "",
    [adminConfig.baseSystemPromptSummary],
  );

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
          <ChatMessagesPanel messages={messages} />
          <ChatInputBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSend}
            disabled={isSending}
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

type ErrorPayload = {
  error?: string;
};

async function parseErrorResponse(response: Response) {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    try {
      const payload = (await response.json()) as ErrorPayload;
      return payload?.error ?? JSON.stringify(payload);
    } catch {
      // fall through
    }
  }
  try {
    return await response.text();
  } catch {
    return response.statusText || null;
  }
}
