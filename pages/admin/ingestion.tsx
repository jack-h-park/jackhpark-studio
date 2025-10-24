import type { GetServerSideProps } from 'next'
import type { JSX } from 'react'
import Head from 'next/head'

import { getSupabaseAdminClient } from '../../lib/supabase-admin'

type RunRecord = {
  id: string
  source: string
  ingestion_type: 'full' | 'partial'
  partial_reason: string | null
  status: 'in_progress' | 'success' | 'completed_with_errors' | 'failed'
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  documents_processed: number | null
  documents_added: number | null
  documents_updated: number | null
  documents_skipped: number | null
  chunks_added: number | null
  chunks_updated: number | null
  characters_added: number | null
  characters_updated: number | null
  error_count: number | null
  error_logs: Array<{
    context?: string | null
    doc_id?: string | null
    message: string
  }> | null
  metadata: Record<string, unknown> | null
}

type Overview = {
  totalDocuments: number
  totalChunks: number
  totalCharacters: number
  lastUpdatedAt: string | null
}

type PageProps = {
  overview: Overview
  runs: RunRecord[]
}

const numberFormatter = new Intl.NumberFormat('en-US')
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return dateFormatter.format(date)
}

function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs < 0) {
    return '--'
  }

  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${remainingSeconds}s`
}

function formatCharacters(characters: number | null | undefined): string {
  if (!characters || characters <= 0) {
    return '0'
  }

  const approxBytes = characters
  const units = ['B', 'KB', 'MB', 'GB']
  let size = approxBytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${numberFormatter.format(characters)} chars (${size.toFixed(1)} ${
    units[unitIndex]
  })`
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toNumberOrZero(value: unknown): number {
  return toNullableNumber(value) ?? 0
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

function toStatus(value: unknown): RunRecord['status'] {
  if (
    value === 'in_progress' ||
    value === 'completed_with_errors' ||
    value === 'failed'
  ) {
    return value
  }

  return 'success'
}

function toIngestionType(value: unknown): RunRecord['ingestion_type'] {
  return value === 'partial' ? 'partial' : 'full'
}

function toIsoStringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

function normalizeErrorLogs(value: unknown): RunRecord['error_logs'] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!isPlainRecord(entry)) {
        return null
      }

      const message = entry.message
      if (typeof message !== 'string' || message.length === 0) {
        return null
      }

      const context = entry.context
      const docId = entry.doc_id

      return {
        message,
        context: typeof context === 'string' ? context : null,
        doc_id: typeof docId === 'string' ? docId : null
      }
    })
    .filter(
      (entry): entry is { message: string; context: string | null; doc_id: string | null } =>
        entry !== null
    )
}

function normalizeRunRecord(raw: unknown): RunRecord {
  const record: Record<string, unknown> = isPlainRecord(raw) ? raw : {}

  const metadata = isPlainRecord(record.metadata)
    ? (record.metadata as Record<string, unknown>)
    : null

  const idValue = record.id
  const startedAtValue = record.started_at
  const endedAtValue = record.ended_at

  return {
    id:
      typeof idValue === 'string'
        ? idValue
        : idValue !== undefined && idValue !== null
          ? String(idValue)
          : '',
    source: typeof record.source === 'string' ? record.source : 'unknown',
    ingestion_type: toIngestionType(record.ingestion_type),
    partial_reason: toStringOrNull(record.partial_reason),
    status: toStatus(record.status),
    started_at:
      toIsoStringOrNull(startedAtValue) ?? new Date(0).toISOString(),
    ended_at: toIsoStringOrNull(endedAtValue),
    duration_ms: toNullableNumber(record.duration_ms),
    documents_processed: toNumberOrZero(record.documents_processed),
    documents_added: toNumberOrZero(record.documents_added),
    documents_updated: toNumberOrZero(record.documents_updated),
    documents_skipped: toNumberOrZero(record.documents_skipped),
    chunks_added: toNumberOrZero(record.chunks_added),
    chunks_updated: toNumberOrZero(record.chunks_updated),
    characters_added: toNumberOrZero(record.characters_added),
    characters_updated: toNumberOrZero(record.characters_updated),
    error_count: toNumberOrZero(record.error_count),
    error_logs: normalizeErrorLogs(record.error_logs),
    metadata
  }
}

function getStringMetadata(
  metadata: Record<string, unknown> | null,
  key: string
): string | null {
  if (!metadata) {
    return null
  }

  const value = metadata[key]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return null
}

