import * as React from 'react'
import type * as types from '@/lib/types'

export function useSidePeek() {
  const [isPeekOpen, setIsPeekOpen] = React.useState(false)
  const [peekPageId, setPeekPageId] = React.useState<string | null>(null)
  const [peekRecordMap, setPeekRecordMap] =
    React.useState<types.ExtendedRecordMap | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  const handleOpenPeek = React.useCallback((pageId: string) => {
    setPeekPageId(pageId)
    setIsPeekOpen(true)
  }, [])

  const handleClosePeek = React.useCallback(() => {
    setIsPeekOpen(false)
    setPeekPageId(null)
    setPeekRecordMap(null)
  }, [])

  React.useEffect(() => {
    if (!peekPageId) return

    const fetchPeekPage = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/notion?id=${peekPageId}`)
        if (!res.ok) throw new Error('Failed to fetch peek page')
        const data = (await res.json()) as {
          recordMap: types.ExtendedRecordMap
        }
        setPeekRecordMap(data.recordMap || null)
      } catch (err) {
        console.error('[SidePeek fetch error]', err)
        handleClosePeek()
      } finally {
        setIsLoading(false)
      }
    }

    void fetchPeekPage()
  }, [peekPageId, handleClosePeek])

  return { isPeekOpen, peekRecordMap, isLoading, handleOpenPeek, handleClosePeek }
}
