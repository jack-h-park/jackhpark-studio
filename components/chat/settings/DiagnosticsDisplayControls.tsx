import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { SwitchField } from "@/components/ui/field";

export function DiagnosticsDisplayControls() {
  const { sessionConfig, setSessionConfig } = useChatConfig();

  return (
    <div className="flex flex-col gap-4">
      <SwitchField
        id="telemetry-badges"
        label="Response insights"
        description="Show engine, guardrail, and enhancement details on each answer."
        checked={sessionConfig.showTelemetry}
        onCheckedChange={(value) =>
          setSessionConfig((prev) => ({ ...prev, showTelemetry: value }))
        }
        variant="plain"
      />
      <SwitchField
        id="citations"
        label="Citations"
        description="Show every retrieved source (may include tiny text excerpts)."
        checked={sessionConfig.showCitations}
        onCheckedChange={(value) =>
          setSessionConfig((prev) => ({ ...prev, showCitations: value }))
        }
        variant="plain"
      />
    </div>
  );
}
