import type { NextApiResponse } from 'next'

import {
  OLLAMA_UNAVAILABLE_ERROR_CODE,
  OLLAMA_UNAVAILABLE_ERROR_MESSAGE
} from '@/lib/server/ollama-provider'

export const UNSUPPORTED_OLLAMA_MODEL_CODE = 'UNSUPPORTED_OLLAMA_MODEL'

export function respondWithOllamaUnavailable(res: NextApiResponse) {
  return res.status(503).json({
    error: {
      code: OLLAMA_UNAVAILABLE_ERROR_CODE,
      message: OLLAMA_UNAVAILABLE_ERROR_MESSAGE
    }
  })
}

export function respondWithUnsupportedOllamaModel(res: NextApiResponse, modelId: string) {
  return res.status(400).json({
    error: {
      code: UNSUPPORTED_OLLAMA_MODEL_CODE,
      message: `지원하지 않는 Ollama 모델입니다: ${modelId}`
    }
  })
}
