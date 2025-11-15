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
  ChatModelSettings,
  GuardrailDefaults,
  GuardrailNumericSettings,
  GuardrailSettingsResult} from '@/lib/server/chat-settings'
import {
  DEFAULT_SYSTEM_PROMPT,
  SYSTEM_PROMPT_MAX_LENGTH
} from '@/lib/chat-prompts'
import { getDefaultModelNames } from '@/lib/core/model-provider'
import {
  type ChatEngine,
  MODEL_PROVIDER_LABELS,
  MODEL_PROVIDERS,
  type ModelProvider} from '@/lib/shared/model-provider'

type PageProps = {
  systemPrompt: string
  isDefault: boolean
  defaultPrompt: string
  guardrails: GuardrailSettingsResult
  guardrailDefaults: GuardrailDefaults
  models: ChatModelSettings
  modelDefaults: ChatModelSettings
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type GuardrailNumericFormState = {
  similarityThreshold: string
  ragTopK: string
  ragContextTokenBudget: string
  ragContextClipTokens: string
  historyTokenBudget: string
  summaryEnabled: boolean
  summaryTriggerTokens: string
  summaryMaxTurns: string
  summaryMaxChars: string
}

type ModelFormState = {
  engine: ChatEngine
  llmProvider: ModelProvider
  embeddingProvider: ModelProvider
  llmModel: string
  embeddingModel: string
}

type ModelOverrideState = {
  llm: boolean
  embedding: boolean
}

type NumericFieldKey = Exclude<keyof GuardrailNumericFormState, 'summaryEnabled'>

const NUMERIC_NUMBER_FIELDS: NumericFieldKey[] = [
  'similarityThreshold',
  'ragTopK',
  'ragContextTokenBudget',
  'ragContextClipTokens',
  'historyTokenBudget',
  'summaryTriggerTokens',
  'summaryMaxTurns',
  'summaryMaxChars'
]

const CLIENT_NUMERIC_DEFAULTS: GuardrailNumericSettings = {
  similarityThreshold: 0.78,
  ragTopK: 5,
  ragContextTokenBudget: 1200,
  ragContextClipTokens: 320,
  historyTokenBudget: 900,
  summaryEnabled: true,
  summaryTriggerTokens: 400,
  summaryMaxTurns: 6,
  summaryMaxChars: 600
}

const toNumericFormState = (
  numeric?: GuardrailNumericSettings | null,
  fallback?: GuardrailNumericSettings
): GuardrailNumericFormState => {
  const source = numeric ?? fallback ?? CLIENT_NUMERIC_DEFAULTS
  return {
    similarityThreshold: source.similarityThreshold.toString(),
    ragTopK: source.ragTopK.toString(),
    ragContextTokenBudget: source.ragContextTokenBudget.toString(),
    ragContextClipTokens: source.ragContextClipTokens.toString(),
    historyTokenBudget: source.historyTokenBudget.toString(),
    summaryEnabled: source.summaryEnabled,
    summaryTriggerTokens: source.summaryTriggerTokens.toString(),
    summaryMaxTurns: source.summaryMaxTurns.toString(),
    summaryMaxChars: source.summaryMaxChars.toString()
  }
}

const toModelFormState = (models?: ChatModelSettings, fallback?: ChatModelSettings): ModelFormState => {
  const source = models ?? fallback
  return {
    engine: source?.engine ?? 'lc',
    llmProvider: source?.llmProvider ?? 'openai',
    embeddingProvider: source?.embeddingProvider ?? source?.llmProvider ?? 'openai',
    llmModel: source?.llmModel ?? '',
    embeddingModel: source?.embeddingModel ?? ''
  }
}

const parseNumericPayload = (
  state: GuardrailNumericFormState
): GuardrailNumericSettings => {
  return {
    similarityThreshold: parseGuardrailNumber(state.similarityThreshold, 'Similarity threshold'),
    ragTopK: parseGuardrailNumber(state.ragTopK, 'RAG top K'),
    ragContextTokenBudget: parseGuardrailNumber(state.ragContextTokenBudget, 'Context token budget'),
    ragContextClipTokens: parseGuardrailNumber(state.ragContextClipTokens, 'Context clip tokens'),
    historyTokenBudget: parseGuardrailNumber(state.historyTokenBudget, 'History token budget'),
    summaryEnabled: state.summaryEnabled,
    summaryTriggerTokens: parseGuardrailNumber(state.summaryTriggerTokens, 'Summary trigger tokens'),
    summaryMaxTurns: parseGuardrailNumber(state.summaryMaxTurns, 'Summary max turns'),
    summaryMaxChars: parseGuardrailNumber(state.summaryMaxChars, 'Summary max chars')
  }
}

const parseGuardrailNumber = (value: string, label: string): number => {
  if (value.trim().length === 0) {
    throw new Error(`${label} cannot be empty.`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return parsed
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const {
    loadSystemPrompt,
    loadGuardrailSettings,
    loadChatModelSettings,
    getGuardrailDefaults,
    getChatModelDefaults
  } = await import('@/lib/server/chat-settings')

  const [promptResult, guardrailResult, modelResult] = await Promise.all([
    loadSystemPrompt({ forceRefresh: true }),
    loadGuardrailSettings({ forceRefresh: true }),
    loadChatModelSettings({ forceRefresh: true })
  ])

  return {
    props: {
      systemPrompt: promptResult.prompt,
      isDefault: promptResult.isDefault,
      defaultPrompt: DEFAULT_SYSTEM_PROMPT,
      guardrails: guardrailResult,
      guardrailDefaults: getGuardrailDefaults(),
      models: modelResult,
      modelDefaults: getChatModelDefaults()
    }
  }
}

export default function ChatConfigPage({
  systemPrompt,
  isDefault,
  defaultPrompt,
  guardrails,
  guardrailDefaults,
  models,
  modelDefaults
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
  const [guardrailNumeric, setGuardrailNumeric] = useState<GuardrailNumericFormState>(
    toNumericFormState(guardrails.numeric, guardrailDefaults.numeric)
  )
  const [savedGuardrails, setSavedGuardrails] = useState({
    keywords: guardrails.chitchatKeywords.join('\n'),
    fallbackChitchat: guardrails.fallbackChitchat,
    fallbackCommand: guardrails.fallbackCommand,
    numeric: guardrails.numeric ?? guardrailDefaults.numeric,
    isDefault: guardrails.isDefault
  })
  const [guardrailStatus, setGuardrailStatus] = useState<SaveStatus>('idle')
  const [guardrailError, setGuardrailError] = useState<string | null>(null)
  const [modelForm, setModelForm] = useState<ModelFormState>(
    toModelFormState(models, modelDefaults)
  )
  const [savedModels, setSavedModels] = useState<ModelFormState>(
    toModelFormState(models, modelDefaults)
  )
  const [modelOverrides, setModelOverrides] = useState<ModelOverrideState>({
    llm: Boolean(models.llmModel && models.llmModel.trim().length > 0),
    embedding: Boolean(models.embeddingModel && models.embeddingModel.trim().length > 0)
  })
  const [modelStatus, setModelStatus] = useState<SaveStatus>('idle')
  const [modelError, setModelError] = useState<string | null>(null)

  const isDirty = value !== savedPrompt
  const isAtLimit = value.length >= SYSTEM_PROMPT_MAX_LENGTH
  const restoreDisabled = value === defaultPrompt
  const saveDisabled = !isDirty || status === 'saving'
  const numericDirty =
    NUMERIC_NUMBER_FIELDS.some((field) => {
      const rawValue = guardrailNumeric[field]
      if (rawValue.trim().length === 0) {
        return true
      }
      const currentValue = Number(rawValue)
      if (!Number.isFinite(currentValue)) {
        return true
      }
      const savedValue =
        savedGuardrails.numeric[field as keyof GuardrailNumericSettings]
      return currentValue !== savedValue
    }) ||
    guardrailNumeric.summaryEnabled !== savedGuardrails.numeric.summaryEnabled

  const guardrailDirty =
    guardrailKeywords !== savedGuardrails.keywords ||
    guardrailFallbackChitchat !== savedGuardrails.fallbackChitchat ||
    guardrailFallbackCommand !== savedGuardrails.fallbackCommand ||
    numericDirty
  const guardrailSaveDisabled = !guardrailDirty || guardrailStatus === 'saving'
  const guardrailRestoreDisabled =
    guardrailKeywords === guardrailDefaults.chitchatKeywords.join('\n') &&
    guardrailFallbackChitchat === guardrailDefaults.fallbackChitchat &&
    guardrailFallbackCommand === guardrailDefaults.fallbackCommand &&
    NUMERIC_NUMBER_FIELDS.every((field) => {
      const currentValue = Number(guardrailNumeric[field])
      const defaultValue =
        guardrailDefaults.numeric[field as keyof GuardrailNumericSettings]
      return Number.isFinite(currentValue) && currentValue === defaultValue
    }) &&
    guardrailNumeric.summaryEnabled === guardrailDefaults.numeric.summaryEnabled
  const modelDirty =
    modelForm.engine !== savedModels.engine ||
    modelForm.llmProvider !== savedModels.llmProvider ||
    modelForm.embeddingProvider !== savedModels.embeddingProvider ||
    modelForm.llmModel !== savedModels.llmModel ||
    modelForm.embeddingModel !== savedModels.embeddingModel
  const modelSaveDisabled = !modelDirty || modelStatus === 'saving'
  const modelRestoreDisabled =
    modelForm.engine === modelDefaults.engine &&
    modelForm.llmProvider === modelDefaults.llmProvider &&
    modelForm.embeddingProvider === modelDefaults.embeddingProvider &&
    modelForm.llmModel === modelDefaults.llmModel &&
    modelForm.embeddingModel === modelDefaults.embeddingModel

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

  const handleNumericFieldChange = useCallback(
    (field: Exclude<keyof GuardrailNumericFormState, 'summaryEnabled'>) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        setGuardrailNumeric((prev) => ({
          ...prev,
          [field]: event.target.value
        }))
        resetGuardrailStatus()
      },
    [resetGuardrailStatus]
  )

  const handleSummaryEnabledChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setGuardrailNumeric((prev) => ({
        ...prev,
        summaryEnabled: event.target.checked
      }))
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
    setGuardrailNumeric(toNumericFormState(guardrailDefaults.numeric))
    setGuardrailError(null)
    setGuardrailStatus('idle')
  }, [guardrailDefaults])

  const resetModelStatus = useCallback(() => {
    if (modelStatus === 'saved' || modelStatus === 'error') {
      setModelStatus('idle')
    }
    if (modelError) {
      setModelError(null)
    }
  }, [modelError, modelStatus])

  const handleModelFieldChange = useCallback(
    (field: keyof ModelFormState) =>
      (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        const nextValue = event.target.value
        setModelForm((prev) => {
          if (field === 'llmProvider') {
            const defaults = getDefaultModelNames()
            const nextProvider = nextValue as ModelProvider
            return {
              ...prev,
              llmProvider: nextProvider,
              llmModel: modelOverrides.llm ? prev.llmModel : defaults.llm[nextProvider]
            }
          }
          if (field === 'embeddingProvider') {
            const defaults = getDefaultModelNames()
            const nextProvider = nextValue as ModelProvider
            return {
              ...prev,
              embeddingProvider: nextProvider,
              embeddingModel: modelOverrides.embedding
                ? prev.embeddingModel
                : defaults.embedding[nextProvider]
            }
          }
          return {
            ...prev,
            [field]: nextValue
          }
        })
        if (field === 'llmProvider') {
          setModelOverrides((prev) => ({ ...prev, llm: prev.llm }))
        }
        if (field === 'embeddingProvider') {
          setModelOverrides((prev) => ({ ...prev, embedding: prev.embedding }))
        }
        resetModelStatus()
      },
    [modelOverrides.embedding, modelOverrides.llm, resetModelStatus]
  )

  const handleModelRestoreDefaults = useCallback(() => {
    setModelForm(toModelFormState(modelDefaults))
    setModelStatus('idle')
    setModelError(null)
  }, [modelDefaults])

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

  const handleModelSave = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      if (event) {
        event.preventDefault()
      }
      if (modelSaveDisabled) {
        return
      }

      setModelStatus('saving')
    setModelError(null)

    try {
      const payloadLlmModel = modelOverrides.llm ? modelForm.llmModel : ''
      const payloadEmbeddingModel = modelOverrides.embedding ? modelForm.embeddingModel : ''
      const response = await fetch('/api/admin/chat-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: {
            engine: modelForm.engine,
            llmProvider: modelForm.llmProvider,
            embeddingProvider: modelForm.embeddingProvider,
            llmModel: payloadLlmModel,
            embeddingModel: payloadEmbeddingModel
          }
        })
      })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          const message = payload?.error ?? 'Failed to save chat model settings'
          throw new Error(message)
        }

        const payload = (await response.json()) as { models?: ChatModelSettings }
        if (!payload.models) {
          throw new Error('Server did not return chat model settings.')
        }

        const normalized = toModelFormState(payload.models)
        setSavedModels(normalized)
        setModelForm(normalized)
        setModelOverrides({
          llm: Boolean(payload.models.llmModel && payload.models.llmModel.trim().length > 0),
          embedding: Boolean(payload.models.embeddingModel && payload.models.embeddingModel.trim().length > 0)
        })
        setModelStatus('saved')
      } catch (err: any) {
        console.error('[admin/chat-config] model save failed', err)
        setModelError(err?.message ?? 'Failed to save chat model settings')
        setModelStatus('error')
      }
    },
    [modelForm, modelOverrides.llm, modelSaveDisabled]
  )

  const handleGuardrailSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (guardrailSaveDisabled) {
        return
      }

      let numericPayload: GuardrailNumericSettings
      try {
        numericPayload = parseNumericPayload(guardrailNumeric)
      } catch (err: any) {
        setGuardrailError(err?.message ?? 'Numeric guardrail values are invalid.')
        setGuardrailStatus('error')
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
              fallbackCommand: guardrailFallbackCommand,
              numeric: numericPayload
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
          numeric: payload.guardrails.numeric ?? guardrailDefaults.numeric,
          isDefault: payload.guardrails.isDefault
        })
        setGuardrailNumeric(
          toNumericFormState(payload.guardrails.numeric, guardrailDefaults.numeric)
        )
        setGuardrailStatus('saved')
      } catch (err: any) {
        console.error('[admin/chat-config] guardrail save failed', err)
        setGuardrailError(err?.message ?? 'Failed to save guardrail settings')
        setGuardrailStatus('error')
      }
    },
    [
      guardrailDefaults,
      guardrailSaveDisabled,
      guardrailKeywords,
      guardrailFallbackChitchat,
      guardrailFallbackCommand,
      guardrailNumeric
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
      savedGuardrails.isDefault.fallbackCommand &&
      Object.values(savedGuardrails.isDefault.numeric).every(Boolean)
    if (usingDefaults) {
      return 'Currently using the default guardrail keywords and fallback guidance.'
    }
    return 'Update chit-chat detection keywords and fallback guidance shared by both chat engines.'
  }, [guardrailError, guardrailStatus, savedGuardrails])

  const modelHelperText = useMemo(() => {
    if (modelStatus === 'saved') {
      return 'Chat engine and model defaults updated successfully.'
    }
    if (modelStatus === 'error' && modelError) {
      return modelError
    }
    const usingDefaults =
      savedModels.engine === modelDefaults.engine &&
      savedModels.llmProvider === modelDefaults.llmProvider &&
      savedModels.embeddingProvider === modelDefaults.embeddingProvider &&
      savedModels.llmModel === modelDefaults.llmModel &&
      savedModels.embeddingModel === modelDefaults.embeddingModel
    if (usingDefaults) {
      return 'Currently using environment defaults for engine and model selection.'
    }
    return 'Choose the chat engine, LLM provider, and embedding provider used by the Chat Panel.'
  }, [modelDefaults.embeddingModel, modelDefaults.embeddingProvider, modelDefaults.engine, modelDefaults.llmModel, modelDefaults.llmProvider, modelError, modelStatus, savedModels.embeddingModel, savedModels.embeddingProvider, savedModels.engine, savedModels.llmModel, savedModels.llmProvider])

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

          <form className="admin-card" onSubmit={handleModelSave}>
            <h2>Engine &amp; model defaults</h2>
            <p className="description">{modelHelperText}</p>

            <div className="model-grid">
              <div className="model-field">
                <label htmlFor="chatEngine">Chat engine</label>
                <select
                  id="chatEngine"
                  value={modelForm.engine}
                  onChange={handleModelFieldChange('engine')}
                >
                  <option value="lc">LangChain</option>
                  <option value="native">Native</option>
                </select>
                <p className="help-text">Applies globally; Chat Panel uses this engine.</p>
              </div>

              <div className="model-field">
                <label htmlFor="llmProvider">LLM provider</label>
                <select
                  id="llmProvider"
                  value={modelForm.llmProvider}
                  onChange={handleModelFieldChange('llmProvider')}
                >
                  {MODEL_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {MODEL_PROVIDER_LABELS[provider]}
                    </option>
                  ))}
                </select>
                <p className="help-text">Choose the LLM vendor for chat responses.</p>
              </div>

              <div className="model-field">
                <div className="inline-field">
                  <label htmlFor="llmOverride">LLM model override</label>
                  <label className="toggle">
                    <input
                      id="llmOverride"
                      type="checkbox"
                      checked={modelOverrides.llm}
                      onChange={(event) => {
                        const enabled = event.target.checked
                        setModelOverrides((prev) => ({ ...prev, llm: enabled }))
                        if (!enabled) {
                          const defaults = getDefaultModelNames()
                          setModelForm((prev) => ({
                            ...prev,
                            llmModel: defaults.llm[prev.llmProvider]
                          }))
                        }
                        resetModelStatus()
                      }}
                    />
                    <span />
                  </label>
                </div>
                <input
                  id="llmModel"
                  type="text"
                  value={modelForm.llmModel}
                  onChange={handleModelFieldChange('llmModel')}
                  placeholder="Provider default"
                  readOnly={!modelOverrides.llm}
                />
                <p className="help-text">
                  Override only when you need a specific model; otherwise the provider default is used.
                </p>
              </div>
              <div className="model-field">
                <label htmlFor="embeddingProvider">Embedding provider</label>
                <select
                  id="embeddingProvider"
                  value={modelForm.embeddingProvider}
                  onChange={handleModelFieldChange('embeddingProvider')}
                >
                  {MODEL_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {MODEL_PROVIDER_LABELS[provider]}
                    </option>
                  ))}
                </select>
                <p className="help-text">Pick the provider used for retrieval embeddings.</p>
              </div>

              <div className="model-field">
                <div className="inline-field">
                  <label htmlFor="embeddingOverride">Embedding model override</label>
                  <label className="toggle">
                    <input
                      id="embeddingOverride"
                      type="checkbox"
                      checked={modelOverrides.embedding}
                      onChange={(event) => {
                        const enabled = event.target.checked
                        setModelOverrides((prev) => ({ ...prev, embedding: enabled }))
                        if (!enabled) {
                          const defaults = getDefaultModelNames()
                          setModelForm((prev) => ({
                            ...prev,
                            embeddingModel: defaults.embedding[prev.embeddingProvider]
                          }))
                        }
                        resetModelStatus()
                      }}
                    />
                    <span />
                  </label>
                </div>
                <input
                  id="embeddingModel"
                  type="text"
                  value={modelForm.embeddingModel}
                  onChange={handleModelFieldChange('embeddingModel')}
                  placeholder="Provider default"
                  readOnly={!modelOverrides.embedding}
                />
                <p className="help-text">
                  Must match how your chunks were ingested; leave blank to use the provider default.
                </p>
              </div>
            </div>

            <div className="form-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handleModelRestoreDefaults}
                disabled={modelRestoreDisabled}
              >
                Restore Model Defaults
              </button>
              <div />
              <button type="submit" className="primary-button" disabled={modelSaveDisabled}>
                {modelStatus === 'saving' ? 'Saving…' : 'Save Model Defaults'}
              </button>
            </div>
          </form>
          {modelStatus === 'error' && modelError && (
            <div className="admin-alert error">
              {modelError}
            </div>
          )}
          {modelStatus === 'saved' && (
            <div className="admin-alert success">
              Chat model settings saved.
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

            <div className="numeric-section">
              <h3>Retrieval &amp; context window</h3>
              <div className="numeric-grid">
                <div className="numeric-field">
                  <label htmlFor="similarityThreshold">Similarity threshold</label>
                  <input
                    id="similarityThreshold"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={guardrailNumeric.similarityThreshold}
                    onChange={handleNumericFieldChange('similarityThreshold')}
                  />
                  <span className="help-text">Lower values admit more excerpts.</span>
                </div>
                <div className="numeric-field">
                  <label htmlFor="ragTopK">RAG top K</label>
                  <input
                    id="ragTopK"
                    type="number"
                    min="1"
                    step="1"
                    value={guardrailNumeric.ragTopK}
                    onChange={handleNumericFieldChange('ragTopK')}
                  />
                  <span className="help-text">Vector matches requested before compression.</span>
                </div>
                <div className="numeric-field">
                  <label htmlFor="contextTokenBudget">Context token budget</label>
                  <input
                    id="contextTokenBudget"
                    type="number"
                    min="200"
                    step="50"
                    value={guardrailNumeric.ragContextTokenBudget}
                    onChange={handleNumericFieldChange('ragContextTokenBudget')}
                  />
                  <span className="help-text">Total tokens reserved for retrieved excerpts.</span>
                </div>
                <div className="numeric-field">
                  <label htmlFor="contextClipTokens">Excerpt clip tokens</label>
                  <input
                    id="contextClipTokens"
                    type="number"
                    min="64"
                    step="16"
                    value={guardrailNumeric.ragContextClipTokens}
                    onChange={handleNumericFieldChange('ragContextClipTokens')}
                  />
                  <span className="help-text">Maximum size for any single chunk.</span>
                </div>
                <div className="numeric-field">
                  <label htmlFor="historyBudget">History token budget</label>
                  <input
                    id="historyBudget"
                    type="number"
                    min="200"
                    step="50"
                    value={guardrailNumeric.historyTokenBudget}
                    onChange={handleNumericFieldChange('historyTokenBudget')}
                  />
                  <span className="help-text">Conversation tokens kept before summarizing.</span>
                </div>
              </div>
            </div>

            <div className="numeric-section">
              <h3>Conversation summaries</h3>
              <div className="numeric-grid">
                <div className="numeric-field checkbox-field">
                  <span>Enable conversation summaries</span>
                  <input
                    type="checkbox"
                    checked={guardrailNumeric.summaryEnabled}
                    onChange={handleSummaryEnabledChange}
                    aria-label="Toggle conversation summaries"
                  />
                </div>
                <div className="numeric-field">
                  <label htmlFor="summaryTrigger">Summary trigger tokens</label>
                  <input
                    id="summaryTrigger"
                    type="number"
                    min="200"
                    step="50"
                    value={guardrailNumeric.summaryTriggerTokens}
                    onChange={handleNumericFieldChange('summaryTriggerTokens')}
                  />
                </div>
                <div className="numeric-field">
                  <label htmlFor="summaryMaxTurns">Summary max turns</label>
                  <input
                    id="summaryMaxTurns"
                    type="number"
                    min="2"
                    step="1"
                    value={guardrailNumeric.summaryMaxTurns}
                    onChange={handleNumericFieldChange('summaryMaxTurns')}
                  />
                </div>
                <div className="numeric-field">
                  <label htmlFor="summaryMaxChars">Summary max chars</label>
                  <input
                    id="summaryMaxChars"
                    type="number"
                    min="200"
                    step="50"
                    value={guardrailNumeric.summaryMaxChars}
                    onChange={handleNumericFieldChange('summaryMaxChars')}
                  />
                </div>
              </div>
            </div>

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

        .admin-card .help-text {
          margin: 0.1rem 0 0;
          font-size: 0.85rem;
          color: #6b7280;
        }

        .admin-card .description {
          margin: 0;
          color: #555;
        }

        .model-grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }

        .model-field select,
        .model-field input[type='text'] {
          width: 100%;
          padding: 0.6rem 0.8rem;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          font-size: 0.95rem;
        }

        .model-field select:focus,
        .model-field input[type='text']:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
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

        .numeric-section {
          margin-top: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .numeric-section h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }

        .numeric-grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .numeric-field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .numeric-field input[type='number'] {
          padding: 0.55rem 0.65rem;
          border-radius: 6px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          font-size: 0.95rem;
        }

        .numeric-field input[type='number']:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
        }

        .numeric-field .help-text {
          font-size: 0.8rem;
          color: #6b7280;
        }

        .toggle {
          position: relative;
          display: inline-flex;
          width: 46px;
          height: 24px;
          align-items: center;
        }
        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .toggle span {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: #d1d5db;
          border-radius: 999px;
          transition: 0.2s;
        }
        .toggle span::before {
          position: absolute;
          content: '';
          height: 18px;
          width: 18px;
          left: 3px;
          top: 3px;
          background: white;
          border-radius: 50%;
          transition: 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }
        .toggle input:checked + span {
          background: #2563eb;
        }
        .toggle input:checked + span::before {
          transform: translateX(22px);
        }

        .inline-field {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .checkbox-field {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
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
