import type { NextApiRequest, NextApiResponse } from 'next'

import langchainChat from './langchain_chat'
import nativeChat from './native_chat'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { engine } = req.query

  if (engine === 'native') {
    await nativeChat(req, res)
    return
  }

  await langchainChat(req, res)
}
