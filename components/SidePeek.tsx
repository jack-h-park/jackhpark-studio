import * as React from 'react'
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useDragControls
} from 'framer-motion'
import { createPortal } from 'react-dom'
import cs from 'classnames'
import styles from './SidePeek.module.css'

export interface SidePeekProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export const SidePeek: React.FC<SidePeekProps> = ({
  isOpen,
  onClose,
  children
}) => {
  const [mounted, setMounted] = React.useState(false)
  const [isMobile, setIsMobile] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const scrollRafRef = React.useRef<number | null>(null)
  const dragControls = useDragControls()

  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 150], [1, 0.3])

  // detect mount and viewport size changes
  React.useEffect(() => {
    setMounted(true)
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      setMounted(false)
    }
  }, [])

  // allow closing via ESC key
  React.useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    if (isOpen) window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  // lock document scroll while the peek is open
  React.useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // propagate panel scroll events so lazy notion blocks continue rendering
  React.useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return
    }

    const panelEl = panelRef.current
    if (!panelEl) return

    const emitScroll = () => {
      if (scrollRafRef.current !== null) {
        return
      }

      scrollRafRef.current = window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('scroll'))
        scrollRafRef.current = null
      })
    }

    panelEl.addEventListener('scroll', emitScroll, { passive: true })
    emitScroll()

    return () => {
      panelEl.removeEventListener('scroll', emitScroll)
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [isOpen])

  const hiddenPosition = isMobile
    ? { x: 0, y: '100%' as const }
    : { x: 480, y: 0 }

  if (!mounted || typeof window === 'undefined') return null

  // close the panel when the mobile drag exceeds the threshold
  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.y > 120) {
      onClose()
    }
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className={styles.overlay}
            style={{ opacity }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Side panel */}
          <motion.div
            ref={panelRef}
            className={cs(styles.panel, isMobile && styles.mobile)}
            drag={isMobile ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={isMobile ? handleDragEnd : undefined}
            initial={hiddenPosition}
            animate={{ x: 0, y: 0 }}
            exit={hiddenPosition}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {isMobile && (
              <div
                className={styles.dragHandle}
                onPointerDown={(event) => dragControls.start(event)}
              />
            )}

            {/* Mobile close button */}
            {isMobile && (
              <button
                onClick={onClose}
                className={styles.closeButton}
                aria-label='Close side panel'
              >
                x
              </button>
            )}

            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default SidePeek
