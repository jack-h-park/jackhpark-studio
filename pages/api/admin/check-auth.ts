import { type NextApiRequest, type NextApiResponse } from 'next'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // The middleware already verified the user via Basic Auth.
  // If we reach this handler, the user is an admin.
  res.status(200).json({ isAdmin: true })
}