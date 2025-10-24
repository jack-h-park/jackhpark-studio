// global styles shared across the entire site
import '../styles/global.css'

// this might be better for dark mode
// import 'prismjs/themes/prism-okaidia.css'
import type { AppProps } from 'next/app'
import * as Fathom from 'fathom-client'
import { useRouter } from 'next/router'
import { posthog } from 'posthog-js'
import React, { useEffect } from 'react'

import {
  fathomConfig,
  fathomId,
  posthogConfig,
  posthogId
} from '@/lib/config'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  useEffect(() => {
    function onRouteChangeComplete() {
      if (fathomId) {
        Fathom.trackPageview()
      }

      if (posthogId) {
        posthog.capture('$pageview')
      }
    }

    if (fathomId) {
      Fathom.load(fathomId, fathomConfig)
    }

    if (posthogId) {
      posthog.init(posthogId, posthogConfig)
    }

    router.events.on('routeChangeComplete', onRouteChangeComplete)

    return () => {
      router.events.off('routeChangeComplete', onRouteChangeComplete)
    }
  }, [router.events])

  return <Component {...pageProps} />
}
