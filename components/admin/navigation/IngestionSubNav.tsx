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
      aria-label="Ingestion secondary navigation"
      className="flex flex-wrap gap-2"
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
              "inline-flex items-center justify-center rounded-[var(--ai-radius-sm)] border border-transparent px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.05em] transition focus-ring",
              active
                ? "border-[color:var(--ai-border-muted)] bg-[color:var(--ai-surface)] text-[color:var(--ai-text-strong)]"
                : "text-[color:var(--ai-text-muted)] hover:border-[color:var(--ai-border-muted)] hover:text-[color:var(--ai-text-strong)]",
            )}
          >
            {page.label}
          </Link>
        );
      })}
      {isLoading && (
        <span className="ml-auto flex items-center">
          <span className="sr-only">Loading route</span>
          <span className="h-2.5 w-2.5 rounded-full border border-[color:var(--ai-border-muted)] border-t-[color:var(--ai-text-strong)] animate-spin" />
        </span>
      )}
    </nav>
  );
}
