"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { ChatMessage } from "@/components/chat/hooks/useChatSession";

export type ChatPromotionSession = {
  cid: string;
  draft: string;
  messages: ChatMessage[];
  lastUpdatedAt: number;
  lastAnchorId?: string;
  interruptedByPromotion?: boolean;
};

type ChatPromotionSessionContextValue = {
  activeCid: string | null;
  getSession: (cid: string | null | undefined) => ChatPromotionSession | null;
  ensureCid: (preferredCid?: string | null) => string;
  setActiveCid: (cid: string | null) => void;
  setDraft: (cid: string, value: string) => void;
  setMessages: (cid: string, messages: ChatMessage[]) => void;
  markInterrupted: (cid: string, interrupted: boolean) => void;
};

const ChatPromotionSessionContext =
  createContext<ChatPromotionSessionContextValue | null>(null);

const createCid = () => {
  if (typeof window === "undefined") {
    return `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildSession = (cid: string): ChatPromotionSession => ({
  cid,
  draft: "",
  messages: [],
  lastUpdatedAt: Date.now(),
  lastAnchorId: undefined,
  interruptedByPromotion: false,
});

export function ChatPromotionSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activeCid, setActiveCid] = useState<string | null>(null);
  const [sessionsByCid, setSessionsByCid] = useState<
    Map<string, ChatPromotionSession>
  >(() => new Map());

  const ensureCid = useCallback((preferredCid?: string | null) => {
    const cid =
      preferredCid && preferredCid.trim().length > 0 ? preferredCid : createCid();

    setSessionsByCid((prev) => {
      if (prev.has(cid)) {
        return prev;
      }
      const next = new Map(prev);
      next.set(cid, buildSession(cid));
      return next;
    });
    setActiveCid(cid);
    return cid;
  }, []);

  const getSession = useCallback(
    (cid: string | null | undefined) => {
      if (!cid) return null;
      return sessionsByCid.get(cid) ?? null;
    },
    [sessionsByCid],
  );

  const setDraft = useCallback((cid: string, value: string) => {
    setSessionsByCid((prev) => {
      const base = prev.get(cid) ?? buildSession(cid);
      const next = new Map(prev);
      next.set(cid, {
        ...base,
        draft: value,
        lastUpdatedAt: Date.now(),
      });
      return next;
    });
  }, []);

  const setMessages = useCallback((cid: string, messages: ChatMessage[]) => {
    setSessionsByCid((prev) => {
      const base = prev.get(cid) ?? buildSession(cid);
      const next = new Map(prev);
      const lastAnchorId = messages.length > 0 ? messages.at(-1)?.id : undefined;
      next.set(cid, {
        ...base,
        messages,
        lastAnchorId,
        lastUpdatedAt: Date.now(),
      });
      return next;
    });
  }, []);

  const markInterrupted = useCallback((cid: string, interrupted: boolean) => {
    setSessionsByCid((prev) => {
      const base = prev.get(cid) ?? buildSession(cid);
      const next = new Map(prev);
      next.set(cid, {
        ...base,
        interruptedByPromotion: interrupted,
        lastUpdatedAt: Date.now(),
      });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      activeCid,
      getSession,
      ensureCid,
      setActiveCid,
      setDraft,
      setMessages,
      markInterrupted,
    }),
    [activeCid, ensureCid, getSession, markInterrupted, setDraft, setMessages],
  );

  return (
    <ChatPromotionSessionContext.Provider value={value}>
      {children}
    </ChatPromotionSessionContext.Provider>
  );
}

export function useChatPromotionSession() {
  const context = useContext(ChatPromotionSessionContext);
  if (!context) {
    throw new Error(
      "useChatPromotionSession must be used within ChatPromotionSessionProvider",
    );
  }
  return context;
}
