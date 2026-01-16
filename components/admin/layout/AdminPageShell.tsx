"use client";

import type { ReactNode } from "react";

import { AdminTopNav } from "@/components/admin/navigation/AdminTopNav";
import { PageHeaderCard } from "@/components/ui/page-header-card";
import { cn } from "@/lib/utils";

import styles from "./admin-ingestion-shell.module.css";

export type AdminPageShellProps = {
  section: "chat" | "ingestion";
  header: {
    icon?: ReactNode;
    overline: string;
    title: string;
    description?: string;
    meta?: ReactNode;
    actions?: ReactNode;
  };
  children: ReactNode;
};

export function AdminPageShell({
  section,
  header,
  children,
}: AdminPageShellProps) {
  return (
    <div
      className={cn(
        "ai-container space-y-6 pb-12",
        section === "ingestion" ? styles.adminIngestionScope : undefined,
      )}
    >
      <section>
        <div className="flex flex-col gap-3">
          <div className="pb-1 pt-4">
            <AdminTopNav
              activeSection={section}
              className="w-full bg-[color:var(--ai-bg-subtle)]/80"
            />
          </div>
          <div className="pb-4">
            <PageHeaderCard
              variant="default"
              icon={header.icon}
              overline={header.overline}
              title={header.title}
              description={header.description}
              meta={header.meta}
              actions={header.actions}
            />
          </div>
        </div>
      </section>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
