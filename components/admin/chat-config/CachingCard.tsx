import type { AdminChatConfig } from "@/types/chat-config";
import { ChatConfigCardHeader } from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="mb-6">
      <ChatConfigCardHeader
        title="Caching"
        description="Tune simple TTLs for chat responses and retrieval results."
      />
      <CardContent className="space-y-4 px-5 py-4">
        <div className="space-y-2">
          <Label htmlFor="cache-response-ttl">
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
          <p className="ai-meta-text">
            Cache time for full chat responses. 0 disables response caching.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cache-retrieval-ttl">
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
          <p className="ai-meta-text">
            Cache time for retrieval results. 0 disables retrieval caching.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
