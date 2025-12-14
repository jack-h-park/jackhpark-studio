export type LogLevel = "off" | "error" | "info" | "debug" | "trace";

export type TelemetryDetailLevel = "minimal" | "standard" | "verbose";

export interface TelemetryConfig {
  enabled: boolean;
  sampleRate: number;
  detailLevel: TelemetryDetailLevel;
}

export interface DomainLoggingConfig {
  level: LogLevel;
}

export interface LoggingConfig {
  env: "local" | "preview" | "production";
  globalLevel: LogLevel;

  rag: DomainLoggingConfig;
  ingestion: DomainLoggingConfig;
  notion: DomainLoggingConfig;
  externalLLM: DomainLoggingConfig;
  telemetryLog: DomainLoggingConfig;

  telemetry: TelemetryConfig;
}
