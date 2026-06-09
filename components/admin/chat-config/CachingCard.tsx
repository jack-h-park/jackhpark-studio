import { FiClock } from "@react-icons/all-files/fi/FiClock";

import type { AdminChatConfig } from "@/types/chat-config";
import {
  ChatConfigCardContent,
  ChatConfigCardHeader,
} from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CachingCardProps = {
  cache: AdminChatConfig["cache"];
  isFormBusy: boolean;
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
};

export function CachingCard({
  cache,
  isFormBusy,
  updateConfig,
}: CachingCardProps) {
  const handleResponseCacheTtlChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      cache: {
        ...prev.cache,
        responseTtlSeconds: Number(nextValue),
      },
    }));
  };

  const handleRetrievalCacheTtlChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      cache: {
        ...prev.cache,
        retrievalTtlSeconds: Number(nextValue),
      },
    }));
  };

  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiClock aria-hidden="true" />}
        title="Caching"
        description="Tune simple TTLs for chat responses and retrieval results."
      />
      <ChatConfigCardContent className="space-y-4">
        <div className="ai-field">
          <Label htmlFor="cache-response-ttl" className="ai-field__label">
            Response cache TTL (seconds)
          </Label>
          <Input
            id="cache-response-ttl"
            type="number"
            min={0}
            value={cache.responseTtlSeconds}
            onChange={(event) =>
              handleResponseCacheTtlChange(event.target.value)
            }
            disabled={isFormBusy}
          />
          <p className="ai-field__description">
            Cache time for full chat responses. 0 disables response caching.
          </p>
        </div>

        <div className="ai-field">
          <Label htmlFor="cache-retrieval-ttl" className="ai-field__label">
            Retrieval cache TTL (seconds)
          </Label>
          <Input
            id="cache-retrieval-ttl"
            type="number"
            min={0}
            value={cache.retrievalTtlSeconds}
            onChange={(event) =>
              handleRetrievalCacheTtlChange(event.target.value)
            }
            disabled={isFormBusy}
          />
          <p className="ai-field__description">
            Cache time for retrieval results. 0 disables retrieval caching.
          </p>
        </div>
      </ChatConfigCardContent>
    </Card>
  );
}
