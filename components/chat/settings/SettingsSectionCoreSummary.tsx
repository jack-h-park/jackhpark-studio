"use client";

import { FiCommand } from "@react-icons/all-files/fi/FiCommand";

type Props = {
  summary: string;
};

export function SettingsSectionCoreSummary({ summary }: Props) {
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <div className="flex items-center gap-1.5">
        <FiCommand size={11} aria-hidden="true" className="shrink-0 opacity-50" />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
          Core System Behavior
        </span>
      </div>
      <p className="ai-setting-section-description">{summary}</p>
    </div>
  );
}
