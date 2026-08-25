import type { GetServerSideProps } from "next";
import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";
import { FiMessageSquare } from "@react-icons/all-files/fi/FiMessageSquare";
import Head from "next/head";
import { type JSX, useMemo, useState } from "react";

import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { IngestionSubNav } from "@/components/admin/navigation/IngestionSubNav";
import { AiPageChrome } from "@/components/AiPageChrome";
import { InlineAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardStatTile } from "@/components/ui/dashboard-stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import {
  type InterviewBankPreviewEntry,
  previewInterviewBank,
} from "@/lib/rag/sources/interview-bank";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Interview Q&A Bank";
const PAGE_TAB_TITLE = "Admin · Ingestion · Interview Q&A Bank — Jack H. Park";

// Phrased as what to do about it, not as an error code.
const REASON_LABEL: Record<string, string> = {
  "status-not-review-complete": "Not review-complete",
  "not-opted-in": "Not opted in",
  "no-question": "No question in frontmatter",
  "no-answer-sections": "No answer sections",
};

const REASON_HINT: Record<string, string> = {
  "status-not-review-complete":
    "Drill it up to reviewed before it can be published.",
  "not-opted-in": "Add publish_to_jackgpt: true to publish it.",
  "no-question": "Add a question: field.",
  "no-answer-sections": "Add a ## Short Version or ## Answer Draft.",
};

type PageProps = {
  entries: InterviewBankPreviewEntry[];
  total: number;
  eligible: number;
  error: string | null;
  headerRecordMap: Awaited<
    ReturnType<typeof loadNotionNavigationHeader>
  >["headerRecordMap"];
  headerBlockId: Awaited<
    ReturnType<typeof loadNotionNavigationHeader>
  >["headerBlockId"];
};

export default function InterviewBankPage({
  entries,
  total,
  eligible,
  error,
  headerRecordMap,
  headerBlockId,
}: PageProps): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);

  const heldBack = total - eligible;
  const byReason = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.eligible || !entry.reason) continue;
      counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
    }
    return [...counts.entries()].toSorted((a, b) => b[1] - a[1]);
  }, [entries]);

  const columns = useMemo<DataTableColumn<InterviewBankPreviewEntry>[]>(
    () => [
      {
        header: "Published",
        align: "left",
        width: "112px",
        render: (entry) =>
          entry.eligible ? (
            <StatusPill variant="success">Yes</StatusPill>
          ) : (
            <StatusPill variant="muted">No</StatusPill>
          ),
      },
      {
        header: "Question",
        render: (entry) => entry.question ?? entry.slug,
      },
      {
        header: "Status",
        align: "left",
        variant: "muted",
        width: "150px",
        render: (entry) => entry.status ?? "—",
      },
      {
        header: "Why not",
        align: "left",
        variant: "muted",
        width: "190px",
        render: (entry) =>
          entry.eligible
            ? "—"
            : (REASON_LABEL[entry.reason ?? ""] ?? entry.reason),
      },
      {
        // A plain count, so it takes the numeric treatment the other tables give numbers.
        header: "Chars",
        align: "right",
        variant: "numeric",
        width: "90px",
        render: (entry) => (entry.eligible ? entry.characters : "—"),
      },
      {
        // The expand affordance is an icon button on the right, as in the runs table —
        // text in this position reads as another data column and pulls away from its row.
        header: <span className="sr-only">Published text</span>,
        align: "right",
        width: "72px",
        render: (entry) => {
          if (!entry.eligible) return null;
          const isExpanded = expanded === entry.slug;
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(isExpanded ? null : entry.slug)}
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? "Hide the published text"
                  : "Show the published text"
              }
            >
              <FiChevronDown
                aria-hidden="true"
                className={cn(
                  "h-4 w-4 transition-transform duration-150",
                  isExpanded && "rotate-180",
                )}
              />
            </Button>
          );
        },
      },
    ],
    [expanded],
  );

  return (
    <>
      <Head>
        <title>{PAGE_TAB_TITLE}</title>
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
        bodyClassName="ai-body"
      >
        <AdminPageShell
          section="ingestion"
          header={{
            icon: <FiMessageSquare aria-hidden />,
            overline: "ADMIN · INGESTION",
            title: PAGE_TITLE,
            description:
              "What the next ingest would publish to JackGPT, before it publishes it.",
          }}
          headerExtension={<IngestionSubNav />}
        >
          {error ? (
            <InlineAlert severity="warning" title="Could not read the bank">
              {error}
              <br />
              The usual cause is a missing or expired{" "}
              <code>INTERVIEW_BANK_GITHUB_TOKEN</code>.
            </InlineAlert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <DashboardStatTile label="Questions" value={total} />
            <DashboardStatTile
              label="Published to JackGPT"
              value={eligible}
              valueTone={eligible > 0 ? "strong" : "muted"}
            />
            <DashboardStatTile label="Held back" value={heldBack} />
          </div>

          <CardHeader>
            <CardTitle>Publication gate</CardTitle>
            <CardDescription>
              A question is published only when its status is{" "}
              <code>reviewed</code> or <code>delivery_ready</code>{" "}
              <strong>and</strong> its frontmatter carries{" "}
              <code>publish_to_jackgpt: true</code>. Only{" "}
              <code>## Short Version</code> and <code>## Answer Draft</code> are
              embedded — <code>## Evidence Notes</code>, <code>## Gaps</code>,{" "}
              <code>## Improvement Notes</code> and anything added later stay
              private.
              {byReason.length > 0 ? (
                <>
                  {" "}
                  Held back:{" "}
                  {byReason
                    .map(
                      ([reason, count]) =>
                        `${count} ${REASON_HINT[reason] ? REASON_LABEL[reason]?.toLowerCase() : reason}`,
                    )
                    .join(", ")}
                  .
                </>
              ) : null}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <DataTable
              columns={columns}
              data={entries}
              rowKey={(entry) => entry.slug}
              emptyMessage="No questions found in the bank."
              renderRowDetails={(entry) =>
                expanded === entry.slug && entry.text ? (
                  // Verbatim, not rendered: the point is to read what is embedded, and
                  // markdown rendering would hide whitespace and stray headings.
                  <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {entry.text}
                  </pre>
                ) : null
              }
            />
          </CardContent>
        </AdminPageShell>
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  // Rendered on the server so the page arrives with its data. The bank is ~46 files fetched
  // from GitHub; doing that after paint left the table empty for seconds.
  const headerPromise = loadNotionNavigationHeader();

  let entries: InterviewBankPreviewEntry[] = [];
  let total = 0;
  let eligible = 0;
  let error: string | null = null;

  try {
    const preview = await previewInterviewBank();
    entries = preview.entries;
    total = preview.total;
    eligible = preview.eligible;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const { headerRecordMap, headerBlockId } = await headerPromise;

  return {
    props: { entries, total, eligible, error, headerRecordMap, headerBlockId },
  };
};
