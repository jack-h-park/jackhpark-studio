import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { SwitchField } from "@/components/ui/field";

export function DiagnosticsDisplayControls() {
  const { showTelemetry, showCitations, setShowTelemetry, setShowCitations } =
    useChatDisplaySettings();

  return (
    <div className="flex flex-col gap-4">
      <SwitchField
        id="telemetry-badges"
        label="Telemetry badges"
        description="Show engine, guardrail, and enhancement insights."
        checked={showTelemetry}
        onCheckedChange={setShowTelemetry}
        variant="plain"
      />
      <SwitchField
        id="citations"
        label="Citations"
        description="Show every retrieved source (may include tiny text excerpts)."
        checked={showCitations}
        onCheckedChange={setShowCitations}
        variant="plain"
      />
    </div>
  );
}
