#!/usr/bin/env ts-node

import { GoogleGenerativeAI } from '@google/generative-ai'

import { getGeminiModelCandidates } from '@/lib/core/gemini'
import { getLlmModelName, requireProviderApiKey } from '@/lib/core/model-provider'

const DEFAULT_PROMPT = 'Can you confirm the Gemini API is reachable?'

const apiKey = requireProviderApiKey('gemini')
const baseModel =
  process.env.GOOGLE_LLM_MODEL ??
  process.env.LLM_MODEL ??
  getLlmModelName('gemini', null)
const prompt = process.argv.slice(2).join(' ').trim() || DEFAULT_PROMPT

const candidates = getGeminiModelCandidates(baseModel)
const client = new GoogleGenerativeAI(apiKey)

console.log(`[test-gemini] prompt: "${prompt}"`)
console.log('[test-gemini] candidates:', candidates.join(' -> '))

for (const modelName of candidates) {
  try {
    const model = client.getGenerativeModel({ model: modelName })
    const result = await model.generateContent(prompt)
    const text =
      result.response?.text() ??
      result.response?.candidates?.[0]?.content?.parts
        ?.map((part) => ('text' in part ? part.text : ''))
        .join('')

    console.log(
      `[test-gemini] SUCCESS using "${modelName}": ${text ?? '(empty response)'}`
    )
    process.exit(0)
  } catch (err) {
    console.error(`[test-gemini] FAILED using "${modelName}"`, err)
  }
}

throw new Error(
  'All Gemini model candidates failed. Check the logs above for details.'
)
