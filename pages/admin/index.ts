import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function AdminIndex() {
  const router = useRouter()

  useEffect(() => {
    void router.replace('/admin/ingestion')
  }, [router])

  return null
}