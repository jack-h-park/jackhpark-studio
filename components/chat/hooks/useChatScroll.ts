import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@/components/chat/hooks/useChatSession";

export type UseChatScrollProps = {
  messages: ChatMessage[];
  isLoading: boolean;
};

export function useChatScroll({ messages, isLoading }: UseChatScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // Define a threshold (e.g., 20px) to determine if we are "at the bottom"
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= 30;

      // If the user scrolls up, disable auto-scroll
      if (!isAtBottom && autoScrollEnabled) {
        setAutoScrollEnabled(false);
      }

      // If the user scrolls back to the bottom, re-enable auto-scroll
      if (isAtBottom && !autoScrollEnabled) {
        setAutoScrollEnabled(true);
      }
    }
  }, [autoScrollEnabled]);

  // Auto-scroll when messages change or loading state changes, IF enabled.
  // Deferred to the next frame: reading scrollHeight straight from the commit
  // forced a synchronous layout of the whole tree inside React's hydration
  // task, which showed up as input delay on the first keystroke.
  useEffect(() => {
    if (!autoScrollEnabled) {
      return;
    }
    const frame = requestAnimationFrame(() => scrollToBottom());
    return () => cancelAnimationFrame(frame);
  }, [messages, isLoading, autoScrollEnabled, scrollToBottom]);

  // Force scroll to bottom on initial mount if there are messages
  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(frame);
  }, []); // Run only once on mount

  return {
    scrollRef,
    onScroll: handleScroll,
    scrollToBottom,
    autoScrollEnabled,
  };
}
