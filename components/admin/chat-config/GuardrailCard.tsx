import { FiShield } from "@react-icons/all-files/fi/FiShield";

import type { AdminChatConfig } from "@/types/chat-config";
import { ChatConfigCardHeader } from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function arrayToText(list: string[]) {
  return list.join("\n");
}

function textToArray(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type GuardrailCardProps = {
  config: AdminChatConfig;
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
};

export function GuardrailCard({ config, updateConfig }: GuardrailCardProps) {
  const handleChitchatKeywordsChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails,
        chitchatKeywords: textToArray(nextValue),
      },
    }));
  };

  const handleFallbackChitchatChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails,
        fallbackChitchat: nextValue,
      },
    }));
  };

  const handleFallbackCommandChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails,
        fallbackCommand: nextValue,
      },
    }));
  };

  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiShield aria-hidden="true" />}
        title="Guardrail Keywords &amp; Fallbacks"
        description="Define how guardrails recognize chit-chat and how the assistant responds when light conversation or command intents are detected."
      />
      <CardContent className="space-y-5 px-5 py-4">
        <div className="space-y-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] p-4">
          <p className="ai-label-overline ai-label-overline--muted">
            Behavior detection
          </p>
          <Field
            id="guardrailKeywords"
            label="Chit-chat keywords"
            description="Add keywords or phrases treated as lightweight chit-chat instead of knowledge base queries."
            className="max-w-[64ch]"
          >
            <Textarea
              rows={3}
              value={arrayToText(config.guardrails.chitchatKeywords)}
              onChange={(event) =>
                handleChitchatKeywordsChange(event.target.value)
              }
              className="w-full max-w-[64ch]"
            />
          </Field>
        </div>
        <div className="space-y-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] p-4">
          <p className="ai-label-overline ai-label-overline--muted">
            Fallback messaging
          </p>
          <div className="ai-field max-w-[64ch]">
            <Label
              htmlFor="guardrailFallbackChitchat"
              className="ai-field__label"
            >
              Chit-chat fallback context
            </Label>
            <Textarea
              id="guardrailFallbackChitchat"
              aria-describedby="guardrail-fallback-chitchat-description"
              value={config.guardrails.fallbackChitchat}
              onChange={(event) =>
                handleFallbackChitchatChange(event.target.value)
              }
              rows={3}
              className="w-full max-w-[64ch]"
            />
            <p
              id="guardrail-fallback-chitchat-description"
              className="ai-field__description"
            >
              The concise prompt injected whenever a chit-chat intent is
              detected.
            </p>
          </div>
          <div className="ai-field max-w-[64ch]">
            <Label htmlFor="guardrailFallbackCommand" className="ai-field__label">
              Command fallback context
            </Label>
            <Textarea
              id="guardrailFallbackCommand"
              aria-describedby="guardrail-fallback-command-description"
              value={config.guardrails.fallbackCommand}
              onChange={(event) =>
                handleFallbackCommandChange(event.target.value)
              }
              rows={3}
              className="w-full max-w-[64ch]"
            />
            <p
              id="guardrail-fallback-command-description"
              className="ai-meta-text"
            >
              The polite refusal context shown whenever a user asks the
              assistant to run actions or commands.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
