import { type FormEvent, type JSX, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import {
  type RefreshStatus,
  usePublicSiteRefresh,
} from "@/hooks/usePublicSiteRefresh";

const statusVariantMap: Record<RefreshStatus, StatusPillVariant> = {
  idle: "muted",
  refreshing: "info",
  success: "success",
  error: "error",
};

const statusLabelMap: Record<RefreshStatus, string> = {
  idle: "Ready",
  refreshing: "Refreshing",
  success: "Refreshed",
  error: "Error",
};

export function PublicSiteRefreshPanel(): JSX.Element {
  const refresh = usePublicSiteRefresh();
  const isPathEmpty = useMemo(
    () => refresh.path.trim().length === 0,
    [refresh.path],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void refresh.refresh();
  };

  return (
    <section className="ai-card space-y-4">
      <CardHeader className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-2">
          <CardTitle>Public site refresh</CardTitle>
          <CardDescription>
            After editing Notion, enter /studio or another canonical public URL
            path to refresh one page.
          </CardDescription>
        </div>
        <StatusPill variant={statusVariantMap[refresh.status]}>
          {statusLabelMap[refresh.status]}
        </StatusPill>
      </CardHeader>

      <form className="space-y-4 px-5 pb-5" onSubmit={handleSubmit}>
        <div className="ai-field">
          <Label htmlFor="public-site-refresh-path" className="ai-field__label">
            Public path
          </Label>
          <Input
            id="public-site-refresh-path"
            value={refresh.path}
            onChange={(event) => refresh.setPath(event.target.value)}
            placeholder="/studio"
            disabled={refresh.isRefreshing}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="submit"
            loading={refresh.isRefreshing}
            disabled={isPathEmpty || refresh.isRefreshing}
          >
            Refresh this page
          </Button>
          <p aria-live="polite" className="ai-meta-text" role="status">
            {refresh.message}
          </p>
        </div>
      </form>
    </section>
  );
}
