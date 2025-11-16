"use client";

import { AiOutlineSetting } from "@react-icons/all-files/ai/AiOutlineSetting";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { SidePeek } from "@/components/SidePeek";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/chat-prompts";
import { ChatConfigForm, type ChatConfigFormProps } from "@/pages/admin/chat-config";

type AdminConfigPayload = Omit<
  ChatConfigFormProps,
  "defaultPrompt" | "error" | "tracingConfigured"
> & {
  tracingConfigured?: boolean;
  error?: string | null;
};

export default function ChatPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminConfig, setAdminConfig] = useState<ChatConfigFormProps | null>(
    null,
  );
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const fetchAdminConfig = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const response = await fetch("/api/admin/chat-settings");
      if (response.status === 401) {
        setIsAdmin(false);
        setAdminConfig(null);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to load admin settings");
      }
      const payload = (await response.json()) as AdminConfigPayload;
      setIsAdmin(true);
      setAdminConfig({
        systemPrompt: payload.systemPrompt,
        isDefault: payload.isDefault,
        defaultPrompt: DEFAULT_SYSTEM_PROMPT,
        guardrails: payload.guardrails,
        guardrailDefaults: payload.guardrailDefaults,
        models: payload.models,
        modelDefaults: payload.modelDefaults,
        langfuse: payload.langfuse,
        langfuseDefaults: payload.langfuseDefaults,
        tracingConfigured: payload.tracingConfigured ?? false,
        error: payload.error ?? undefined,
      });
    } catch (err: any) {
      console.error(err);
      setIsAdmin(false);
      setAdminConfig(null);
      setAdminError(err?.message ?? "Unable to load admin settings.");
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAdminConfig();
  }, [fetchAdminConfig]);

  const handleOpenConfig = useCallback(() => {
    setConfigOpen(true);
    void fetchAdminConfig();
  }, [fetchAdminConfig]);

  const configTrigger = isAdmin ? (
    <button
      type="button"
      className="chat-config-toggle chat-config-toggle--config"
      onClick={handleOpenConfig}
    >
      <AiOutlineSetting size={16} />
      Config
    </button>
  ) : null;

  const drawerContent = useMemo(() => {
    if (adminConfig) {
      return <ChatConfigForm {...adminConfig} />;
    }
    if (adminLoading) {
      return <p className="chat-config-placeholder">Loading admin settings…</p>;
    }
    return (
      <div className="chat-config-error">
        <p>{adminError ?? "Admin access required."}</p>
        <button type="button" onClick={() => void fetchAdminConfig()}>
          Retry
        </button>
      </div>
    );
  }, [adminConfig, adminError, adminLoading, fetchAdminConfig]);

  return (
    <>
      <Head>
        <title>Jack’s AI Assistant</title>
        <meta
          name="description"
          content="Ask Jack’s AI Assistant everything, powered by the same guardrails and models as the floating widget."
        />
      </Head>
      <div className="chat-page">
        <div className="chat-page__container">
          <div className="chat-panel-shell">
            <ChatWindow
              isOpen
              showCloseButton={false}
              showExpandButton={false}
              headerAction={configTrigger}
            />
          </div>
        </div>
      </div>
      <SidePeek isOpen={configOpen} onClose={() => setConfigOpen(false)}>
        <div className="chat-config-drawer">{drawerContent}</div>
      </SidePeek>
      <style jsx>{`
        .chat-page {
          min-height: 100vh;
          background: radial-gradient(circle at 10% 20%, #f4f7ff 0%, #e8ecff 45%, #f6f6f9 100%);
          background-color: #f7f7fb;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(1rem, 3vw, 3rem);
        }

        .chat-page__container {
          width: min(100%, 960px);
          height: min(90vh, 940px);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-panel-shell {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-panel-shell :global(.chat-panel) {
          width: min(860px, 100%);
          height: calc(100vh - 160px);
          max-height: 82vh;
        }

        .chat-panel-shell :global(.chat-panel.is-large) {
          width: min(860px, 100%);
          height: calc(100vh - 160px);
          max-height: 82vh;
        }

        .chat-page__container :global(.chat-panel.is-open) {
          opacity: 1;
        }

        .chat-config-toggle--config {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(10, 69, 132, 0.2);
          background: rgba(10, 69, 132, 0.08);
          color: #0a4584;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .chat-config-drawer {
          min-height: 100%;
          background: transparent;
        }

        .chat-config-placeholder,
        .chat-config-error {
          padding: 1rem;
          text-align: center;
        }

        .chat-config-error button {
          margin-top: 0.75rem;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: white;
          cursor: pointer;
        }

        .chat-config-error button:hover {
          background: #f0f4ff;
        }

        @media (max-width: 768px) {
          .chat-page__container {
            height: auto;
          }

          .chat-panel-shell :global(.chat-panel) {
            width: calc(100vw - 32px);
            height: 80vh;
          }
        }
      `}</style>
    </>
  );
}
