import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'

import styles from './NavigationProgress.module.css'

type State = 'idle' | 'loading' | 'complete'

export function NavigationProgress() {
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleStart = () => {
      delayRef.current = setTimeout(() => {
        setState('loading')
      }, 150)
    }

    const handleDone = () => {
      if (delayRef.current) {
        clearTimeout(delayRef.current)
        delayRef.current = null
      }
      setState((prev) => (prev === 'idle' ? 'idle' : 'complete'))
    }

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleDone)
    router.events.on('routeChangeError', handleDone)

    return () => {
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleDone)
      router.events.off('routeChangeError', handleDone)
      if (delayRef.current) clearTimeout(delayRef.current)
    }
  }, [router.events])

  if (state === 'idle') return null

  return (
    <div
      className={`${styles.bar} ${state === 'loading' ? styles.loading : styles.complete}`}
      onAnimationEnd={() => {
        if (state === 'complete') setState('idle')
      }}
    />
  )
}
