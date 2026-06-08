import "@/styles/diagnostics-display-card.css";

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { SwitchField } from "@/components/ui/field";
import { cn } from "@/components/ui/utils";

type DiagnosticsDisplayControlsProps = {
  className?: string;
};

export function DiagnosticsDisplayControls({
  className,
}: DiagnosticsDisplayControlsProps) {
  const { showTelemetry, showCitations, setShowTelemetry, setShowCitations } =
    useChatDisplaySettings();

  return (
    <div className={cn("ai-diagnostics-display-card", className)}>
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
