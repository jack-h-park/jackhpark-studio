"use client";

import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { AdminTopNav } from "@/components/admin/navigation/AdminTopNav";
import { PageHeaderCard } from "@/components/ui/page-header-card";
import { useAdminTheme } from "@/hooks/use-admin-theme";
import { cn } from "@/lib/utils";

import styles from "./admin-ingestion-shell.module.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export type AdminPageShellProps = {
  section: "chat" | "ingestion";
  header: {
    icon?: ReactNode;
    overline: string;
    title: string;
    description?: string;
    meta?: ReactNode;
    actions?: ReactNode;
    cardClassName?: string;
    headerClassName?: string;
    contentClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
  };
  headerExtension?: ReactNode;
  children: ReactNode;
};

export function AdminPageShell({
  section,
  header,
  headerExtension,
  children,
}: AdminPageShellProps) {
  const { isJpTheme, toggleTheme, mounted } = useAdminTheme();

  return (
    <div
      // Only attach data-theme after mount to avoid hydration mismatch.
      // During SSR / first render the default (jp) styles are applied via CSS fallback.
      data-theme={mounted ? (isJpTheme ? "jp" : undefined) : "jp"}
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "ai-container space-y-6 pb-12",
        section === "ingestion" ? styles.adminIngestionScope : undefined,
      )}
    >
      <section>
        <div className="flex flex-col gap-3">
          <div className="pb-1 pt-4">
            <AdminTopNav
              activeSection={section}
              isJpTheme={isJpTheme}
              onToggleTheme={toggleTheme}
              className="w-full bg-[color:var(--ai-role-surface-muted)]/80"
            />
          </div>
          <div className={headerExtension ? "pb-2" : "pb-4"}>
            <PageHeaderCard
              variant="default"
              icon={header.icon}
              overline={header.overline}
              title={header.title}
              description={header.description}
              meta={header.meta}
              actions={header.actions}
              className={header.cardClassName}
              headerClassName={header.headerClassName}
              contentClassName={header.contentClassName}
              titleClassName={header.titleClassName}
              descriptionClassName={header.descriptionClassName}
            />
          </div>
          {headerExtension && (
            <div className="pb-4 px-1">{headerExtension}</div>
          )}
        </div>
      </section>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
