import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { parsePageId } from 'notion-utils'
import { type JSX, useCallback, useEffect, useRef, useState } from 'react'

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

type ManualRunStats = {
  documentsProcessed: number
  documentsAdded: number
  documentsUpdated: number
  documentsSkipped: number
  chunksAdded: number
  chunksUpdated: number
  charactersAdded: number
  charactersUpdated: number
  errorCount: number
}

type ManualIngestionStatus =
  | 'idle'
  | 'in_progress'
  | 'success'
  | 'completed_with_errors'
  | 'failed'

type ManualEvent =
  | { type: 'run'; runId: string | null }
  | { type: 'log'; message: string; level?: 'info' | 'warn' | 'error' }
  | { type: 'progress'; step: string; percent: number }
  | {
      type: 'complete'
      status: 'success' | 'completed_with_errors' | 'failed'
      message?: string
      runId: string | null
      stats: ManualRunStats
    }

type ManualLogEntry = {
  id: string
  message: string
  level: 'info' | 'warn' | 'error'
  timestamp: number
}

type DocumentRow = {
  chunk_count: number | null
  total_characters: number | null
  last_ingested_at: string | number | null
}

const manualStatusLabels: Record<ManualIngestionStatus, string> = {
  idle: 'Idle',
  in_progress: 'In Progress',
  success: 'Succeeded',
  completed_with_errors: 'Completed with Errors',
  failed: 'Failed'
}

const numberFormatter = new Intl.NumberFormat('en-US')
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short'
})
const logTimeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

function createLogEntry(
  message: string,
  level: 'info' | 'warn' | 'error'
): ManualLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    level,
    timestamp: Date.now()
  }
}

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

