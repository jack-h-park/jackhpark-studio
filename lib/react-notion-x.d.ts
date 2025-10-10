// lib/react-notion-x.d.ts
 
import type { MapImageUrlFn,NotionComponents } from 'react-notion-x'

// ✅ 이 줄 추가: 전역 타입 선언 파일로 처리되게 함


declare module 'react-notion-x' {
  interface NotionPageRendererProps {
    bodyClassName?: string
    darkMode?: boolean
    components?: Partial<NotionComponents>
    recordMap: any
    rootPageId?: string
    rootDomain?: string
    fullPage?: boolean
    previewImages?: boolean
    showCollectionViewDropdown?: boolean
    showTableOfContents?: boolean
    minTableOfContentsItems?: number
    defaultPageIcon?: string
    defaultPageCover?: string
    defaultPageCoverPosition?: number
    mapPageUrl?: (id: string) => string
    mapImageUrl?: MapImageUrlFn
    searchNotion?: any
    pageAside?: React.ReactNode
    footer?: React.ReactNode

    // ✅ 이 줄 추가
    children?: React.ReactNode
  }
}