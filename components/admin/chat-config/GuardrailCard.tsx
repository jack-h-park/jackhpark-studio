import { FiShield } from "@react-icons/all-files/fi/FiShield";

import type { AdminChatConfig } from "@/types/chat-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<FiShield aria-hidden="true" />}>Guardrail Keywords &amp; Fallbacks</CardTitle>
        <CardDescription>
          Define how guardrails recognize chit-chat and how the assistant responds when light conversation or command intents are detected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="ai-field">
          <Label htmlFor="guardrailKeywords" className="ai-field__label">
            Chit-chat keywords
          </Label>
          <Textarea
            id="guardrailKeywords"
            rows={3}
            value={arrayToText(config.guardrails.chitchatKeywords)}
            onChange={(event) =>
              updateConfig((prev) => ({
                ...prev,
                guardrails: {
                  ...prev.guardrails,
                  chitchatKeywords: textToArray(event.target.value),
                },
              }))
            }
          />
          <p className="ai-field__description">
            Add keywords or phrases that should be treated as lightweight chit-chat and handled without hitting the knowledge base.
          </p>
        </div>
        <div className="ai-field">
          <Label htmlFor="guardrailFallbackChitchat" className="ai-field__label">
            Chit-chat fallback context
          </Label>
          <Textarea
            id="guardrailFallbackChitchat"
            value={config.guardrails.fallbackChitchat}
            onChange={(event) =>
              updateConfig((prev) => ({
                ...prev,
                guardrails: {
                  ...prev.guardrails,
                  fallbackChitchat: event.target.value,
                },
              }))
            }
            rows={3}
          />
          <p className="ai-field__description">
            The concise, friendly prompt injected whenever a chit-chat intent is detected.
          </p>
        </div>
        <div className="ai-field">
          <Label htmlFor="guardrailFallbackCommand" className="ai-field__label">
            Command fallback context
          </Label>
          <Textarea
            id="guardrailFallbackCommand"
            value={config.guardrails.fallbackCommand}
            onChange={(event) =>
              updateConfig((prev) => ({
                ...prev,
                guardrails: {
                  ...prev.guardrails,
                  fallbackCommand: event.target.value,
                },
              }))
            }
            rows={3}
          />
          <p className="ai-meta-text">
            The polite refusal context shown whenever a user asks the assistant to run actions or commands.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
