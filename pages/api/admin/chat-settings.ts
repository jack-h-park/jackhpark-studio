import type { NextApiRequest, NextApiResponse } from 'next'

import { SYSTEM_PROMPT_MAX_LENGTH } from '@/lib/chat-prompts'
import { loadSystemPrompt, saveSystemPrompt } from '@/lib/server/chat-settings'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const result = await loadSystemPrompt({ forceRefresh: true })
      return res.status(200).json({
        systemPrompt: result.prompt,
        isDefault: result.isDefault
      })
    } catch (err: any) {
      console.error('[api/admin/chat-settings] failed to load prompt', err)
      return res.status(500).json({
        error: err?.message ?? 'Failed to load system prompt'
      })
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const payload =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      const { systemPrompt } = payload as { systemPrompt?: unknown }

      if (typeof systemPrompt !== 'string') {
        return res.status(400).json({ error: 'systemPrompt must be a string' })
      }

      if (systemPrompt.length > SYSTEM_PROMPT_MAX_LENGTH) {
        return res.status(400).json({
          error: `systemPrompt must be at most ${SYSTEM_PROMPT_MAX_LENGTH} characters`
        })
      }

      const result = await saveSystemPrompt(systemPrompt)
      return res.status(200).json({
        systemPrompt: result.prompt,
        isDefault: result.isDefault
      })
    } catch (err: any) {
      console.error('[api/admin/chat-settings] failed to update prompt', err)
      return res.status(500).json({
        error: err?.message ?? 'Failed to update system prompt'
      })
    }
  }

  res.setHeader('Allow', ['GET', 'PUT', 'PATCH'])
  return res.status(405).json({ error: 'Method Not Allowed' })
}
