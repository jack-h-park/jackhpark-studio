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
  idle: '대기 중',
  in_progress: '진행 중',
  success: '성공',
  completed_with_errors: '부분 성공',
  failed: '실패'
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
            event.message ?? '수동 수집이 완료되었습니다.'
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
        setErrorMessage('유효한 Notion 페이지 ID 또는 URL을 입력해주세요.')
        return
      }
      payload = { mode: 'notion_page', pageId: parsed }
    } else {
      const trimmed = urlInput.trim()
      if (!trimmed) {
        setErrorMessage('수집할 URL을 입력해주세요.')
        return
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(trimmed)
      } catch {
        setErrorMessage('유효한 URL을 입력해주세요.')
        return
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        setErrorMessage('HTTP 또는 HTTPS URL만 지원됩니다.')
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
        ? 'Notion 페이지 수동 수집을 시작합니다.'
        : '일반 URL 수동 수집을 시작합니다.'
    setLogs([createLogEntry(startLog, 'info')])

    try {
      const response = await fetch('/api/admin/manual-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        let message = `요청이 실패했습니다. (${response.status})`
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
        throw new Error('이 브라우저에서는 스트리밍 응답을 지원하지 않습니다.')
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
        const message = '수동 수집이 예기치 않게 종료되었습니다.'
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
          : '수동 수집 실행 중 오류가 발생했습니다.'
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
    <section className="manual-ingest">
      <div className="manual-header">
        <h2>Manual Ingestion</h2>
        <p className="manual-subtitle">
          Admin에서 즉시 Notion 페이지 또는 일반 URL을 수집하고 진행 상황을 확인하세요.
        </p>
      </div>

      <div className="mode-toggle">
        <button
          type="button"
          className={mode === 'notion_page' ? 'active' : ''}
          onClick={() => setMode('notion_page')}
          disabled={isRunning}
        >
          Notion Page
        </button>
        <button
          type="button"
          className={mode === 'url' ? 'active' : ''}
          onClick={() => setMode('url')}
          disabled={isRunning}
        >
          일반 URL
        </button>
      </div>

      <div className="manual-form">
        {mode === 'notion_page' ? (
          <label>
            <span>Notion 페이지 ID 또는 URL</span>
            <input
              type="text"
              placeholder="예: https://www.notion.so/... 또는 페이지 ID"
              value={notionInput}
              onChange={(event) => setNotionInput(event.target.value)}
              disabled={isRunning}
            />
          </label>
        ) : (
          <label>
            <span>수집할 URL</span>
            <input
              type="url"
              placeholder="https://example.com/article"
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              disabled={isRunning}
            />
          </label>
        )}

        {errorMessage ? (
          <div className="form-error">{errorMessage}</div>
        ) : null}

        <div className="manual-actions">
          <button
            type="button"
            onClick={startManualIngestion}
            disabled={isRunning}
          >
            {isRunning ? '실행 중...' : '수동 실행'}
          </button>

          <div className="manual-status">
            <span className={`status status-${status}`}>
              {manualStatusLabels[status]}
            </span>
            {runId ? <span className="run-meta">Run ID: {runId}</span> : null}
          </div>
        </div>
      </div>

      <div className="progress-shell">
        <div className="progress-bar">
          <div style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <div className="progress-meta">
          <span>{Math.round(progress)}%</span>
          {finalMessage ? (
            <span className="manual-message">{finalMessage}</span>
          ) : null}
        </div>
      </div>

      <div className="log-list">
        {logs.length === 0 ? (
          <div className="log-empty">진행 로그가 여기에 표시됩니다.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`log-entry ${log.level}`}>
              <span className="log-time">
                {logTimeFormatter.format(new Date(log.timestamp))}
              </span>
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>

      {stats ? (
        <div className="run-summary">
          <h3>실행 결과</h3>
          <div className="run-summary-grid">
            <div className="run-summary-card">
              <span className="summary-label">처리된 문서</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsProcessed)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">추가된 문서</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsAdded)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">업데이트된 문서</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsUpdated)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">건너뛴 문서</span>
              <span className="summary-value">
                {numberFormatter.format(stats.documentsSkipped)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">추가된 청크</span>
              <span className="summary-value">
                {numberFormatter.format(stats.chunksAdded)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">업데이트된 청크</span>
              <span className="summary-value">
                {numberFormatter.format(stats.chunksUpdated)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">추가된 문자 수</span>
              <span className="summary-value">
                {numberFormatter.format(stats.charactersAdded)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">업데이트된 문자 수</span>
              <span className="summary-value">
                {numberFormatter.format(stats.charactersUpdated)}
              </span>
            </div>
            <div className="run-summary-card">
              <span className="summary-label">오류 수</span>
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

      <main className="ingestion-dashboard">
        <h1>Ingestion Dashboard</h1>

        <ManualIngestionPanel />

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

        .manual-ingest {
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 16px;
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.9);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .manual-header {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .manual-header h2 {
          margin: 0;
        }

        .manual-subtitle {
          font-size: 0.9rem;
          color: rgba(0, 0, 0, 0.6);
        }

        .mode-toggle {
          display: inline-flex;
          gap: 0.25rem;
          background: rgba(29, 78, 216, 0.08);
          border-radius: 999px;
          padding: 0.25rem;
          align-self: flex-start;
        }

        .mode-toggle button {
          border: none;
          background: transparent;
          padding: 0.4rem 1rem;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.9rem;
          color: rgba(17, 24, 39, 0.75);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .mode-toggle button.active {
          background: #1d4ed8;
          color: #fff;
          box-shadow: 0 2px 6px rgba(29, 78, 216, 0.25);
        }

        .mode-toggle button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .manual-form {
          display: grid;
          gap: 1rem;
        }

        .manual-form label {
          display: grid;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.95rem;
          color: rgba(17, 24, 39, 0.75);
        }

        .manual-form input {
          border: 1px solid rgba(0, 0, 0, 0.15);
          border-radius: 8px;
          padding: 0.6rem 0.75rem;
          font-size: 0.95rem;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .manual-form input:focus {
          outline: none;
          border-color: #1d4ed8;
          box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.2);
        }

        .manual-form input:disabled {
          background: rgba(0, 0, 0, 0.04);
          cursor: not-allowed;
        }

        .form-error {
          font-size: 0.85rem;
          color: #b91c1c;
        }

        .manual-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
        }

        .manual-actions button {
          border: none;
          background: #1d4ed8;
          color: #fff;
          padding: 0.6rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }

        .manual-actions button:hover:not(:disabled) {
          background: #1a46c2;
          transform: translateY(-1px);
        }

        .manual-actions button:disabled {
          background: rgba(29, 78, 216, 0.5);
          cursor: not-allowed;
          transform: none;
        }

        .manual-status {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .manual-status .status {
          font-size: 0.85rem;
        }

        .status-idle {
          background: rgba(0, 0, 0, 0.08);
          color: rgba(17, 24, 39, 0.7);
        }

        .run-meta {
          font-size: 0.85rem;
          color: rgba(0, 0, 0, 0.55);
        }

        .progress-shell {
          display: grid;
          gap: 0.5rem;
        }

        .progress-bar {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }

        .progress-bar > div {
          height: 100%;
          background: #1d4ed8;
          border-radius: inherit;
          transition: width 0.2s ease;
        }

        .progress-meta {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          font-size: 0.85rem;
          color: rgba(0, 0, 0, 0.6);
          flex-wrap: wrap;
        }

        .manual-message {
          color: rgba(17, 24, 39, 0.75);
        }

        .log-list {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 10px;
          padding: 0.75rem;
          max-height: 220px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.02);
          display: grid;
          gap: 0.5rem;
        }

        .log-entry {
          display: flex;
          gap: 0.6rem;
          align-items: baseline;
          font-size: 0.85rem;
          color: rgba(17, 24, 39, 0.85);
        }

        .log-entry.warn {
          color: #92400e;
        }

        .log-entry.error {
          color: #991b1b;
        }

        .log-time {
          font-family: ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas,
            'Liberation Mono', 'Courier New', monospace;
          font-size: 0.8rem;
          color: rgba(0, 0, 0, 0.45);
        }

        .log-empty {
          font-size: 0.85rem;
          color: rgba(0, 0, 0, 0.5);
        }

        .run-summary {
          display: grid;
          gap: 0.75rem;
        }

        .run-summary h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .run-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem;
        }

        .run-summary-card {
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 10px;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.85);
          display: grid;
          gap: 0.25rem;
        }

        .summary-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.55);
          letter-spacing: 0.05em;
        }

        .summary-value {
          font-size: 1.1rem;
          font-weight: 600;
        }

        @media (max-width: 640px) {
          .manual-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .manual-actions button {
            width: 100%;
          }

          .manual-status {
            width: 100%;
            justify-content: space-between;
          }
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
