import type { NextApiRequest, NextApiResponse } from 'next'

import { SYSTEM_PROMPT_MAX_LENGTH } from '@/lib/chat-prompts'
import {
  loadGuardrailSettings,
  loadSystemPrompt,
  saveGuardrailSettings,
  saveSystemPrompt
} from '@/lib/server/chat-settings'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const [promptResult, guardrailResult] = await Promise.all([
        loadSystemPrompt({ forceRefresh: true }),
        loadGuardrailSettings({ forceRefresh: true })
      ])
      return res.status(200).json({
        systemPrompt: promptResult.prompt,
        isDefault: promptResult.isDefault,
        guardrails: guardrailResult
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
      const { systemPrompt, guardrails } = payload as {
        systemPrompt?: unknown
        guardrails?: {
          chitchatKeywords?: unknown
          fallbackChitchat?: unknown
          fallbackCommand?: unknown
        }
      }

      const hasPrompt = typeof systemPrompt === 'string'
      const hasGuardrails =
        guardrails &&
        typeof guardrails === 'object' &&
        guardrails !== null &&
        typeof guardrails.chitchatKeywords === 'string' &&
        typeof guardrails.fallbackChitchat === 'string' &&
        typeof guardrails.fallbackCommand === 'string'

      if (!hasPrompt && !hasGuardrails) {
        return res.status(400).json({
          error: 'Provide systemPrompt or guardrails payload.'
        })
      }

      let promptResult: Awaited<ReturnType<typeof saveSystemPrompt>> | undefined
      let guardrailResult:
        | Awaited<ReturnType<typeof saveGuardrailSettings>>
        | undefined

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
          fallbackCommand: guardrails!.fallbackCommand as string
        })
      }

      return res.status(200).json({
        ...(promptResult
          ? {
              systemPrompt: promptResult.prompt,
              isDefault: promptResult.isDefault
            }
          : {}),
        ...(guardrailResult ? { guardrails: guardrailResult } : {})
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
