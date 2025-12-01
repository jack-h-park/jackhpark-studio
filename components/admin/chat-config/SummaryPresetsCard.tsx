import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";

import type { AdminChatConfig } from "@/types/chat-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";

type SummaryPresetLevel = keyof AdminChatConfig["summaryPresets"];
const summaryLevelOptions: SummaryPresetLevel[] = ["low", "medium", "high"];

export type SummaryPresetsCardProps = {
  summaryPresets: AdminChatConfig["summaryPresets"];
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
};

export function SummaryPresetsCard({ summaryPresets, updateConfig }: SummaryPresetsCardProps) {
  const summaryGridLabelClass = "text-[0.9rem] font-semibold text-[color:var(--ai-text-muted)]";
  const summaryGridHeaderClass =
    "text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--ai-text-strong)]";
  const summaryGridValueClass = "flex flex-col gap-1";

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<FiBookOpen aria-hidden="true" />}>Summary Presets</CardTitle>
        <CardDescription>Choose how often summaries run for each level.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GridPanel className="gap-4 px-4 py-4">
          <div className="grid grid-cols-[minmax(150px,1fr)_repeat(3,minmax(0,1fr))] gap-3 items-center">
            <div className={`${summaryGridLabelClass} ${summaryGridHeaderClass}`}>Summary level</div>
            {summaryLevelOptions.map((level) => (
              <div key={`summary-header-${level}`} className={summaryGridHeaderClass}>
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
                    updateConfig((prev) => ({
                      ...prev,
                      summaryPresets: {
                        ...prev.summaryPresets,
                        [level]: {
                          every_n_turns: Number(event.target.value) > 0 ? Number(event.target.value) : 1,
                        },
                      },
                    }))
                  }
                />
                <span className="text-xs text-slate-500">turn(s)</span>
              </div>
            ))}
          </div>
        </GridPanel>
      </CardContent>
    </Card>
  );
}
