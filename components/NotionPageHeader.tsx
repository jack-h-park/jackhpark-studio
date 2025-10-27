import type { CollectionViewPageBlock, PageBlock } from "notion-types";
import { IoMoonSharp } from "@react-icons/all-files/io5/IoMoonSharp";
import { IoSunnyOutline } from "@react-icons/all-files/io5/IoSunnyOutline";
import cs from "classnames";
import Link from "next/link"; // ✅ Use Next.js router link
import { getBlockTitle, getPageBreadcrumbs } from "notion-utils";
import * as React from "react";
import { Header, PageIcon, Search, useNotionContext } from "react-notion-x";

import {
  isSearchEnabled,
  navigationLinks,
  navigationStyle,
} from "@/lib/config";
import { useDarkMode } from "@/lib/use-dark-mode";

import styles from "./styles.module.css";

function ToggleThemeButton() {
  const [hasMounted, setHasMounted] = React.useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const onToggleTheme = React.useCallback(() => {
    toggleDarkMode();
  }, [toggleDarkMode]);

  return (
    <div
      className={cs("breadcrumb", "button", !hasMounted && styles.hidden)}
      onClick={onToggleTheme}
    >
      {hasMounted && isDarkMode ? <IoMoonSharp /> : <IoSunnyOutline />}
    </div>
  );
}

export function NotionPageHeader({
  block,
}: {
  block: CollectionViewPageBlock | PageBlock;
}) {
  const { components, mapPageUrl, recordMap } = useNotionContext();

  console.log("[Real Header] rendered =", block);

  const breadcrumbs = React.useMemo(() => {
    if (!block?.id || !recordMap) {
      return [];
    }

    return getPageBreadcrumbs(recordMap, block.id) ?? [];
  }, [block?.id, recordMap]);

  const fallbackBreadcrumbs = React.useMemo(() => {
    const title = getBlockTitle(block, recordMap) || "Untitled";

    return [
      {
        pageId: block?.id,
        title,
      },
    ];
  }, [block, recordMap]);

  if (navigationStyle === "default") {
    return <Header block={block} />;
  }

  return (
    <header className="notion-header">
      <div className="notion-nav-header">
        {/* New version */}
        <div className="breadcrumbs">
          {(() => {
            const rootBreadcrumb =
              breadcrumbs.length > 0
                ? [breadcrumbs[0]] // Only the root of the current page hierarchy
                : fallbackBreadcrumbs.length > 0
                  ? [fallbackBreadcrumbs[0]] // Fallback is also only the root
                  : [];

            if (rootBreadcrumb.length === 0) return null;

            const root = rootBreadcrumb[0];
            const rootBlock = recordMap.block[root.pageId]?.value;

            return (
              <div className="breadcrumb active">
                <Link
                  href={`/${root.pageId}`}
                  className="breadcrumb-link"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  {/* Icon */}
                  {rootBlock && <PageIcon className="icon" block={rootBlock} />}

                  {/* Title */}
                  <span className="title" style={{ marginLeft: "0.25em" }}>
                    {root.title}
                  </span>
                </Link>
              </div>
            );
          })()}
        </div>

        {/* Original version <div className='breadcrumbs'>
          {breadcrumbs.length > 0 ? (
            <Breadcrumbs block={block} />
          ) : (
            fallbackBreadcrumbs.map((breadcrumb: any, index: number) => (
              <React.Fragment key={breadcrumb.pageId || index}>
                <div className='breadcrumb active'>
                  <PageIcon className='icon' block={block} />
                  <span className='title'>{breadcrumb.title}</span>
                </div>
              </React.Fragment>
            ))
          )}
        </div> */}

        <div className="notion-nav-header-rhs breadcrumbs">
          {navigationLinks
            ?.map((link, index) => {
              if (!link?.pageId && !link?.url) {
                return null;
              }

              if (link.pageId) {
                return (
                  <components.PageLink
                    href={mapPageUrl(link.pageId)}
                    key={index}
                    className={cs(styles.navLink, "breadcrumb", "button")}
                  >
                    {link.title}
                  </components.PageLink>
                );
              } else {
                return (
                  <components.Link
                    href={link.url}
                    key={index}
                    className={cs(styles.navLink, "breadcrumb", "button")}
                  >
                    {link.title}
                  </components.Link>
                );
              }
            })
            .filter(Boolean)}

          <ToggleThemeButton />

          {isSearchEnabled && <Search block={block} title={null} />}
        </div>
      </div>
    </header>
  );
}
