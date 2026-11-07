import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const projectToken = process.env.POSTHOG_PROJECT_TOKEN;
const host = process.env.POSTHOG_HOST;

const loggerProvider =
  projectToken && host
    ? new LoggerProvider({
        resource: resourceFromAttributes({ "service.name": "tred-web-api" }),
        processors: [
          new BatchLogRecordProcessor(
            new OTLPLogExporter({
              url: `${host.replace(/\/$/, "")}/i/v1/logs`,
              headers: { Authorization: `Bearer ${projectToken}` },
            }),
            { exportTimeoutMillis: 3_000 },
          ),
        ],
      })
    : null;

const logger = loggerProvider?.getLogger("tred-web-api.posthog") ?? null;

export function logPosthogInfo(message: string, attributes: Record<string, string | number | boolean>): void {
  logger?.emit({ severityText: "INFO", body: message, attributes });
}

export async function shutdownPosthogLogs(): Promise<void> {
  await loggerProvider?.shutdown().catch(() => undefined);
}
