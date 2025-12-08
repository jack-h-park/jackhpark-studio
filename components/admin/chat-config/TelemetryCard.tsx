import type {
  AdminChatConfig,
  TelemetryDetailLevel,
} from "@/types/chat-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radiobutton } from "@/components/ui/radiobutton";

export type TelemetryCardProps = {
  telemetry: AdminChatConfig["telemetry"];
  isFormBusy: boolean;
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
};

export function TelemetryCard({
  telemetry,
  isFormBusy,
  updateConfig,
}: TelemetryCardProps) {
  const handleTelemetrySampleRateChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      telemetry: {
        ...prev.telemetry,
        sampleRate: Number(nextValue),
      },
    }));
  };

  const handleTelemetryDetailLevelChange = (
    detailLevel: TelemetryDetailLevel,
  ) => {
    updateConfig((prev) => ({
      ...prev,
      telemetry: {
        ...prev.telemetry,
        detailLevel,
      },
    }));
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Telemetry &amp; Tracing</CardTitle>
        <p className="ai-card-description">
          Control how much data is sent to Langfuse for analysis.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="telemetry-sample-rate">Sample rate</Label>
          <Input
            id="telemetry-sample-rate"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={telemetry.sampleRate}
            onChange={(event) =>
              handleTelemetrySampleRateChange(event.target.value)
            }
            disabled={isFormBusy}
          />
          <p className="ai-meta-text">
            0 = no traces, 1 = all traces, 0.1 = ~10% sampling.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Detail level</Label>
          <div className="space-y-1">
            <Radiobutton
              name="telemetry-detail"
              value="minimal"
              label="Minimal"
              description="Only status, tokens, and latency."
              checked={telemetry.detailLevel === "minimal"}
              disabled={isFormBusy}
              onChange={(value) =>
                handleTelemetryDetailLevelChange(value as TelemetryDetailLevel)
              }
            />
            <Radiobutton
              name="telemetry-detail"
              value="standard"
              label="Standard"
              description="Includes the current chat config snapshot."
              checked={telemetry.detailLevel === "standard"}
              disabled={isFormBusy}
              onChange={(value) =>
                handleTelemetryDetailLevelChange(value as TelemetryDetailLevel)
              }
            />
            <Radiobutton
              name="telemetry-detail"
              value="verbose"
              label="Verbose"
              description="Adds extra debugging metadata (e.g., candidate chunks)."
              checked={telemetry.detailLevel === "verbose"}
              disabled={isFormBusy}
              onChange={(value) =>
                handleTelemetryDetailLevelChange(value as TelemetryDetailLevel)
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
