import { NextApiRequest, NextApiResponse } from 'next'

import { fetchGet } from '@/data/fetchers'
import { constructHeaders } from '@/lib/api/apiHelpers'
import { apiWrapper } from '@/lib/api/apiWrapper'
import { PG_META_URL } from '@/lib/constants'
import { IS_REPLICATION_ENABLED } from '@/lib/database-capabilities'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!IS_REPLICATION_ENABLED) {
    return res.status(503).json({
      error: { message: 'Publications and replication are disabled for this deployment.' },
    })
  }
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  const headers = constructHeaders(req.headers)
  const response = await fetchGet(`${PG_META_URL}/publications`, { headers })

  if (response.error) {
    const { code, message } = response.error
    return res.status(code).json({ message })
  } else {
    return res.status(200).json(response)
  }
}