function getNumericMetadata(
  metadata: Record<string, unknown> | null,
  key: string
): number | null {
  if (!metadata) {
    return null
  }

  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function IngestionDashboard({ overview, runs }: PageProps): JSX.Element {
  return (
    <>
      <Head>
        <title>Ingestion Dashboard</title>
      </Head>

      <main className="ingestion-dashboard">
        <h1>Ingestion Dashboard</h1>

        <section className="overview">
          <h2>Current Snapshot</h2>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Documents</span>
              <span className="metric-value">
                {numberFormatter.format(overview.totalDocuments)}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Chunks</span>
              <span className="metric-value">
                {numberFormatter.format(overview.totalChunks)}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Content Size</span>
              <span className="metric-value">
                {formatCharacters(overview.totalCharacters)}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Last Updated</span>
              <span className="metric-value">
                {formatDate(overview.lastUpdatedAt)}
              </span>
            </div>
          </div>
        </section>

        <section className="history">
          <h2>Recent Runs</h2>
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Docs</th>
                  <th>Data Added</th>
                  <th>Data Updated</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      No ingestion runs have been recorded yet.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => {
                    const errorCount = run.error_count ?? 0
                    const logs = run.error_logs ?? []
                    const rootPageId = getStringMetadata(
                      run.metadata,
                      'rootPageId'
                    )
                    const urlCount = getNumericMetadata(
                      run.metadata,
                      'urlCount'
                    )

                    return (
                      <tr key={run.id}>
                        <td>
                          <div>{formatDate(run.started_at)}</div>
                          {run.ended_at && (
                            <div className="subtle">
                              Finished: {formatDate(run.ended_at)}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`status status-${run.status}`}>
                            {run.status.replaceAll('_', ' ')}
                          </span>
                          {errorCount > 0 && (
                            <details>
                              <summary>{errorCount} issue(s)</summary>
                              <ul>
                                {logs.slice(0, 5).map((log, index) => (
                                  <li key={index}>
                                    {log.doc_id && (
                                      <strong>{log.doc_id}: </strong>
                                    )}
                                    {log.context && (
                                      <span>{log.context}: </span>
                                    )}
                                    {log.message}
                                  </li>
                                ))}
                                {logs.length > 5 && (
                                  <li>??{logs.length - 5} more</li>
                                )}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td>
                          <div className="badge">
                            {run.ingestion_type === 'full' ? 'Full' : 'Partial'}
                          </div>
                          {run.partial_reason && (
                            <div className="subtle">{run.partial_reason}</div>
                          )}
                        </td>
                        <td>{formatDuration(run.duration_ms ?? 0)}</td>
                        <td>
                          <div>
                            Added:{' '}
                            {numberFormatter.format(run.documents_added ?? 0)}
                          </div>
                          <div>
                            Updated:{' '}
                            {numberFormatter.format(run.documents_updated ?? 0)}
                          </div>
                          <div>
                            Skipped:{' '}
                            {numberFormatter.format(run.documents_skipped ?? 0)}
                          </div>
                        </td>
                        <td>{formatCharacters(run.characters_added ?? 0)}</td>
                        <td>
                          {formatCharacters(run.characters_updated ?? 0)}
                        </td>
                        <td>
                          {rootPageId ? (
                            <div className="subtle">
                              Root: {rootPageId}
                            </div>
                          ) : null}
                          {urlCount !== null ? (
                            <div className="subtle">
                              URLs: {numberFormatter.format(urlCount)}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <style jsx>{`
        .ingestion-dashboard {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        h1 {
          font-size: 2rem;
          font-weight: 600;
        }

        h2 {
          font-size: 1.4rem;
          margin-bottom: 1rem;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }

        .metric-card {
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.8);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .metric-label {
          font-size: 0.9rem;
          color: rgba(0, 0, 0, 0.6);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-value {
          font-size: 1.4rem;
          font-weight: 600;
        }

        .history-table-container {
          overflow-x: auto;
        }

        .history-table {
          width: 100%;
          border-collapse: collapse;
        }

        .history-table th,
        .history-table td {
          border: 1px solid rgba(0, 0, 0, 0.1);
          padding: 0.75rem;
          vertical-align: top;
          text-align: left;
        }

        .history-table th {
          background: rgba(0, 0, 0, 0.05);
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          padding: 2rem;
          color: rgba(0, 0, 0, 0.6);
        }

        .status {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 8px;
          text-transform: capitalize;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .status-success {
          background: #e0f7e9;
          color: #0b5d1e;
        }

        .status-completed_with_errors {
          background: #fff4d6;
          color: #9a6400;
        }

        .status-failed {
          background: #fde7e7;
          color: #a01c1c;
        }

        .status-in_progress {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .badge {
          display: inline-block;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.08);
          font-size: 0.8rem;
          font-weight: 600;
        }

        .subtle {
          font-size: 0.85rem;
          color: rgba(0, 0, 0, 0.6);
        }

        details {
          margin-top: 0.5rem;
        }

        details summary {
          cursor: pointer;
          color: #1d4ed8;
        }

        details ul {
          margin: 0.5rem 0 0;
          padding-left: 1.25rem;
        }
      `}</style>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  _context
) => {
  const supabase = getSupabaseAdminClient()

  const { data: runsData } = await supabase
    .from('rag_ingest_runs')
    .select(
      'id, source, ingestion_type, partial_reason, status, started_at, ended_at, duration_ms, documents_processed, documents_added, documents_updated, documents_skipped, chunks_added, chunks_updated, characters_added, characters_updated, error_count, error_logs, metadata'
    )
    .order('started_at', { ascending: false })
    .limit(50)

  const { data: documentsData } = await supabase
    .from('rag_documents')
    .select('doc_id, chunk_count, total_characters, last_ingested_at')

  const runs: RunRecord[] = (runsData ?? []).map((run) =>
    normalizeRunRecord(run)
  )

  const docs = documentsData ?? []
  const totalDocuments = docs.length
  const totalChunks = docs.reduce(
    (sum, doc) => sum + (doc.chunk_count ?? 0),
    0
  )
  const totalCharacters = docs.reduce(
    (sum, doc) => sum + (doc.total_characters ?? 0),
    0
  )
  const lastUpdatedTimestamp = docs.reduce<number | null>((latest, doc) => {
    const date = parseDate(doc.last_ingested_at)
    if (!date) {
      return latest
    }

    const timestamp = date.getTime()
    if (Number.isNaN(timestamp)) {
      return latest
    }

    if (latest === null || timestamp > latest) {
      return timestamp
    }

    return latest
  }, null)

  const lastUpdatedAt =
    lastUpdatedTimestamp === null
      ? null
      : new Date(lastUpdatedTimestamp).toISOString()

  return {
    props: {
      overview: {
        totalDocuments,
        totalChunks,
        totalCharacters,
        lastUpdatedAt
      },
      runs
    }
  }
}

export default IngestionDashboard
