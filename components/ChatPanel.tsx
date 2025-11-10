"use client";

import { AiOutlineClose } from "@react-icons/all-files/ai/AiOutlineClose";
import { AiOutlineSend } from "@react-icons/all-files/ai/AiOutlineSend";
import { FcAssistant } from "@react-icons/all-files/fc/FcAssistant";
import { GiBrain } from "@react-icons/all-files/gi/GiBrain";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import css from "styled-jsx/css";

import {
  MODEL_PROVIDER_LABELS,
  MODEL_PROVIDERS,
  type ModelProvider,
  normalizeModelProvider,
} from "@/lib/shared/model-provider";

const DEFAULT_MODEL_PROVIDER: ModelProvider = normalizeModelProvider(
  process.env.NEXT_PUBLIC_LLM_PROVIDER ?? null,
  "openai",
);
const styles = css`
  .chat-panel-container {
    position: fixed;
    bottom: 60px;
    right: 30px;
    z-index: 1000;
  }

  .chat-panel-button {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s ease-in-out;
  }

  .chat-panel-button:hover {
    transform: scale(1.1);
  }

  .chat-panel-button :global(svg) {
    width: 36px;
    height: 36px;
    color: #0a4584ff;
  }

  .chat-panel {
    position: absolute;
    bottom: 88px;
    right: 0;
    width: 375px;
    height: 550px;
    background: #f9f9f9;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transform: translateY(20px);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
    pointer-events: none;
  }

  .chat-panel.is-open {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .chat-header {
    padding: 16px;
    background: #fff;
    border-bottom: 1px solid #eee;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-shrink: 0;
  }

  .chat-header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .chat-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chat-header-title :global(svg) {
    width: 20px;
    height: 20px;
    color: #0a4584;
  }

  .chat-config-bar {
    display: flex;
    align-items: stretch;
    gap: 8px;
    flex-wrap: nowrap;
    background: #f4f6fb;
    border: 1px solid #e3e7f2;
    border-radius: 10px;
    padding: 8px 10px;
  }

  .chat-control-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 0;
    min-width: 0;
  }

  .chat-control-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #657196;
  }

  .chat-engine-toggle {
    display: flex;
    padding: 2px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid #d3d8ee;
    gap: 2px;
    min-height: 32px;
  }

  .chat-engine-toggle button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #4a4f68;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chat-engine-toggle button[aria-pressed="true"] {
    background: #0a4584;
    color: #fff;
    box-shadow: 0 2px 6px rgba(10, 69, 132, 0.2);
  }

  .chat-engine-toggle button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .chat-provider-select {
    border: 1px solid #d3d8ee;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 0.78rem;
    background: #fff;
    color: #1f2937;
    width: 100%;
    min-height: 32px;
  }

  .chat-provider-select:focus {
    outline: none;
    border-color: #007aff;
    box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
  }

  .chat-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .chat-close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: #555;
  }

  .chat-messages {
    flex-grow: 1;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message {
    padding: 10px 14px;
    border-radius: 18px;
    max-width: 80%;
    line-height: 1.5;
    font-size: 0.9rem;
  }

  .message.user {
    background: #007aff;
    color: white;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }

  .message.assistant {
    background: #e5e5ea;
    color: #000;
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }

  .chat-input-form {
    display: flex;
    padding: 16px;
    border-top: 1px solid #eee;
    background: #fff;
    flex-shrink: 0;
  }

  .chat-input {
    flex-grow: 1;
    border: 1px solid #ddd;
    border-radius: 20px;
    padding: 10px 16px;
    font-size: 0.9rem;
    margin-right: 8px;
  }

  .chat-input:focus {
    outline: none;
    border-color: #007aff;
  }

  .chat-submit-button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: #007aff;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .chat-submit-button:disabled {
    background: #ccc;
  }

  @media (max-width: 480px) {
    .chat-panel-container {
      bottom: 24px;
      right: 16px;
    }
    .chat-panel {
      width: calc(100vw - 32px);
      height: 70vh;
      bottom: 80px;
    }
  }
`;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  answer: string;
  citations: Array<{ title?: string; source_url?: string }>;
};

type Engine = "native" | "lc";

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;

