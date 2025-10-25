import { type NextRequest, NextResponse } from 'next/server'

export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - api (API routes)
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico (favicon file)
   * But we want to protect /admin and /api/admin, so we will specify them.
   */
  matcher: ['/admin/:path*', '/api/admin/:path*']
}

export function middleware(req: NextRequest) {
  const basicAuth = req.headers.get('authorization')
  const user = process.env.ADMIN_DASH_USER
  const pass = process.env.ADMIN_DASH_PASS

  // Require username and password to be set
  if (!user || !pass) {
    return new NextResponse('Internal Server Error: Auth credentials not set.', {
      status: 500
    })
  }

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [providedUser, providedPass] = atob(authValue).split(':')

    if (providedUser === user && providedPass === pass) {
      return NextResponse.next()
    }
  }

  // If authentication fails, request credentials
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"'
    }
  })
}