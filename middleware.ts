import { type NextRequest, NextResponse } from 'next/server'

const REALM = 'Admin'

function getEnvCredentials(): { username: string; password: string } | null {
  const username = process.env.ADMIN_DASH_USER
  const password = process.env.ADMIN_DASH_PASS

  if (!username || !password) {
    console.warn(
      '[middleware/admin-auth] ADMIN_DASH_USER or ADMIN_DASH_PASS is not configured; denying access.'
    )
    return null
  }

  return { username, password }
}

function decodeBase64(str: string): string | null {
  try {
    if (typeof atob === 'function') {
      return atob(str)
    }
  } catch (err) {
    console.warn('[middleware/admin-auth] atob decode failed', err)
  }

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf8')
    }
  } catch (err) {
    console.warn('[middleware/admin-auth] Buffer decode failed', err)
  }

  return null
}

function decodeBasicAuth(header: string): { username: string; password: string } | null {
  const token = header.split(' ')[1]
  if (!token) return null

  const decoded = decodeBase64(token)
  if (!decoded) {
    return null
  }

  const separatorIndex = decoded.indexOf(':')
  if (separatorIndex === -1) {
    return null
  }

  const username = decoded.slice(0, separatorIndex)
  const password = decoded.slice(separatorIndex + 1)

  return { username, password }
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0)
  }

  return result === 0
}

function unauthorizedResponse(): NextResponse {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`
    }
  })
}

export function middleware(request: NextRequest): NextResponse | void {
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return
  }

  const expected = getEnvCredentials()
  if (!expected) {
    return unauthorizedResponse()
  }

  const header = request.headers.get('authorization')
  if (!header || !header.startsWith('Basic ')) {
    return unauthorizedResponse()
  }

  const credentials = decodeBasicAuth(header)
  if (
    !credentials ||
    !constantTimeEquals(credentials.username, expected.username) ||
    !constantTimeEquals(credentials.password, expected.password)
  ) {
    return unauthorizedResponse()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}