function ManualIngestionPanel(): JSX.Element {
  const [mode, setMode] = useState<'notion_page' | 'url'>('notion_page')
  const [notionInput, setNotionInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<ManualIngestionStatus>('idle')
  const [runId, setRunId] = useState<string | null>(null)
  const [finalMessage, setFinalMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [logs, setLogs] = useState<ManualLogEntry[]>([])
  const [stats, setStats] = useState<ManualRunStats | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const appendLog = useCallback(
    (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
      if (!mountedRef.current) {
        return
      }

      setLogs((prev) => [...prev, createLogEntry(message, level)])
    },
    []
  )

  const handleEvent = useCallback(
    (event: ManualEvent) => {
      if (!mountedRef.current) {
        return
      }

      let completionMessage = ''
      let completionLevel: 'info' | 'warn' | 'error' = 'info'

      switch (event.type) {
        case 'run':
          setRunId(event.runId)
          if (event.runId) {
            appendLog(`Supabase run ID: ${event.runId}`)
          }
          break
        case 'log':
          appendLog(event.message, event.level ?? 'info')
          break
        case 'progress':
          setProgress(Math.max(0, Math.min(100, event.percent)))
          break
        case 'complete':
          completionMessage =
            event.message ?? 'Manual ingestion finished successfully.'
          completionLevel =
            event.status === 'failed'
              ? 'error'
              : event.status === 'completed_with_errors'
                ? 'warn'
                : 'info'
          setStatus(event.status)
          setStats(event.stats)
          setRunId(event.runId)
          setFinalMessage(completionMessage)
          appendLog(completionMessage, completionLevel)
          setProgress(100)
          setIsRunning(false)
          break
        default:
          break
      }
    },
    [appendLog]
  )

  const startManualIngestion = useCallback(async () => {
    if (isRunning) {
      return
    }

    let payload:
      | { mode: 'notion_page'; pageId: string }
      | { mode: 'url'; url: string }

    if (mode === 'notion_page') {
      const parsed = parsePageId(notionInput.trim(), { uuid: true })
      if (!parsed) {
        setErrorMessage('Enter a valid Notion page ID or URL.')
        return
      }
      payload = { mode: 'notion_page', pageId: parsed }
    } else {
      const trimmed = urlInput.trim()
      if (!trimmed) {
        setErrorMessage('Enter at least one URL to ingest.')
        return
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(trimmed)
      } catch {
        setErrorMessage('Enter a valid URL.')
        return
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        setErrorMessage('Only HTTP and HTTPS URLs are supported.')
        return
      }

      payload = { mode: 'url', url: parsedUrl.toString() }
    }

    if (!mountedRef.current) {
      return
    }

    setErrorMessage(null)
    setIsRunning(true)
    setStatus('in_progress')
    setProgress(0)
    setRunId(null)
    setFinalMessage(null)
    setStats(null)
    const startLog =
      mode === 'notion_page'
        ? 'Starting manual ingestion for the Notion page.'
        : 'Starting manual ingestion for the provided URL.'
    setLogs([createLogEntry(startLog, 'info')])

    try {
      const response = await fetch('/api/admin/manual-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        let message = `Request failed. (${response.status})`
        const contentType = response.headers.get('content-type') ?? ''

        if (contentType.includes('application/json')) {
          try {
            const data = (await response.json()) as { error?: unknown }
            if (
              typeof data.error === 'string' &&
              data.error.trim().length > 0
            ) {
              message = data.error.trim()
            }
          } catch {
            // ignore
          }
        } else {
          try {
            const text = await response.text()
            if (text.trim()) {
              message = text.trim()
            }
          } catch {
            // ignore
          }
        }

        throw new Error(message)
      }

      if (!response.body) {
        throw new Error('Streaming responses are not supported in this browser.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed = false

      const forwardEvent = (event: ManualEvent) => {
        if (event.type === 'complete') {
          completed = true
        }
        handleEvent(event)
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })

        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary).trim()
          buffer = buffer.slice(boundary + 2)

          if (raw) {
            const dataLine = raw
              .split('\n')
              .find((line: string) => line.startsWith('data:'))

            if (dataLine) {
              const payloadStr = dataLine.slice(5).trim()
              if (payloadStr) {
                try {
                  const event = JSON.parse(payloadStr) as ManualEvent
                  forwardEvent(event)
                } catch {
                  // ignore malformed payloads
                }
              }
            }
          }

          boundary = buffer.indexOf('\n\n')
        }
      }

      if (buffer.trim()) {
        const dataLine = buffer
          .trim()
          .split('\n')
          .find((line: string) => line.startsWith('data:'))

        if (dataLine) {
          const payloadStr = dataLine.slice(5).trim()
          if (payloadStr) {
            try {
              const event = JSON.parse(payloadStr) as ManualEvent
              forwardEvent(event)
            } catch {
              // ignore malformed payloads
            }
          }
        }
      }

      if (!completed && mountedRef.current) {
        const message = 'Manual ingestion ended unexpectedly.'
        setStatus('failed')
        setProgress((prev) => Math.max(prev, 100))
        setFinalMessage(message)
        appendLog(message, 'error')
      }
    } catch (err) {
      if (!mountedRef.current) {
        return
      }

      const message =
        err instanceof Error
          ? err.message
          : 'An error occurred while running manual ingestion.'
      setStatus('failed')
      setProgress((prev) => Math.max(prev, 100))
      setFinalMessage(message)
      appendLog(message, 'error')
    } finally {
      if (mountedRef.current) {
        setIsRunning(false)
      }
    }
  }, [
    appendLog,
    handleEvent,
    isRunning,
    mode,
    notionInput,
    urlInput
  ])

  return (
    <section className="manual-ingest dashboard-card">
      <div className="manual-header">
        <h2>Manual Ingestion</h2>
        <p className="manual-subtitle">
          Trigger manual ingestion for a Notion page or external URL and track the progress here.
        </p>
      </div>

      <div className="manual-grid">
        <div className="manual-panel">
          <div className="manual-mode">
            <span className="mode-label">Source type</span>
            <div className="mode-tabs" role="tablist" aria-label="Manual ingestion source">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'notion_page'}
                className={`mode-tab ${mode === 'notion_page' ? 'is-active' : ''}`}
                onClick={() => setMode('notion_page')}
                disabled={isRunning}
              >
                <span className="mode-tab__title">Notion Page</span>
                <span className="mode-tab__caption">Sync from your workspace</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'url'}
                className={`mode-tab ${mode === 'url' ? 'is-active' : ''}`}
                onClick={() => setMode('url')}
                disabled={isRunning}
              >
                <span className="mode-tab__title">External URL</span>
                <span className="mode-tab__caption">Fetch a public article</span>
              </button>
            </div>
          </div>

          <div
            className="manual-content"
            style={{
              border: '1px solid rgba(55, 53, 47, 0.16)',
              borderTop: 'none',
              borderRadius: '0 0 12px 12px',
              background: 'rgba(248, 248, 246, 0.9)',
              padding: '1.4rem 1.6rem'
            }}
          >
            <div className="manual-form">
              {mode === 'notion_page' ? (
                <div className="manual-field">
                  <label htmlFor="manual-notion-input">Notion Page ID or URL</label>
                  <div className="input-shell">
                    <input
                      id="manual-notion-input"
                      type="text"
                      placeholder="https://www.notion.so/... or page ID"
                      value={notionInput}
                      onChange={(event) => setNotionInput(event.target.value)}
                      disabled={isRunning}
                    />
                  </div>
                </div>
              ) : (
                <div className="manual-field">
                  <label htmlFor="manual-url-input">URL to ingest</label>
                  <div className="input-shell">
                    <input
                      id="manual-url-input"
                      type="url"
                      placeholder="https://example.com/article"
                      value={urlInput}
                      onChange={(event) => setUrlInput(event.target.value)}
                      disabled={isRunning}
                    />
                  </div>
                </div>
              )}

              <p className="field-hint">
                {mode === 'notion_page'
                  ? 'Paste the full shared link or the 32-character page ID from Notion.'
                  : 'Enter a public HTTP(S) link. We will fetch, parse, and ingest the article once.'}
              </p>

              {errorMessage ? (
                <div className="form-error">{errorMessage}</div>
              ) : null}

              <div className="manual-actions">
                <button
                  type="button"
                  onClick={startManualIngestion}
                  disabled={isRunning}
                >
                  {isRunning ? 'Running...' : 'Run manually'}
                </button>

                <div className="manual-status">
                  <span className={`status status-${status}`}>
                    {manualStatusLabels[status]}
                  </span>
                  {' '}
                  {runId ? <span className="run-meta">Run ID: {runId}</span> : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="manual-aside" aria-label="Manual ingestion tips">
          <h3>Tips</h3>
          <ul>
            <li>Ensure the Notion page is shared and accessible with the integration token.</li>
            <li>Long articles are chunked automatically; you can rerun to refresh.</li>
            <li>External URLs should be static pages without paywalls or heavy scripts.</li>
          </ul>
          <div className="tip-callout">
            <strong>Heads up</strong>
            <p>Manual runs are processed immediately and may take a few seconds depending on content size.</p>
          </div>
        </aside>
      </div>

      <div className="progress-shell">
        <div className="progress-bar">
          <div style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <div className="progress-meta">
          <span>{Math.round(progress)}%</span>
          {' '}
          {finalMessage ? (
            <span className="manual-message">{finalMessage}</span>
          ) : null}
        </div>
      </div>

      <div className="log-list">
        {logs.length === 0 ? (
          <div className="log-empty">Execution logs will appear here.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`log-entry ${log.level}`}>
              <span className="log-time">
                {logTimeFormatter.format(new Date(log.timestamp))}
              </span>
              {' '}
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>

      {stats ? (
        <div className="run-summary">
          <h3>Run Summary</h3>
          <div className="run-summary-grid">
            <div className="run-summary-card">
              <span className="summary-label">Documents Processed</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsProcessed)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Documents Added</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsAdded)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Documents Updated</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsUpdated)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Documents Skipped</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsSkipped)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Chunks Added</span>
              <span className="summary-value">
                {numberFormatter.format(stats.chunksAdded)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Chunks Updated</span>
              <span className="summary-value">
                {numberFormatter.format(stats.chunksUpdated)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Characters Added</span>
              <span className="summary-value">
                {numberFormatter.format(stats.charactersAdded)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Characters Updated</span>
              <span className="summary-value">
                {numberFormatter.format(stats.charactersUpdated)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">Errors</span>
              <span className="summary-value">
                {numberFormatter.format(stats.errorCount)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function IngestionDashboard({ overview, runs }: PageProps): JSX.Element {
  return (
    <>
      <Head>
        <title>Ingestion Dashboard</title>
      </Head>

      <main className="dashboard-root">
        <article className="dashboard-page notion-page">
          <header className="dashboard-header">
            <h1>Ingestion Dashboard</h1>
        <p className="dashboard-subtitle">
          Monitor ingestion health, trigger manual runs, and review the latest dataset snapshot.
        </p>
          </header>

          <div className="dashboard-stack">
            <ManualIngestionPanel />

            <section className="overview dashboard-card">
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

            <section className="history dashboard-card">
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
          </div>
        </article>
      </main>

      <style jsx>{`
        .dashboard-root {
          min-height: 100vh;
          padding: 5rem 0 6rem;
          background: #f7f6f3;
        }

        .dashboard-page {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          padding: 0 1.5rem;
          color: rgba(55, 53, 47, 0.95);
          font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          line-height: 1.6;
        }

        .dashboard-header {
          margin-bottom: 2.5rem;
        }

        .dashboard-header h1 {
          margin: 0;
          font-size: 2.4rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: rgba(55, 53, 47, 0.98);
        }

        .dashboard-subtitle {
          margin: 0.75rem 0 0;
          max-width: 48rem;
          font-size: 1.05rem;
          color: rgba(55, 53, 47, 0.6);
        }

        .dashboard-stack {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }

        .dashboard-card {
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(55, 53, 47, 0.18);
          border-radius: 14px;
          padding: 1.75rem 2rem;
          box-shadow: 0 24px 60px -32px rgba(15, 15, 15, 0.22);
          backdrop-filter: blur(8px);
        }

        .manual-ingest {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .manual-header {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .manual-header h2 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 700;
          color: rgba(55, 53, 47, 0.98);
        }

        .manual-subtitle {
          margin: 0;
          font-size: 1rem;
          color: rgba(55, 53, 47, 0.6);
        }

        .manual-grid {
          display: grid;
          gap: 1.75rem;
          grid-template-columns: minmax(0, 1fr);
        }

        .manual-panel {
          display: grid;
          gap: 1.75rem;
        }

        .manual-mode {
          display: grid;
          gap: 0.5rem;
        }

        .mode-label {
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: rgba(55, 53, 47, 0.6);
        }

        .mode-tabs {
          position: relative;
          border-radius: 12px 12px 0 0;
          border: 1px solid rgba(55, 53, 47, 0.16);
          border-bottom: none;
          display: flex;
          align-items: flex-end;
          background: rgba(245, 244, 240, 0.7);
          overflow: hidden;
        }

        .mode-tab {
          position: relative;
          flex: 1 1 0;
          min-width: 0;
          border: none;
          background: transparent;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          outline: none;
          padding: 0.9rem 1.1rem 0.6rem;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.2rem;
          font-weight: 600;
          font-size: 0.92rem;
          color: rgba(55, 53, 47, 0.55);
          cursor: pointer;
          text-align: left;
          transition: color 0.2s ease, background 0.2s ease;
        }

        .mode-tab::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 3px;
          background: transparent;
          transition: background 0.2s ease;
        }

        .mode-tab.is-active {
          color: rgba(55, 53, 47, 0.9);
          background: #fff;
        }

        .mode-tab.is-active::after {
          background: rgba(46, 170, 220, 0.95);
        }

        .mode-tab:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .mode-tab__title {
          display: block;
          font-size: 0.94rem;
          font-weight: 600;
        }

        .mode-tab__caption {
          font-size: 0.8rem;
          font-weight: 500;
          color: inherit;
          opacity: 0.7;
          display: block;
        }

        .manual-content {
          border: 1px solid rgba(55, 53, 47, 0.16);
          border-top: none;
          border-radius: 0 0 12px 12px;
          background: rgba(248, 248, 246, 0.9);
          padding: 1.4rem 1.6rem;
          display: grid;
          gap: 1.25rem;
        }

        .manual-form {
          display: grid;
          gap: 1.25rem;
        }

        .manual-field {
          display: grid;
          gap: 0.45rem;
        }

        .manual-field label {
          font-weight: 600;
          font-size: 0.95rem;
          color: rgba(55, 53, 47, 0.75);
        }

        .input-shell {
          display: flex;
          align-items: center;
          border: 1px solid rgba(55, 53, 47, 0.18);
          border-radius: 12px;
          padding: 0.1rem;
          background: rgba(255, 255, 255, 0.92);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .input-shell:focus-within {
          border-color: rgba(46, 170, 220, 0.65);
          box-shadow: 0 0 0 2px rgba(46, 170, 220, 0.18);
        }

        .input-shell input {
          flex: 1 1 auto;
          border: none;
          background: transparent;
          padding: 0.75rem 0.95rem;
          font-size: 0.95rem;
          color: rgba(55, 53, 47, 0.9);
        }

        .input-shell input:focus {
          outline: none;
        }

        .input-shell input:disabled {
          color: rgba(55, 53, 47, 0.45);
        }

        .field-hint {
          margin: -0.2rem 0 0;
          font-size: 0.85rem;
          color: rgba(55, 53, 47, 0.55);
          line-height: 1.5;
        }

        .form-error {
          font-size: 0.85rem;
          color: #b71c1c;
        }

        .manual-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.9rem;
          margin-top: 0.35rem;
        }

        .manual-actions button {
          border: 1px solid rgba(55, 53, 47, 0.18);
          background: rgba(55, 53, 47, 0.9);
          color: #fff;
          padding: 0.65rem 1.6rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        .manual-actions button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px -12px rgba(55, 53, 47, 0.5);
          background: rgba(55, 53, 47, 0.92);
        }

        .manual-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .manual-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          color: rgba(55, 53, 47, 0.6);
        }

        .manual-status .status {
          padding: 0.35rem 0.85rem;
          border-radius: 999px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .run-meta {
          color: rgba(55, 53, 47, 0.5);
        }

        .manual-aside {
          border: 1px solid rgba(55, 53, 47, 0.12);
          border-radius: 14px;
          padding: 1.4rem 1.6rem;
          background: rgba(245, 244, 240, 0.9);
          display: grid;
          gap: 1rem;
        }

        .manual-aside h3 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
          color: rgba(55, 53, 47, 0.85);
        }

        .manual-aside ul {
          margin: 0;
          padding-left: 1.2rem;
          display: grid;
          gap: 0.5rem;
          font-size: 0.9rem;
          color: rgba(55, 53, 47, 0.7);
        }

        .manual-aside li {
          line-height: 1.55;
        }

        .tip-callout {
          border-radius: 12px;
          background: rgba(46, 170, 220, 0.12);
          border: 1px solid rgba(46, 170, 220, 0.25);
          padding: 0.85rem 1rem;
          display: grid;
          gap: 0.35rem;
        }

        .tip-callout strong {
          font-size: 0.85rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: rgba(46, 146, 200, 0.95);
        }

        .tip-callout p {
          margin: 0;
          font-size: 0.9rem;
          color: rgba(55, 53, 47, 0.7);
        }

        .progress-shell {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .progress-bar {
          background: rgba(55, 53, 47, 0.12);
          border-radius: 999px;
          height: 10px;
          overflow: hidden;
        }

        .progress-bar div {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(46, 170, 220, 0.85), rgba(46, 170, 220, 0.55));
          transition: width 0.25s ease;
        }

        .progress-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.95rem;
          color: rgba(55, 53, 47, 0.65);
        }

        .manual-message {
          color: rgba(55, 53, 47, 0.7);
        }

        .log-list {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .log-entry {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.75rem;
          padding: 0.65rem 0.85rem;
          border-radius: 10px;
          background: rgba(55, 53, 47, 0.05);
          border: 1px solid rgba(55, 53, 47, 0.08);
          font-size: 0.9rem;
        }

        .log-entry.info {
          border-color: rgba(46, 170, 220, 0.18);
        }

        .log-entry.warn {
          border-color: rgba(219, 155, 28, 0.32);
          background: rgba(219, 155, 28, 0.08);
        }

        .log-entry.error {
          border-color: rgba(208, 72, 72, 0.28);
          background: rgba(208, 72, 72, 0.08);
        }

        .log-time {
          font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 0.8rem;
          color: rgba(55, 53, 47, 0.45);
        }

        .log-empty {
          padding: 1.1rem 0;
          text-align: center;
          font-size: 0.9rem;
          color: rgba(55, 53, 47, 0.55);
        }

        .run-summary h3 {
          margin: 0 0 1.25rem;
          font-size: 1.25rem;
          font-weight: 600;
          color: rgba(55, 53, 47, 0.9);
        }

        .run-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1rem;
        }

        .run-summary-card {
          border: 1px solid rgba(55, 53, 47, 0.14);
          border-radius: 12px;
          padding: 0.85rem;
          background: rgba(255, 255, 255, 0.9);
          display: grid;
          gap: 0.35rem;
        }

        .summary-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(55, 53, 47, 0.55);
        }

        .summary-value {
          font-size: 1.3rem;
          font-weight: 600;
          color: rgba(55, 53, 47, 0.95);
        }

        .overview h2,
        .history h2 {
          margin: 0 0 1.25rem;
          font-size: 1.35rem;
          font-weight: 600;
          color: rgba(55, 53, 47, 0.9);
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }

        .metric-card {
          border: 1px solid rgba(55, 53, 47, 0.14);
          border-radius: 12px;
          padding: 1rem 1.1rem;
          background: rgba(255, 255, 255, 0.9);
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .metric-label {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(55, 53, 47, 0.55);
        }

        .metric-value {
          font-size: 1.45rem;
          font-weight: 600;
        }

        .history-table-container {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(55, 53, 47, 0.14);
          background: rgba(255, 255, 255, 0.92);
        }

        .history-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        .history-table thead th {
          background: rgba(55, 53, 47, 0.06);
          text-align: left;
          padding: 0.85rem 1rem;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(55, 53, 47, 0.65);
        }

        .history-table tbody td {
          padding: 0.85rem 1rem;
          border-top: 1px solid rgba(55, 53, 47, 0.1);
          vertical-align: top;
          font-size: 0.95rem;
          color: rgba(55, 53, 47, 0.85);
        }

        .history-table tbody tr:first-child td {
          border-top: none;
        }

        .history-table tbody tr:hover {
          background: rgba(46, 170, 220, 0.08);
        }

        .empty-state {
          text-align: center;
          padding: 2.25rem 1rem;
          color: rgba(55, 53, 47, 0.55);
        }

        .status {
          display: inline-block;
          padding: 0.3rem 0.75rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .status-success {
          background: rgba(16, 185, 129, 0.16);
          color: rgba(6, 95, 70, 0.95);
        }

        .status-completed_with_errors {
          background: rgba(234, 179, 8, 0.18);
          color: rgba(133, 77, 14, 0.95);
        }

        .status-failed {
          background: rgba(248, 113, 113, 0.2);
          color: rgba(153, 27, 27, 0.95);
        }

        .status-in_progress {
          background: rgba(96, 165, 250, 0.2);
          color: rgba(30, 64, 175, 0.95);
        }

        .badge {
          display: inline-block;
          padding: 0.3rem 0.8rem;
          border-radius: 999px;
          background: rgba(55, 53, 47, 0.08);
          font-size: 0.8rem;
          font-weight: 600;
          color: rgba(55, 53, 47, 0.75);
        }

        .subtle {
          font-size: 0.85rem;
          color: rgba(55, 53, 47, 0.6);
        }

        details {
          margin-top: 0.6rem;
        }

        details summary {
          cursor: pointer;
          color: rgba(46, 170, 220, 0.9);
        }

        details ul {
          margin: 0.5rem 0 0;
          padding-left: 1.25rem;
        }

        @media (min-width: 960px) {
          .manual-grid {
            grid-template-columns: minmax(0, 2.1fr) minmax(0, 1fr);
            align-items: start;
          }
        }

        @media (max-width: 720px) {
          .dashboard-root {
            padding: 3.5rem 0 4.5rem;
          }

          .dashboard-page {
            padding: 0 1rem;
          }

          .dashboard-card {
            padding: 1.4rem 1.4rem;
          }

          .manual-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .manual-actions button {
            width: 100%;
          }
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

  const runs: RunRecord[] = (runsData ?? []).map((run: unknown) =>
    normalizeRunRecord(run)
  )

  const docs: DocumentRow[] = (documentsData ?? []) as DocumentRow[]
  const totalDocuments = docs.length
  const totalChunks = docs.reduce<number>(
    (sum, doc) => sum + (doc.chunk_count ?? 0),
    0
  )
  const totalCharacters = docs.reduce<number>(
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