function isChatResponse(obj: any): obj is ChatResponse {
  return obj && typeof obj.answer === "string" && Array.isArray(obj.citations);
}

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const [engine, setEngine] = useState<Engine>("lc");
  const [provider, setProvider] = useState<ModelProvider>(
    DEFAULT_MODEL_PROVIDER,
  );

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? (localStorage.getItem("ask_engine") as Engine | null)
        : null;
    if (saved === "native" || saved === "lc") setEngine(saved);
  }, []);

  const setEngineAndSave = (next: Engine) => {
    setEngine(next);
    if (typeof window !== "undefined") localStorage.setItem("ask_engine", next);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem("ask_provider");
    if (stored) {
      setProvider(normalizeModelProvider(stored, DEFAULT_MODEL_PROVIDER));
    }
  }, []);

  const setProviderAndSave = (next: ModelProvider) => {
    setProvider(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("ask_provider", next);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = input.trim();

    if (!value || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: value,
    };

    const assistantMessageId = `assistant-${Date.now()}`;

    setMessages((prev) => {
      if (!isMountedRef.current) {
        return prev;
      }

      return [
        ...prev,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
        },
      ];
    });
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const run = async () => {
      try {
        const endpoint = `/api/chat?engine=${engine}`;

        if (engine === "lc") {
          // LangChain streaming
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: value,
              provider,
              embeddingProvider: provider,
            }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
              errorText || `Request failed with status ${response.status}`,
            );
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";

          const updateAssistant = (content: string) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content }
                  : message,
              ),
            );
          };

          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done ?? false;
            const chunk = result.value;
            if (!chunk) continue;

            fullContent += decoder.decode(chunk, { stream: !done });
            if (!isMountedRef.current) return;

            const [answer] = fullContent.split(CITATIONS_SEPARATOR);
            updateAssistant(answer);
          }

          const [answer, citationsJson] =
            fullContent.split(CITATIONS_SEPARATOR);
          let finalContent = answer;

          if (citationsJson) {
            try {
              const citations = JSON.parse(
                citationsJson,
              ) as ChatResponse["citations"];
              const citesText =
                citations
                  .filter((c) => c?.title || c?.source_url)
                  .map((c, i) =>
                    `(${i + 1}) ${c.title ?? ""} ${c.source_url ?? ""}`.trim(),
                  )
                  .join("\n") || "";
              if (citesText) {
                finalContent = `${answer.trim()}\n\n${citesText}`;
              }
            } catch {
              // ignore json parse errors
            }
          }

          if (isMountedRef.current) {
            updateAssistant(finalContent);
          }
        } else {
          // Native streaming
          // Native path: streaming (expects { messages })
          const sanitizedMessages = [...messages, userMessage].map(
            (message) => ({
              role: message.role,
              content: message.content,
            }),
          );

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: sanitizedMessages,
              provider,
              embeddingProvider: provider,
            }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
              errorText || `Request failed with status ${response.status}`,
            );
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let assistantContent = "";

          const updateAssistant = (content: string) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content }
                  : message,
              ),
            );
          };

          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done ?? false;
            const chunk = result.value;
            if (!chunk) continue;

            assistantContent += decoder.decode(chunk, { stream: !done });
            if (!isMountedRef.current) return;

            updateAssistant(assistantContent);
          }

          assistantContent += decoder.decode();
          if (assistantContent && isMountedRef.current) {
            updateAssistant(assistantContent);
          }
        }
      } catch (err) {
        console.error("Chat request failed", err);
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessageId
              ? { ...item, content: `Error: ${message}` }
              : item,
          ),
        );
      } finally {
        abortControllerRef.current = null;
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void run();
  };

  return (
    <>
      <style jsx>{styles}</style>
      <div className="chat-panel-container">
        <div className={`chat-panel ${isOpen ? "is-open" : ""}`}>
          <header className="chat-header">
            <div className="chat-header-top">
              <div className="chat-header-title">
                <GiBrain />
                <h3>Jack's AI Assistant</h3>
              </div>
              <button
                className="chat-close-button"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                <AiOutlineClose size={20} />
              </button>
            </div>
            <div className="chat-config-bar">
              <div className="chat-control-block" role="group">
                <span className="chat-control-label">Engine</span>
                <div className="chat-engine-toggle">
                  <button
                    type="button"
                    onClick={() => setEngineAndSave("native")}
                    aria-pressed={engine === "native"}
                    aria-label="Switch to native engine"
                    disabled={isLoading}
                  >
                    Native
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngineAndSave("lc")}
                    aria-pressed={engine === "lc"}
                    aria-label="Switch to LangChain engine"
                    disabled={isLoading}
                  >
                    LangChain
                  </button>
                </div>
              </div>
              <div className="chat-control-block">
                <span className="chat-control-label">Model</span>
                <select
                  className="chat-provider-select"
                  value={provider}
                  onChange={(event) =>
                    setProviderAndSave(event.target.value as ModelProvider)
                  }
                  disabled={isLoading}
                  aria-label="Model provider"
                >
                  {MODEL_PROVIDERS.map((option) => (
                    <option key={option} value={option}>
                      {MODEL_PROVIDER_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </header>

          <div className="chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={`message ${m.role}`}>
                {m.content}
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <span>...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleFormSubmit}>
            <input
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask me anything about Jack..."
              disabled={isLoading}
            />
            <button
              type="submit"
              className="chat-submit-button"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              <AiOutlineSend size={20} />
            </button>
          </form>
        </div>

        <button
          className="chat-panel-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open chat assistant"
        >
          <FcAssistant />
        </button>
      </div>
    </>
  );
}
