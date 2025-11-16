"use client";

import { useMemo, useState } from "react";

import type { AdminChatConfig } from "@/types/chat-config";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ChatMessagesPanel } from "@/components/chat/ChatMessagesPanel";
import {
  ChatConfigProvider,
  useChatConfig,
} from "@/components/chat/context/ChatConfigContext";
import { ChatAdvancedSettingsDrawer } from "@/components/chat/settings/ChatAdvancedSettingsDrawer";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

type ChatShellProps = {
  adminConfig: AdminChatConfig;
};

export function ChatShell({ adminConfig }: ChatShellProps) {
  return (
    <ChatConfigProvider adminConfig={adminConfig}>
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
    () => adminConfig.coreSystemPromptSummary,
    [adminConfig.coreSystemPromptSummary],
  );

  return (
    <div className="chat-shell">
      <div className="chat-shell__panel">
        <header className="chat-shell__header">
          <div>
            <p className="chat-shell__title">Jack’s AI Assistant</p>
            <p className="chat-shell__summary">{renderPromptSummary}</p>
          </div>
          <button
            type="button"
            className="chat-shell__settings-button"
            onClick={() => setDrawerOpen(true)}
          >
            Advanced Settings
          </button>
        </header>
        <div className="chat-shell__content">
          <ChatMessagesPanel messages={messages} />
          <ChatInputBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSend}
            disabled={isSending}
          />
        </div>
      </div>
      <ChatAdvancedSettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <style jsx>{`
        .chat-shell {
          min-height: 100vh;
          width: 100%;
          background: #f5f7fb;
          padding: 32px 16px 48px;
          display: flex;
          justify-content: center;
        }
        .chat-shell__panel {
          width: min(900px, 100%);
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 55px rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          max-height: 92vh;
        }
        .chat-shell__header {
          padding: 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          gap: 24px;
        }
        .chat-shell__title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #0f172a;
        }
        .chat-shell__summary {
          margin: 8px 0 0;
          color: #475569;
          font-size: 0.95rem;
          max-width: 480px;
          line-height: 1.4;
        }
        .chat-shell__settings-button {
          border-radius: 999px;
          border: 1px solid #cbd5f5;
          background: #ffffff;
          padding: 10px 24px;
          font-size: 0.9rem;
          font-weight: 600;
          color: #0f172a;
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .chat-shell__settings-button:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .chat-shell__content {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        @media (max-width: 640px) {
          .chat-shell {
            padding: 16px 12px 32px;
          }
          .chat-shell__header {
            flex-direction: column;
            align-items: flex-start;
          }
          .chat-shell__settings-button {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
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
