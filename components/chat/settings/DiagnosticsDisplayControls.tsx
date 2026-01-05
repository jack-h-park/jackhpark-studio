import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { SwitchField } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";

type DiagnosticsDisplayControlsProps = {
  compact?: boolean;
  className?: string;
  rowClassName?: string;
};

export function DiagnosticsDisplayControls({
  compact = false,
  className,
  rowClassName,
}: DiagnosticsDisplayControlsProps) {
  const { showTelemetry, showCitations, setShowTelemetry, setShowCitations } =
    useChatDisplaySettings();

  if (compact) {
    const rowClass = rowClassName ?? "flex items-center justify-between gap-3";
    return (
      <div className={className}>
        <div
          className={rowClass}
          title="Show telemetry badges like performance metrics and model info."
        >
          <span>Telemetry</span>
          <Switch
            checked={showTelemetry}
            onCheckedChange={setShowTelemetry}
            aria-label="Toggle telemetry"
          />
        </div>
        <div
          className={rowClass}
          title="Show source citations in chat responses."
        >
          <span>Citations</span>
          <Switch
            checked={showCitations}
            onCheckedChange={setShowCitations}
            aria-label="Toggle citations"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("ai-diagnostics-display-card", className)}
      title="Controls for telemetry and citation diagnostics"
    >
      <SwitchField
        id="telemetry-badges"
        label="Telemetry badges"
        description="Show engine, guardrail, and enhancement insights."
        checked={showTelemetry}
        onCheckedChange={setShowTelemetry}
        variant="plain"
        className="ai-diagnostics-display-field"
      />
      <SwitchField
        id="citations"
        label="Citations"
        description="Show every retrieved source (may include tiny text excerpts)."
        checked={showCitations}
        onCheckedChange={setShowCitations}
        variant="plain"
        className="ai-diagnostics-display-field"
      />
    </div>
  );
}
