"use client";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

type Props = {
  messages: ChatMessage[];
};

export function ChatMessagesPanel({ messages }: Props) {
  return (
    <div className="chat-messages-panel">
      <div className="chat-messages-panel__list">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${
              message.role === "assistant"
                ? "chat-message--assistant"
                : "chat-message--user"
            } ${message.isError ? "chat-message--error" : ""}`}
          >
            <div className="chat-message__label">
              {message.role === "assistant" ? "Assistant" : "You"}
            </div>
            <p className="chat-message__content">{message.content}</p>
          </div>
        ))}
      </div>
      <style jsx>{`
        .chat-messages-panel {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .chat-messages-panel__list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .chat-message {
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          padding: 18px;
          background: #ffffff;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        }
        .chat-message--assistant {
          background: #f8fafc;
        }
        .chat-message--user {
          background: #ffffff;
        }
        .chat-message--error {
          border-color: #f87171;
          background: #fff5f5;
        }
        .chat-message__label {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 8px;
        }
        .chat-message__content {
          margin: 0;
          font-size: 1rem;
          color: #111827;
          white-space: pre-wrap;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
