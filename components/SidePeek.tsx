import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import cs from 'classnames'
import { createPortal } from 'react-dom'

export interface SidePeekProps {
  isOpen: boolean
  on<NotionPageRenderer: () => void
  children: React.ReactNode
}

export const SidePeek: React.FC<SidePeekProps> = ({
  isOpen,
  onClose,
  children
}) => {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) return null

  // createPortal 을 document.body 로 강제 지정
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className='sidepeek-overlay'
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
              zIndex: 9999
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className='sidepeek-panel'
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 480,
              background: 'white',
              zIndex: 10000,
              boxShadow: '-10px 0 30px rgba(0,0,0,0.2)'
            }}
            initial={{ x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    // ✅ 반드시 document.body
    typeof window !== 'undefined' ? document.body : null
  )
  //   )

  //   return (
  //     <AnimatePresence>
  //       {isOpen && (
  //         <>
  //           {/* ✅ 오버레이 (닫기용 배경) */}
  //           <motion.div
  //             key='overlay'
  //             className='fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]'
  //             initial={{ opacity: 0 }}
  //             animate={{ opacity: 1 }}
  //             exit={{ opacity: 0 }}
  //             onClick={onClose}
  //           />

  //           {/* ✅ 사이드 패널 */}
  //           <motion.div
  //             key='sidepeek'
  //             className={cs(
  //               'fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-neutral-900 shadow-2xl z-[9999]'
  //             )}
  //             initial={{ x: '100%' }}
  //             animate={{ x: 0 }}
  //             exit={{ x: '100%' }}
  //             transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  //           >
  //             {children}
  //           </motion.div>
  //         </>
  //       )}
  //     </AnimatePresence>

  // dkfos아래는 더 옛날꺼
  // <AnimatePresence>
  //   {isOpen && (
  //     <div className='fixed inset-0 z-[9999] flex justify-end'>
  //       {/* 배경 오버레이 */}
  //       <motion.div
  //         className='fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]'
  //         initial={{ opacity: 0 }}
  //         animate={{ opacity: 1 }}
  //         exit={{ opacity: 0 }}
  //         onClick={onClose}
  //       />

  //       {/* 사이드 패널 */}
  //       <motion.div
  //         className={cs(
  //           'fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-neutral-900 shadow-2xl z-[9999]'
  //         )}
  //         initial={{ x: '100%' }}
  //         animate={{ x: 0 }}
  //         exit={{ x: '100%' }}
  //         transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  //       >
  //         {children}
  //       </motion.div>
  //     </div>
  //   )}
  // </AnimatePresence>
}

export default SidePeek
