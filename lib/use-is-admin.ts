import * as React from 'react'

type UseIsAdminResult = {
  isAdmin: boolean
  isLoading: boolean
}

export const useIsAdmin = (): UseIsAdminResult => {
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true

    async function checkAdminStatus() {
      try {
        const res = await fetch('/api/admin/check-auth')
        if (isMounted) {
          setIsAdmin(res.ok)
        }
      } catch (err) {
        console.error('Error checking admin status:', err)
        if (isMounted) {
          setIsAdmin(false)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void checkAdminStatus()

    return () => {
      isMounted = false
    }
  }, [])

  return { isAdmin, isLoading }
}