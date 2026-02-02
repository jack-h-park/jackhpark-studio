import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";

import type { AdminChatConfig } from "@/types/chat-config";
import { ChatConfigCardHeader } from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card, CardContent } from "@/components/ui/card";
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
  const summaryGridLabelClass =
    "ai-label-overline text-[0.9rem] text-[color:var(--ai-text-muted)]";
  const summaryGridHeaderClass =
    "ai-label-overline tracking-[0.2em] text-[0.7rem] text-[color:var(--ai-text-strong)]";
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
      <CardContent className="space-y-4 px-5 py-4">
        <GridPanel className="gap-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] px-4 py-4">
          <div className="grid grid-cols-[minmax(150px,1fr)_repeat(3,minmax(0,1fr))] gap-3 items-center">
            <div
              className={`${summaryGridLabelClass} ${summaryGridHeaderClass}`}
            >
              Summary level
            </div>
            {summaryLevelOptions.map((level) => (
              <div
                key={`summary-header-${level}`}
                className={summaryGridHeaderClass}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </div>
            ))}
            <div className={summaryGridLabelClass}>Every n turns</div>
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
                <span className="text-xs text-[var(--ai-text-muted)]">turn(s)</span>
              </div>
            ))}
          </div>
        </GridPanel>
      </CardContent>
    </Card>
  );
}
