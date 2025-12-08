"use client";

import Link from "next/link";
import { useRouter } from "next/router";

import { useRouteLoading } from "@/hooks/use-route-loading";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/admin/ingestion", label: "Overview" },
  { href: "/admin/documents", label: "RAG Documents" },
];

export function IngestionSubNav() {
  const { pathname } = useRouter();
  const isLoading = useRouteLoading(180);

  return (
    <div className="sticky top-0 z-20 -mx-1 mb-4 bg-[color:var(--ai-bg)] px-1 pt-2">
      <nav
        aria-label="Ingestion content navigation"
        className="flex flex-wrap items-center gap-6 border-b border-[color:var(--ai-border-soft)] px-1"
      >
        {PAGES.map((page) => {
          const active =
            pathname === page.href || pathname.startsWith(`${page.href}/`);

          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative inline-flex items-center justify-center py-3 text-sm font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ai-ring)] focus-visible:ring-offset-2",
                active
                  ? "text-[color:var(--ai-text-strong)]"
                  : "text-[color:var(--ai-text-muted)] hover:text-[color:var(--ai-text)] hover:bg-[color:var(--ai-bg-subtle)] rounded-md px-2 -mx-2",
              )}
            >
              {page.label}
              {active && (
                <span className="absolute bottom-0 left-0 h-[2px] w-full bg-[color:var(--ai-text-strong)]" />
              )}
            </Link>
          );
        })}
        {isLoading && (
          <span className="ml-auto pb-1 flex items-center">
            <span className="sr-only">Loading route</span>
            <span className="h-3.5 w-3.5 rounded-full border-2 border-[color:var(--ai-border-muted)] border-t-[color:var(--ai-text-strong)] animate-spin" />
          </span>
        )}
      </nav>
    </div>
  );
}
