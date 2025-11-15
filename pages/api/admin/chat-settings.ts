import type { NextApiRequest, NextApiResponse } from 'next'

import { SYSTEM_PROMPT_MAX_LENGTH } from '@/lib/chat-prompts'
import {
  type GuardrailNumericSettings,
  loadChatModelSettings,
  loadGuardrailSettings,
  loadSystemPrompt,
  saveChatModelSettings,
  saveGuardrailSettings,
  saveSystemPrompt
} from '@/lib/server/chat-settings'
import type { ChatEngine, ModelProvider } from '@/lib/shared/model-provider'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const [promptResult, guardrailResult, chatModelSettings] = await Promise.all([
        loadSystemPrompt({ forceRefresh: true }),
        loadGuardrailSettings({ forceRefresh: true }),
        loadChatModelSettings({ forceRefresh: true })
      ])
      return res.status(200).json({
        systemPrompt: promptResult.prompt,
        isDefault: promptResult.isDefault,
        guardrails: guardrailResult,
        models: chatModelSettings
      })
    } catch (err: any) {
      console.error('[api/admin/chat-settings] failed to load settings', err)
      return res.status(500).json({
        error: err?.message ?? 'Failed to load chat settings'
      })
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const payload =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      const { systemPrompt, guardrails, models } = payload as {
        systemPrompt?: unknown
        guardrails?: {
          chitchatKeywords?: unknown
          fallbackChitchat?: unknown
          fallbackCommand?: unknown
          numeric?: Partial<Record<keyof GuardrailNumericSettings, unknown>>
        }
        models?: {
          engine?: unknown
          llmProvider?: unknown
          embeddingProvider?: unknown
          llmModel?: unknown
          embeddingModel?: unknown
        }
      }

      const hasPrompt = typeof systemPrompt === 'string'
      const numericPayload = guardrails?.numeric
      const hasGuardrails =
        guardrails &&
        typeof guardrails === 'object' &&
        guardrails !== null &&
        typeof guardrails.chitchatKeywords === 'string' &&
        typeof guardrails.fallbackChitchat === 'string' &&
        typeof guardrails.fallbackCommand === 'string' &&
        isValidNumericPayload(numericPayload)

      const hasModels =
        models &&
        typeof models === 'object' &&
        models !== null &&
        typeof models.engine === 'string' &&
        typeof models.llmProvider === 'string' &&
        typeof models.embeddingProvider === 'string' &&
        (typeof models.llmModel === 'string' || models.llmModel === undefined) &&
        (typeof models.embeddingModel === 'string' || models.embeddingModel === undefined)

      if (!hasPrompt && !hasGuardrails && !hasModels) {
        return res.status(400).json({
          error: 'Provide systemPrompt, guardrails, or models payload.'
        })
      }

      let promptResult: Awaited<ReturnType<typeof saveSystemPrompt>> | undefined
      let guardrailResult:
        | Awaited<ReturnType<typeof saveGuardrailSettings>>
        | undefined
      let chatModelResult: Awaited<ReturnType<typeof saveChatModelSettings>> | undefined

      if (hasPrompt) {
        const promptValue = systemPrompt as string

        if (promptValue.length > SYSTEM_PROMPT_MAX_LENGTH) {
          return res.status(400).json({
            error: `systemPrompt must be at most ${SYSTEM_PROMPT_MAX_LENGTH} characters`
          })
        }

        promptResult = await saveSystemPrompt(promptValue)
      }

      if (hasGuardrails) {
        guardrailResult = await saveGuardrailSettings({
          chitchatKeywords: guardrails!.chitchatKeywords as string,
          fallbackChitchat: guardrails!.fallbackChitchat as string,
          fallbackCommand: guardrails!.fallbackCommand as string,
          numeric: numericPayload as GuardrailNumericSettings
        })
      }

      if (hasModels) {
        chatModelResult = await saveChatModelSettings({
          engine: models!.engine as ChatEngine,
          llmProvider: models!.llmProvider as ModelProvider,
          embeddingProvider: models!.embeddingProvider as ModelProvider,
          llmModel: models!.llmModel as string | undefined,
          embeddingModel: models!.embeddingModel as string | undefined
        })
      }

      return res.status(200).json({
        ...(promptResult
          ? {
              systemPrompt: promptResult.prompt,
              isDefault: promptResult.isDefault
            }
          : {}),
        ...(guardrailResult ? { guardrails: guardrailResult } : {}),
        ...(chatModelResult ? { models: chatModelResult } : {})
      })
    } catch (err: any) {
      console.error('[api/admin/chat-settings] failed to update settings', err)
      return res.status(500).json({
        error: err?.message ?? 'Failed to update chat settings'
      })
    }
  }

  res.setHeader('Allow', ['GET', 'PUT', 'PATCH'])
  return res.status(405).json({ error: 'Method Not Allowed' })
}

const GUARDRAIL_NUMERIC_KEYS: Array<keyof GuardrailNumericSettings> = [
  'similarityThreshold',
  'ragTopK',
  'ragContextTokenBudget',
  'ragContextClipTokens',
  'historyTokenBudget',
  'summaryEnabled',
  'summaryTriggerTokens',
  'summaryMaxTurns',
  'summaryMaxChars'
]

function isValidNumericPayload(
  candidate: Partial<Record<keyof GuardrailNumericSettings, unknown>> | undefined
): candidate is GuardrailNumericSettings {
  if (!candidate) {
    return false
  }

  return GUARDRAIL_NUMERIC_KEYS.every((key) => {
    const value = candidate[key]
    if (key === 'summaryEnabled') {
      return typeof value === 'boolean'
    }
    return typeof value === 'number' && Number.isFinite(value)
  })
}
