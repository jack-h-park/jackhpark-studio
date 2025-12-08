"use client";

import type { ReactNode } from "react";

import { AdminTopNav } from "@/components/admin/navigation/AdminTopNav";
import { PageHeaderCard } from "@/components/ui/page-header-card";

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
  subNav?: ReactNode;
  children: ReactNode;
};

export function AdminPageShell({
  section,
  header,
  subNav,
  children,
}: AdminPageShellProps) {
  return (
    <div className="ai-container space-y-6 pb-12">
      <section className="rounded-[var(--ai-radius-md)] border border-[color:var(--ai-border-muted)] bg-[color:var(--ai-surface)] shadow-[var(--ai-shadow-soft)]">
        <div className="flex flex-col gap-4">
          <div className="px-4 pb-1 pt-4 sm:px-6">
            <AdminTopNav activeSection={section} className="w-full" />
          </div>
          <div className="px-4 pb-4 sm:px-6">
            <PageHeaderCard
              className="shadow-none border-0 bg-transparent p-0"
              headerClassName="p-0"
              icon={header.icon}
              overline={header.overline}
              title={header.title}
              description={header.description}
              meta={header.meta}
              actions={header.actions}
            />
            {subNav ? <div className="mt-2">{subNav}</div> : null}
          </div>
        </div>
      </section>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
