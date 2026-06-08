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
    <nav
      aria-label="Ingestion pages"
      className="flex items-center justify-between gap-4"
    >
      <div role="tablist" className="flex items-center gap-1.5">
        {PAGES.map((page) => {
          const active =
            pathname === page.href || pathname.startsWith(`${page.href}/`);

          return (
            <Link
              key={page.href}
              href={page.href}
              role="tab"
              aria-current={active ? "page" : undefined}
              aria-selected={active}
              className={cn(
                "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ai-ring)] focus-visible:ring-offset-2",
                active
                  ? "border border-[color:var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] text-[color:var(--ai-text-strong)]"
                  : "text-[color:var(--ai-text-muted)] hover:bg-[var(--ai-role-surface-hover)] hover:text-[color:var(--ai-text-strong)]",
              )}
            >
              {page.label}
            </Link>
          );
        })}
      </div>
      {isLoading && (
        <span className="flex items-center gap-2 text-sm">
          <span className="sr-only">Loading route</span>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[color:var(--ai-role-border-muted)] border-t-[color:var(--ai-text-strong)]" />
        </span>
      )}
    </nav>
  );
}
