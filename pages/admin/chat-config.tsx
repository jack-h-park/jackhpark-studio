import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState
} from 'react'

import type {
  GuardrailDefaults,
  GuardrailSettingsResult
} from '@/lib/server/chat-settings'
import {
  DEFAULT_SYSTEM_PROMPT,
  SYSTEM_PROMPT_MAX_LENGTH
} from '@/lib/chat-prompts'

type PageProps = {
  systemPrompt: string
  isDefault: boolean
  defaultPrompt: string
  guardrails: GuardrailSettingsResult
  guardrailDefaults: GuardrailDefaults
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const {
    loadSystemPrompt,
    loadGuardrailSettings,
    getGuardrailDefaults
  } = await import('@/lib/server/chat-settings')

  const [promptResult, guardrailResult] = await Promise.all([
    loadSystemPrompt({ forceRefresh: true }),
    loadGuardrailSettings({ forceRefresh: true })
  ])

  return {
    props: {
      systemPrompt: promptResult.prompt,
      isDefault: promptResult.isDefault,
      defaultPrompt: DEFAULT_SYSTEM_PROMPT,
      guardrails: guardrailResult,
      guardrailDefaults: getGuardrailDefaults()
    }
  }
}

export default function ChatConfigPage({
  systemPrompt,
  isDefault,
  defaultPrompt,
  guardrails,
  guardrailDefaults
}: PageProps) {
  const [value, setValue] = useState(systemPrompt)
  const [savedPrompt, setSavedPrompt] = useState(systemPrompt)
  const [persistedIsDefault, setPersistedIsDefault] = useState(isDefault)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const [guardrailKeywords, setGuardrailKeywords] = useState(
    guardrails.chitchatKeywords.join('\n')
  )
  const [guardrailFallbackChitchat, setGuardrailFallbackChitchat] = useState(
    guardrails.fallbackChitchat
  )
  const [guardrailFallbackCommand, setGuardrailFallbackCommand] = useState(
    guardrails.fallbackCommand
  )
  const [savedGuardrails, setSavedGuardrails] = useState({
    keywords: guardrails.chitchatKeywords.join('\n'),
    fallbackChitchat: guardrails.fallbackChitchat,
    fallbackCommand: guardrails.fallbackCommand,
    isDefault: guardrails.isDefault
  })
  const [guardrailStatus, setGuardrailStatus] = useState<SaveStatus>('idle')
  const [guardrailError, setGuardrailError] = useState<string | null>(null)

  const isDirty = value !== savedPrompt
  const isAtLimit = value.length >= SYSTEM_PROMPT_MAX_LENGTH
  const restoreDisabled = value === defaultPrompt
  const saveDisabled = !isDirty || status === 'saving'
  const guardrailDirty =
    guardrailKeywords !== savedGuardrails.keywords ||
    guardrailFallbackChitchat !== savedGuardrails.fallbackChitchat ||
    guardrailFallbackCommand !== savedGuardrails.fallbackCommand
  const guardrailSaveDisabled = !guardrailDirty || guardrailStatus === 'saving'
  const guardrailRestoreDisabled =
    guardrailKeywords === guardrailDefaults.chitchatKeywords.join('\n') &&
    guardrailFallbackChitchat === guardrailDefaults.fallbackChitchat &&
    guardrailFallbackCommand === guardrailDefaults.fallbackCommand

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value)
    if (status === 'saved' || status === 'error') {
      setStatus('idle')
    }
  }, [status])

  const resetGuardrailStatus = useCallback(() => {
    if (guardrailStatus === 'saved' || guardrailStatus === 'error') {
      setGuardrailStatus('idle')
    }
    if (guardrailError) {
      setGuardrailError(null)
    }
  }, [guardrailError, guardrailStatus])

  const handleGuardrailKeywordsChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setGuardrailKeywords(event.target.value)
      resetGuardrailStatus()
    },
    [resetGuardrailStatus]
  )

  const handleGuardrailFallbackChitchatChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setGuardrailFallbackChitchat(event.target.value)
      resetGuardrailStatus()
    },
    [resetGuardrailStatus]
  )

  const handleGuardrailFallbackCommandChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setGuardrailFallbackCommand(event.target.value)
      resetGuardrailStatus()
    },
    [resetGuardrailStatus]
  )

  const handleRestoreDefault = useCallback(() => {
    setValue(defaultPrompt)
    setError(null)
    setStatus('idle')
  }, [defaultPrompt])

  const handleGuardrailRestoreDefaults = useCallback(() => {
    setGuardrailKeywords(guardrailDefaults.chitchatKeywords.join('\n'))
    setGuardrailFallbackChitchat(guardrailDefaults.fallbackChitchat)
    setGuardrailFallbackCommand(guardrailDefaults.fallbackCommand)
    setGuardrailError(null)
    setGuardrailStatus('idle')
  }, [guardrailDefaults])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (saveDisabled) {
        return
      }

      setStatus('saving')
      setError(null)

      try {
        const response = await fetch('/api/admin/chat-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt: value })
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          const message = payload?.error ?? 'Failed to save system prompt'
          throw new Error(message)
        }

        const payload = (await response.json()) as {
          systemPrompt: string
          isDefault: boolean
        }

        setSavedPrompt(payload.systemPrompt)
        setPersistedIsDefault(payload.isDefault)
        setValue(payload.systemPrompt)
        setStatus('saved')
      } catch (err: any) {
        console.error('[admin/chat-config] save failed', err)
        setError(err?.message ?? 'Failed to save system prompt')
        setStatus('error')
      }
    },
    [saveDisabled, value]
  )

  const handleGuardrailSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (guardrailSaveDisabled) {
        return
      }

      setGuardrailStatus('saving')
      setGuardrailError(null)

      try {
        const response = await fetch('/api/admin/chat-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guardrails: {
              chitchatKeywords: guardrailKeywords,
              fallbackChitchat: guardrailFallbackChitchat,
              fallbackCommand: guardrailFallbackCommand
            }
          })
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          const message = payload?.error ?? 'Failed to save guardrail settings'
          throw new Error(message)
        }

        const payload = (await response.json()) as {
          guardrails?: GuardrailSettingsResult
        }

        if (!payload.guardrails) {
          throw new Error('Server did not return guardrail settings.')
        }

        setSavedGuardrails({
          keywords: guardrailKeywords,
          fallbackChitchat: guardrailFallbackChitchat,
          fallbackCommand: guardrailFallbackCommand,
          isDefault: payload.guardrails.isDefault
        })
        setGuardrailStatus('saved')
      } catch (err: any) {
        console.error('[admin/chat-config] guardrail save failed', err)
        setGuardrailError(err?.message ?? 'Failed to save guardrail settings')
        setGuardrailStatus('error')
      }
    },
    [
      guardrailSaveDisabled,
      guardrailKeywords,
      guardrailFallbackChitchat,
      guardrailFallbackCommand
    ]
  )

  const helperText = useMemo(() => {
    if (status === 'saved') {
      return 'System prompt updated successfully.'
    }
    if (status === 'error' && error) {
      return error
    }
    if (persistedIsDefault) {
      return 'Currently using the built-in default prompt. Save changes to persist a custom prompt in Supabase.'
    }
    return 'Update the shared system prompt used by both LangChain and native chat engines.'
  }, [error, persistedIsDefault, status])

  const guardrailHelperText = useMemo(() => {
    if (guardrailStatus === 'saved') {
      return 'Guardrail settings updated successfully.'
    }
    if (guardrailStatus === 'error' && guardrailError) {
      return guardrailError
    }
    const usingDefaults =
      savedGuardrails.isDefault.chitchatKeywords &&
      savedGuardrails.isDefault.fallbackChitchat &&
      savedGuardrails.isDefault.fallbackCommand
    if (usingDefaults) {
      return 'Currently using the default guardrail keywords and fallback guidance.'
    }
    return 'Update chit-chat detection keywords and fallback guidance shared by both chat engines.'
  }, [guardrailError, guardrailStatus, savedGuardrails])

  return (
    <>
      <Head>
        <title>Chat Configuration · Admin</title>
      </Head>

      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <h1>Chat Configuration</h1>
            <p>{helperText}</p>
          </div>
          <div className="admin-actions">
            <Link href="/admin/ingestion" className="secondary-button">
              ← Back to Ingestion
            </Link>
          </div>
        </header>

        <main>
          <form className="admin-card" onSubmit={handleSubmit}>
            <label htmlFor="systemPrompt">Shared system prompt</label>
            <textarea
              id="systemPrompt"
              name="systemPrompt"
              value={value}
              onChange={handleChange}
              rows={18}
              spellCheck={false}
              maxLength={SYSTEM_PROMPT_MAX_LENGTH}
            />
            <div className="form-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handleRestoreDefault}
                disabled={restoreDisabled}
              >
                Restore System Prompt Defaults
              </button>
              <span className={isAtLimit ? 'limit warning' : 'limit'}>
                {value.length.toLocaleString()} / {SYSTEM_PROMPT_MAX_LENGTH.toLocaleString()} characters
              </span>
              <button type="submit" className="primary-button" disabled={saveDisabled}>
                {status === 'saving' ? 'Saving…' : 'Save Prompt'}
              </button>
            </div>
          </form>
          {status === 'error' && error && (
            <div className="admin-alert error">
              {error}
            </div>
          )}
          {status === 'saved' && (
            <div className="admin-alert success">
              System prompt saved.
            </div>
          )}

          <form className="admin-card" onSubmit={handleGuardrailSubmit}>
            <h2>Guardrail keyword & fallback config</h2>
            <p className="description">{guardrailHelperText}</p>

            <label htmlFor="guardrailKeywords">Chit-chat keywords (one per line)</label>
            <textarea
              id="guardrailKeywords"
              name="guardrailKeywords"
              value={guardrailKeywords}
              onChange={handleGuardrailKeywordsChange}
              rows={6}
              spellCheck={false}
            />

            <label htmlFor="guardrailFallbackChitchat">Chit-chat fallback context</label>
            <textarea
              id="guardrailFallbackChitchat"
              name="guardrailFallbackChitchat"
              value={guardrailFallbackChitchat}
              onChange={handleGuardrailFallbackChitchatChange}
              rows={4}
              spellCheck={false}
            />

            <label htmlFor="guardrailFallbackCommand">Command fallback context</label>
            <textarea
              id="guardrailFallbackCommand"
              name="guardrailFallbackCommand"
              value={guardrailFallbackCommand}
              onChange={handleGuardrailFallbackCommandChange}
              rows={4}
              spellCheck={false}
            />

            <div className="form-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handleGuardrailRestoreDefaults}
                disabled={guardrailRestoreDisabled}
              >
                Restore Guardrail Defaults
              </button>
              <button type="submit" className="primary-button" disabled={guardrailSaveDisabled}>
                {guardrailStatus === 'saving' ? 'Saving…' : 'Save Guardrails'}
              </button>
            </div>
          </form>
          {guardrailStatus === 'error' && guardrailError && (
            <div className="admin-alert error">
              {guardrailError}
            </div>
          )}
          {guardrailStatus === 'saved' && (
            <div className="admin-alert success">
              Guardrail settings saved.
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .admin-shell {
          max-width: 900px;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .admin-header h1 {
          margin: 0 0 0.5rem;
          font-size: 2rem;
        }

        .admin-header p {
          margin: 0;
          color: #555;
          max-width: 560px;
        }

        .admin-actions {
          display: flex;
          gap: 0.75rem;
        }

        .admin-card {
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
        }

        .admin-card label {
          font-weight: 600;
        }

        .admin-card .description {
          margin: 0;
          color: #555;
        }

        textarea {
          width: 100%;
          resize: vertical;
          font-family: var(--font-family, 'Inter', system-ui, sans-serif);
          font-size: 0.95rem;
          line-height: 1.45;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          color: #111;
        }

        textarea:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
        }

        .form-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .limit {
          font-size: 0.85rem;
          color: #667085;
        }

        .limit.warning {
          color: #b91c1c;
        }

        .primary-button,
        .secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.6rem 1.1rem;
          border-radius: 8px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: box-shadow 0.15s ease, transform 0.15s ease;
          text-decoration: none;
        }

        .primary-button {
          background: #2563eb;
          color: #fff;
        }

        .primary-button:disabled {
          background: #93c5fd;
          cursor: not-allowed;
        }

        .secondary-button {
          background: #f3f4f6;
          color: #111;
        }

        .secondary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        main {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .admin-alert {
          border-radius: 10px;
          padding: 0.9rem 1.1rem;
          font-size: 0.9rem;
        }

        .admin-alert.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .admin-alert.success {
          background: #dcfce7;
          color: #166534;
        }

        @media (max-width: 640px) {
          .admin-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .admin-actions {
            width: 100%;
            justify-content: flex-start;
          }

          .primary-button,
          .secondary-button {
            width: auto;
          }
        }
      `}</style>
    </>
  )
}
