import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { type BaseChatModelCallOptions , SimpleChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, type BaseMessage,ChatMessage } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'

import { getOllamaRuntimeConfig } from '@/lib/core/ollama'
import { OllamaUnavailableError } from '@/lib/server/ollama-provider'

const debugOllamaTiming = (process.env.DEBUG_OLLAMA_TIMING ?? '').toLowerCase() === 'true'
const logOllamaTiming = (durationMs: number, completed: boolean) => {
  if (!debugOllamaTiming) {
    return
  }
  console.info('[chat-ollama] /api/chat response time', {
    durationMs,
    completed
  })
}

export type ChatOllamaFields = {
  baseUrl?: string | null
  model?: string | null
  temperature?: number | null
  maxTokens?: number | null
}

type OllamaRole = 'system' | 'user' | 'assistant'

type OllamaMessage = {
  role: OllamaRole
  content: string
}

type OllamaChunkPayload = {
  message?: { content?: string }
  response?: string
  error?: string
}

export class ChatOllama extends SimpleChatModel<BaseChatModelCallOptions> {
  private readonly baseUrl: string
  private readonly model: string
  private readonly temperature: number
  private readonly maxTokens: number | null

  constructor(fields?: ChatOllamaFields) {
    super({})
    const config = getOllamaRuntimeConfig()
    this.baseUrl = fields?.baseUrl ?? config.baseUrl ?? ''
    this.model = fields?.model ?? config.defaultModel
    this.temperature =
      typeof fields?.temperature === 'number' && Number.isFinite(fields.temperature)
        ? fields.temperature
        : 0
    this.maxTokens = typeof fields?.maxTokens === 'number' ? fields.maxTokens : config.maxTokens

    if (!config.enabled || !this.baseUrl) {
      throw new OllamaUnavailableError('Ollama provider is disabled in this environment.')
    }
  }

  _llmType() {
    return 'ollama'
  }

  invocationParams() {
    return {
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens
    }
  }

  _combineLLMOutput() {
    return {}
  }

  async _call(messages: BaseMessage[], options: BaseChatModelCallOptions, runManager?: CallbackManagerForLLMRun): Promise<string> {
    let result = ''
    for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
      const content = typeof chunk.message.content === 'string' ? chunk.message.content : ''
      result += content
    }
    return result
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: BaseChatModelCallOptions,
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const startedAt = Date.now()
    let streamCompleted = false
    const controller = new AbortController()
    const signal = options?.signal ?? controller.signal
    const payload = this.buildPayload(messages)

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      })

      if (!response.ok || !response.body) {
        const errorPayload = await response.text().catch(() => '')
        throw new OllamaUnavailableError(
          `Ollama chat request failed (${response.status} ${response.statusText}). ${errorPayload}`
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { chunks, remainder } = this.drainBuffer(buffer)
        buffer = remainder
        for (const text of chunks) {
          const generation = new ChatGenerationChunk({
            message: new AIMessageChunk({ content: text }),
            text,
            generationInfo: {}
          })
          yield generation
          await runManager?.handleLLMNewToken(text)
        }
      }

      const finalText = buffer + decoder.decode()
      const { chunks: finalChunks } = this.drainBuffer(finalText, true)
      for (const text of finalChunks) {
        const generation = new ChatGenerationChunk({
          message: new AIMessageChunk({ content: text }),
          text,
          generationInfo: {}
        })
        yield generation
        await runManager?.handleLLMNewToken(text)
      }
      streamCompleted = true
    } catch (err: any) {
      if (err instanceof OllamaUnavailableError) {
        throw err
      }
      if (err && typeof err === 'object' && err.name === 'AbortError') {
        throw new OllamaUnavailableError('Ollama chat request timed out.', { cause: err })
      }
      throw new OllamaUnavailableError(
        err instanceof Error ? err.message : 'Ollama chat request failed.',
        { cause: err }
      )
    } finally {
      controller.abort()
      logOllamaTiming(Date.now() - startedAt, streamCompleted)
    }
  }

  private buildPayload(messages: BaseMessage[]): Record<string, unknown> {
    const formatted = this.convertMessages(messages)
    const options: Record<string, number> = {}
    if (Number.isFinite(this.temperature)) {
      options.temperature = this.temperature
    }
    if (typeof this.maxTokens === 'number' && this.maxTokens > 0) {
      options.num_predict = Math.floor(this.maxTokens)
    }
    return {
      model: this.model,
      messages: formatted,
      stream: true,
      options
    }
  }

  private convertMessages(messages: BaseMessage[]): OllamaMessage[] {
    const converted: OllamaMessage[] = []
    for (const message of messages) {
      const type = message.getType()
      const role: OllamaRole =
        type === 'ai'
          ? 'assistant'
          : type === 'human'
            ? 'user'
            : type === 'system'
              ? 'system'
              : ChatMessage.isInstance(message) && message.role === 'assistant'
                ? 'assistant'
                : 'user'
      const content = this.normalizeContent(message.content)
      if (content.length === 0) {
        continue
      }
      converted.push({ role, content })
    }

    if (converted.length === 0) {
      converted.push({ role: 'user', content: '' })
    }

    return converted
  }

  private normalizeContent(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part) return ''
          if (typeof part === 'string') {
            return part
          }
          if (typeof part === 'object' && 'text' in part && typeof (part as any).text === 'string') {
            return (part as { text: string }).text
          }
          return ''
        })
        .join('')
    }
    if (typeof content === 'object' && content && 'text' in content) {
      const value = (content as { text?: unknown }).text
      return typeof value === 'string' ? value : ''
    }
    return ''
  }

  private drainBuffer(buffer: string, flush = false): { chunks: string[]; remainder: string } {
    const chunks: string[] = []
    let remainder = buffer
    let newlineIndex = remainder.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = remainder.slice(0, newlineIndex).trim()
      remainder = remainder.slice(newlineIndex + 1)
      if (line.length > 0) {
        const text = this.parseLine(line)
        if (text) {
          chunks.push(text)
        }
      }
      newlineIndex = remainder.indexOf('\n')
    }

    if (flush && remainder.trim().length > 0) {
      const text = this.parseLine(remainder.trim())
      if (text) {
        chunks.push(text)
      }
      remainder = ''
    }

    return { chunks, remainder }
  }

  private parseLine(line: string): string | null {
    try {
      const payload = JSON.parse(line) as OllamaChunkPayload
      if (payload.error) {
        throw new OllamaUnavailableError(payload.error)
      }
      const text = payload.message?.content ?? payload.response ?? ''
      return typeof text === 'string' && text.length > 0 ? text : null
    } catch (err) {
      if (err instanceof OllamaUnavailableError) {
        throw err
      }
      console.warn('[ChatOllama] failed to parse stream chunk', { line, error: err })
      return null
    }
  }
}
