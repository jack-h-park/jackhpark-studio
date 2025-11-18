import type { ErrorLogEntry } from "@/lib/admin/ingestion-runs";

type ErrorLogListProps = {
  logs: ErrorLogEntry[];
};

export function ErrorLogList({ logs }: ErrorLogListProps) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-[color:var(--ai-text-muted)]">
        No error logs recorded.
      </p>
    );
  }

  return (
    <ul className="space-y-2 text-sm text-[color:var(--ai-text-muted)]">
      {logs.map((log, index) => (
        <li key={index} className="leading-relaxed">
          {log.doc_id ? (
            <strong className="text-[color:var(--ai-text-strong)]">
              {log.doc_id}:{" "}
            </strong>
          ) : null}
          {log.context ? (
            <span>{log.context}: </span>
          ) : null}
          <span>{log.message}</span>
        </li>
      ))}
    </ul>
  );
}
