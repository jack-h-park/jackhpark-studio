"use client";

import Link from "next/link";

import { useRouteLoading } from "@/hooks/use-route-loading";
import { cn } from "@/lib/utils";

type AdminSection = {
  href: string;
  label: string;
  id: "chat" | "ingestion";
};

const SECTIONS: AdminSection[] = [
  { href: "/admin/chat-config", label: "Chat", id: "chat" },
  { href: "/admin/ingestion", label: "Ingestion", id: "ingestion" },
];

export type AdminTopNavProps = {
  activeSection: AdminSection["id"];
  className?: string;
};

export function AdminTopNav({ activeSection, className }: AdminTopNavProps) {
  const isLoading = useRouteLoading();
  return (
    <nav
      aria-label="Admin section navigation"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-full border border-[color:var(--ai-border-soft)]/40 bg-[color:var(--ai-bg-subtle)]/90 px-1.5 py-1.5 backdrop-blur",
        className,
      )}
    >
      {SECTIONS.map((section) => {
        const active = activeSection === section.id;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "ai-selectable inline-flex items-center justify-center rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-[0.1em] transition focus-ring",
              active
                ? "ai-selectable--active text-[color:var(--ai-text-strong)]"
                : "ai-selectable--hoverable text-[color:var(--ai-text-muted)]",
            )}
          >
            {section.label}
          </Link>
        );
      })}
      {isLoading && (
        <span className="ml-auto flex items-center">
          <span className="sr-only">Loading route</span>
          <span className="h-4 w-4 rounded-full border-2 border-[color:var(--ai-border-muted)] border-t-[color:var(--ai-text-strong)] animate-spin" />
        </span>
      )}
    </nav>
  );
}
