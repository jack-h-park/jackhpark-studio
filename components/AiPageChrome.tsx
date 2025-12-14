import type { ExtendedRecordMap, PageBlock } from "notion-types";
import type { ReactNode } from "react";
import Link from "next/link";
import { NotionContextProvider } from "react-notion-x";

import { Footer } from "@/components/Footer";
import { NotionPageHeader } from "@/components/NotionPageHeader";
import { ToggleThemeButton } from "@/components/ToggleThemeButton";
import { site } from "@/lib/config";
import { mapImageUrl } from "@/lib/map-image-url";
import { useDarkMode } from "@/lib/use-dark-mode";

import styles from "./AiPageChrome.module.css";
import { cn } from "./ui/utils";

type AiPageChromeProps = {
  headerRecordMap: ExtendedRecordMap | null;
  headerBlockId: string;
  children: ReactNode;
  rootClassName?: string;
  bodyClassName?: string;
  fullBleed?: boolean;
};

export function AiPageChrome({
  headerRecordMap,
  headerBlockId,
  children,
  rootClassName,
  bodyClassName,
  fullBleed = false,
}: AiPageChromeProps) {
  const { isDarkMode } = useDarkMode();
  const canonicalHeaderBlockId = headerBlockId?.replaceAll("-", "");
  const headerBlockEntry =
    headerRecordMap?.block?.[headerBlockId] ??
    (canonicalHeaderBlockId
      ? headerRecordMap?.block?.[canonicalHeaderBlockId]
      : undefined);
  const headerBlock = headerBlockEntry?.value as PageBlock | undefined;

  return (
    <div
      className={cn(
        styles.chrome,
        "notion",
        fullBleed && styles.chromeFullBleed,
        rootClassName,
      )}
    >
      <div className={styles.header}>
        {headerRecordMap && headerBlock ? (
          <NotionContextProvider
            recordMap={headerRecordMap}
            fullPage
            darkMode={isDarkMode}
            previewImages={false}
            forceCustomImages={false}
            showCollectionViewDropdown={false}
            showTableOfContents={false}
            minTableOfContentsItems={0}
            linkTableTitleProperties={false}
            isLinkCollectionToUrlProperty={false}
            mapPageUrl={(pageId: string) => `/${pageId}`}
            mapImageUrl={mapImageUrl}
          >
            <NotionPageHeader block={headerBlock} />
          </NotionContextProvider>
        ) : (
          <header className="notion-header">
            <div className="notion-nav-header">
              <div className="breadcrumbs">
                <div className="breadcrumb active">
                  <Link href="/" className="breadcrumb-link">
                    {site.name}
                  </Link>
                </div>
              </div>

              <div className="notion-nav-header-rhs breadcrumbs">
                <ToggleThemeButton />
              </div>
            </div>
          </header>
        )}
      </div>
      <main
        className={cn(
          styles.body,
          fullBleed && styles.bodyFullBleed,
          bodyClassName,
        )}
      >
        {children}
      </main>
      <div className={styles.footer}>
        <Footer />
      </div>
    </div>
  );
}
