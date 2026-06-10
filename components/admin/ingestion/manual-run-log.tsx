import type { ComponentType, JSX } from "react";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";

import type { ManualIngestionHookState } from "@/hooks/useManualIngestion";
import type { ManualLogEvent } from "@/lib/admin/ingestion-types";
import { WorkflowStep } from "@/components/admin/workflow";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { ManualLogEntry } from "@/components/ui/manual-log-entry";
import { cn } from "@/components/ui/utils";
import { logTimeFormatter } from "@/lib/admin/ingestion-formatters";

import manualStyles from "./ManualIngestionPanel.module.css";

const LOG_ICONS: Record<
  ManualLogEvent["level"],
  ComponentType<{ "aria-hidden"?: boolean }>
> = {
  info: FiInfo,
  warn: FiAlertTriangle,
  error: FiAlertCircle,
};

const manualRunLogSubtitleId = "manual-run-log-subtitle";

export type ManualRunLogProps = {
  ingestion: ManualIngestionHookState;
};

export function ManualRunLog({ ingestion }: ManualRunLogProps): JSX.Element {
  const runLogSubtitle =
    ingestion.logs.length === 0
      ? "No logs yet"
      : `${ingestion.logs.length} entr${
          ingestion.logs.length === 1 ? "y" : "ies"
        }`;

  return (
    <section className={cn("ai-panel", manualStyles.runLogPanel)}>
      <WorkflowStep
        title="Run Log"
        hint={runLogSubtitle}
        rightSlot={
          <CheckboxChoice
            className={cn("select-none", manualStyles.runLogToggle)}
            label="Auto-scroll to latest"
            checked={ingestion.autoScrollLogs}
            onCheckedChange={ingestion.handleToggleAutoScroll}
          />
        }
        hintId={manualRunLogSubtitleId}
        className={manualStyles.runLogStep}
      >
        <div className={manualStyles.runLogBody}>
          {ingestion.logs.length === 0 ? (
            <div className={manualStyles.runLogEmpty}>
              <span className={manualStyles.runLogEmptyIcon}>
                <FiInfo aria-hidden="true" />
              </span>
              <div className={manualStyles.runLogEmptyContent}>
                <p className="ai-text text-[color:var(--ai-text-muted)]">
                  No logs yet; run ingestion to populate entries.
                </p>
                <p className={cn("ai-meta-text", manualStyles.runLogEmptyHint)}>
                  Execution logs will stream here once you start a run.
                </p>
              </div>
            </div>
          ) : (
            <div
              className={manualStyles.logContainer}
              ref={ingestion.logsContainerRef}
              onScroll={ingestion.handleLogsScroll}
            >
              <ul className="grid list-none gap-3 p-0">
                {ingestion.logs.map((log) => {
                  const Icon = LOG_ICONS[log.level];
                  return (
                    <ManualLogEntry
                      key={log.id}
                      level={log.level}
                      icon={<Icon aria-hidden={true} />}
                      timestamp={logTimeFormatter.format(
                        new Date(log.timestamp),
                      )}
                      message={log.message}
                    />
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </WorkflowStep>
    </section>
  );
}
