import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";

import type { AdminChatConfig } from "@/types/chat-config";
import {
  ChatConfigCardContent,
  ChatConfigCardHeader,
} from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";

type SummaryPresetLevel = keyof AdminChatConfig["summaryPresets"];
const summaryLevelOptions: SummaryPresetLevel[] = ["low", "medium", "high"];

export type SummaryPresetsCardProps = {
  summaryPresets: AdminChatConfig["summaryPresets"];
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
};

export function SummaryPresetsCard({
  summaryPresets,
  updateConfig,
}: SummaryPresetsCardProps) {
  const summaryGridColumnHeaderClass =
    "t-eyebrow text-[color:var(--ai-text-strong)]";
  const summaryGridValueClass = "flex flex-col gap-1";
  const handleSummaryPresetChange = (
    level: SummaryPresetLevel,
    nextValue: number,
  ) => {
    const normalized = Number.isFinite(nextValue) ? nextValue : 1;
    const everyN = normalized > 0 ? normalized : 1;
    updateConfig((prev) => ({
      ...prev,
      summaryPresets: {
        ...prev.summaryPresets,
        [level]: {
          every_n_turns: everyN,
        },
      },
    }));
  };

  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiBookOpen aria-hidden="true" />}
        title="Summary Presets"
        description="Choose how often summaries run for each level."
      />
      <ChatConfigCardContent className="space-y-4">
        <GridPanel className="gap-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] px-4 py-4">
          <div className="grid grid-cols-[minmax(150px,1fr)_repeat(3,minmax(0,1fr))] gap-3 items-center">
            <div className={summaryGridColumnHeaderClass}>
              Summary level
            </div>
            {summaryLevelOptions.map((level) => (
              <div
                key={`summary-header-${level}`}
                className={summaryGridColumnHeaderClass}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </div>
            ))}
            <div className="ai-label-emphasis">Every n turns</div>
            {summaryLevelOptions.map((level) => (
              <div key={`summary-${level}`} className={summaryGridValueClass}>
                <Input
                  id={`summary-${level}`}
                  type="number"
                  min={1}
                  aria-label={`Every n turns for ${level} summary`}
                  value={summaryPresets[level].every_n_turns}
                  onChange={(event) =>
                    handleSummaryPresetChange(level, Number(event.target.value))
                  }
                />
                <span className="ai-helper-text">
                  turn(s)
                </span>
              </div>
            ))}
          </div>
        </GridPanel>
      </ChatConfigCardContent>
    </Card>
  );
}
