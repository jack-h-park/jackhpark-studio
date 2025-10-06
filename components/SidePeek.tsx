import * as React from 'react'
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform
} from 'framer-motion'
import { createPortal } from 'react-dom'
import cs from 'classnames'

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

  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 150], [1, 0.3])

  // ✅ 마운트 및 모바일 감지
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

  // ✅ ESC 키로 닫기
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (isOpen) window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  // ✅ 스크롤 잠금
  React.useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!mounted || typeof window === 'undefined') return null

  const panelWidth = isMobile ? '100%' : 480

  // ✅ 모바일 스와이프 제스처 핸들러
  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.y > 120) {
      onClose()
    }
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 오버레이 */}
          <motion.div
            className='sidepeek-overlay'
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
              zIndex: 9999,
              opacity
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 사이드 패널 */}
          <motion.div
            className={cs(
              'sidepeek-panel',
              isMobile ? 'sidepeek-mobile' : 'sidepeek-desktop'
            )}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: panelWidth,
              background: 'white',
              zIndex: 10000,
              boxShadow: '-10px 0 30px rgba(0,0,0,0.2)',
              overflowY: 'auto'
            }}
            drag={isMobile ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={isMobile ? handleDragEnd : undefined}
            initial={{ x: panelWidth }}
            animate={{ x: 0, y: 0 }}
            exit={{ x: panelWidth }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* 모바일 닫기 버튼 */}
            {isMobile && (
              <button
                onClick={onClose}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  zIndex: 10001,
                  fontSize: 22,
                  border: 'none',
                  background: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  cursor: 'pointer'
                }}
                aria-label='Close side panel'
              >
                ✕
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
