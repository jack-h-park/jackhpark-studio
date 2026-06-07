"use client";

import type {
  ChatMessage,
  ChatRetryPreset,
} from "@/components/chat/hooks/useChatSession";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { ChatMessageItem } from "@/components/chat/ChatMessageItem";

import styles from "./ChatMessagesPanel.module.css";

export type ChatMessagesPanelProps = {
  messages: ChatMessage[];
  isLoading?: boolean;
  loadingAssistantId?: string | null;
  showTelemetry?: boolean;
  showCitations?: boolean;
  showPlaceholder?: boolean;
  citationLinkLength?: number;
  onSelectPrompt?: (prompt: string) => void;
  retryPreset?: ChatRetryPreset | null;
  onRetryWithPreset?: (targetPresetId: string) => Promise<void>;
};

export function ChatMessagesPanel({
  messages,
  isLoading = false,
  loadingAssistantId = null,
  showTelemetry = false,
  showCitations = false,
  showPlaceholder = true,
  citationLinkLength = 24,
  onSelectPrompt,
  retryPreset,
  onRetryWithPreset,
}: ChatMessagesPanelProps) {
  if (messages.length === 0) {
    if (showPlaceholder) {
      return (
        <div className={styles.messagesPanel}>
          <div className="flex flex-1 flex-col justify-center items-center p-4">
            <ChatEmptyState onSelectPrompt={onSelectPrompt} />
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {messages.map((m, i) => (
        <ChatMessageItem
          key={m.id}
          message={m}
          isLoading={isLoading}
          loadingAssistantId={loadingAssistantId}
          showTelemetry={showTelemetry}
          showCitations={showCitations}
          citationLinkLength={citationLinkLength}
          retryPreset={i === messages.length - 1 ? retryPreset : undefined}
          onRetryWithPreset={
            i === messages.length - 1 ? onRetryWithPreset : undefined
          }
        />
      ))}
    </>
  );
}
