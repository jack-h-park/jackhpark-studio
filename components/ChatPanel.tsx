"use client";

import { AiOutlineClose } from "@react-icons/all-files/ai/AiOutlineClose";
import { AiOutlineSend } from "@react-icons/all-files/ai/AiOutlineSend";
import { FcAssistant } from "@react-icons/all-files/fc/FcAssistant";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import css from "styled-jsx/css";

const styles = css`
  .chat-panel-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
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
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
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
      bottom: 16px;
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
          // LangChain path: JSON request/response (non-streaming)
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: value }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
              errorText || `Request failed with status ${response.status}`,
            );
          }

          const json = await response.json().catch(() => ({}) as any);
          if (!isChatResponse(json)) {
            throw new Error("Invalid response from server");
          }

          const answer: string = json.answer ?? "";
          const citations: Array<{ title?: string; source_url?: string }> =
            json.citations ?? [];
          const citesText =
            citations
              .filter((c) => c?.title || c?.source_url)
              .map((c, i) =>
                `(${i + 1}) ${c.title ?? ""} ${c.source_url ?? ""}`.trim(),
              )
              .join("\n") || "";

          const finalContent = citesText ? `${answer}\n\n${citesText}` : answer;

          // update assistant once (non-stream)
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: finalContent }
                : message,
            ),
          );
        } else {
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
            body: JSON.stringify({ messages: sanitizedMessages }),
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
            <h3>Jack's AI Assistant</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setEngineAndSave("native")}
                aria-pressed={engine === "native"}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border:
                    engine === "native" ? "2px solid #444" : "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                }}
                title="Direct (framework-free) engine"
              >
                Native
              </button>
              <button
                type="button"
                onClick={() => setEngineAndSave("lc")}
                aria-pressed={engine === "lc"}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: engine === "lc" ? "2px solid #444" : "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                }}
                title="LangChain engine"
              >
                LangChain
              </button>
            </div>
            <button
              className="chat-close-button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <AiOutlineClose size={20} />
            </button>
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
