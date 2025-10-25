import OpenAI from 'openai'

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing required environment variable "OPENAI_API_KEY"')
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export const EMBEDDING_MODEL = 'text-embedding-3-small'

export const USER_AGENT = 'JackRAGBot/1.0'