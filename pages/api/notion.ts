// pages/api/notion.ts
// import { resolveNotionPage } from '@/lib/resolve-notion-page'
// import { domain } from '@/lib/config'
// import type { NextApiRequest, NextApiResponse } from 'next'

// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   const id = req.query.id as string
//   if (!id) return res.status(400).json({ error: 'Missing id parameter' })

//   try {
//     const data = await resolveNotionPage(domain, id)
//     res.status(200).json(data)
//   } catch (err) {
//     res.status(404).json({ error: 'Page not found' })
//   }
// }

import { NotionAPI } from 'notion-client'

export default async function handler(req, res) {
  const { id } = req.query
  const api = new NotionAPI()

  try {
    const recordMap = await api.getPage(id)
    res.status(200).json({ recordMap })
  } catch (err) {
    console.error('Error fetching page:', err)
    res.status(500).json({ error: 'Failed to load notion page' })
  }
}