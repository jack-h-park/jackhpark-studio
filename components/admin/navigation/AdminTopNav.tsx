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
  /** Whether the J-P theme is currently active */
  isJpTheme?: boolean;
  /** Callback to toggle between J-P and legacy theme */
  onToggleTheme?: () => void;
};

export function AdminTopNav({
  activeSection,
  className,
  isJpTheme = true,
  onToggleTheme,
}: AdminTopNavProps) {
  const isLoading = useRouteLoading();
  return (
    <nav
      aria-label="Admin section navigation"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-full border border-[color:var(--ai-role-border-subtle)]/40 bg-[color:var(--ai-role-surface-muted)]/90 px-1.5 py-1.5 backdrop-blur",
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
              "ai-selectable inline-flex items-center justify-center rounded-full px-3 py-0.5 text-xs font-medium uppercase tracking-[0.1em] transition focus-ring",
              active
                ? "ai-selectable--active text-[color:var(--ai-text-strong)]"
                : "ai-selectable--hoverable text-[color:var(--ai-text-muted)]",
            )}
          >
            {section.label}
          </Link>
        );
      })}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Theme toggle */}
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          title={isJpTheme ? "Switch to Legacy theme" : "Switch to J·P theme"}
          aria-label={isJpTheme ? "Switch to Legacy theme" : "Switch to J·P theme"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] transition-all duration-150 focus-ring select-none",
            isJpTheme
              ? // J-P active: gradient border + gradient text
                "border border-transparent [background:linear-gradient(var(--ai-role-surface-muted),var(--ai-role-surface-muted))_padding-box,var(--gradient-mini)_border-box]"
              : // Legacy active: subtle neutral pill
                "border border-[color:var(--ai-role-border-subtle)] text-[color:var(--ai-text-muted)]",
          )}
        >
          {isJpTheme ? (
            // Gradient text for "J·P" label when theme is active
            <span
              style={{
                background: "var(--gradient-mini)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              J·P
            </span>
          ) : (
            <span>Legacy</span>
          )}
          {/* Swap icon */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={
              isJpTheme
                ? {
                    stroke: "var(--brand-blue)",
                  }
                : { stroke: "currentColor", opacity: 0.5 }
            }
          >
            <path
              d="M2 5h10M9 2l3 3-3 3M14 11H4M7 8l-3 3 3 3"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {isLoading && (
        <span className="flex items-center">
          <span className="sr-only">Loading route</span>
          <span className="h-4 w-4 rounded-full border-2 border-[color:var(--ai-role-border-subtle)] border-t-[color:var(--ai-text-strong)] animate-spin" />
        </span>
      )}
    </nav>
  );
}
