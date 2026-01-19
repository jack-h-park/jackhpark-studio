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
    <div className="border-b border-[color:var(--ai-role-border-subtle)] pb-3">
      <nav
        aria-label="Ingestion pages"
        className="flex items-center justify-between gap-4"
      >
        <div role="tablist" className="flex items-center gap-8 text-base font-semibold">
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
                  "relative inline-flex items-center border-b-2 border-transparent pb-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ai-ring)] focus-visible:ring-offset-2",
                  active
                    ? "border-[color:var(--ai-text-strong)] text-[color:var(--ai-text-strong)]"
                    : "text-[color:var(--ai-text-muted)] hover:text-[color:var(--ai-text-strong)]",
                )}
              >
                {page.label}
              </Link>
            );
          })}
        </div>
        {isLoading && (
          <span className="flex items-center gap-2 pb-1 text-sm">
            <span className="sr-only">Loading route</span>
            <span className="h-3.5 w-3.5 rounded-full border-2 border-[color:var(--ai-border-muted)] border-t-[color:var(--ai-text-strong)] animate-spin" />
          </span>
        )}
      </nav>
    </div>
  );
}
