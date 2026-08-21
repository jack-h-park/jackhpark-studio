import { FiMessageSquare } from "@react-icons/all-files/fi/FiMessageSquare";
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";

import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { IngestionSubNav } from "@/components/admin/navigation/IngestionSubNav";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import styles from "./interview-bank.module.css";

const PAGE_TAB_TITLE = "Admin · Ingestion · Interview Q&A Bank — Jack H. Park";

type PreviewEntry = {
  slug: string;
  question: string | null;
  status: string | null;
  optedIn: boolean;
  eligible: boolean;
  reason: string | null;
  text: string | null;
  characters: number | null;
};

type Preview = { total: number; eligible: number; entries: PreviewEntry[] };

// Phrased as what to do about it, not as an error code.
const REASON_LABEL: Record<string, string> = {
  "status-not-review-complete": "status is not reviewed / delivery_ready",
  "not-opted-in": "no publish_to_jackgpt: true",
  "no-question": "frontmatter has no question",
  "no-answer-sections": "no ## Short Version or ## Answer Draft",
};

export default function InterviewBankPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/interview-bank-preview");
      const payload = (await response.json()) as
        | ({ ok: true } & Preview)
        | { ok: false; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "preview failed");
      setPreview(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Head>
        <title>{PAGE_TAB_TITLE}</title>
      </Head>
      <AdminPageShell
        section="ingestion"
        header={{
          icon: <FiMessageSquare aria-hidden />,
          overline: "Ingestion",
          title: "Interview Q&A Bank",
          description:
            "What the next ingest would publish to JackGPT, before it publishes it.",
          actions: (
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Reading…" : "Refresh"}
            </Button>
          ),
        }}
        headerExtension={<IngestionSubNav />}
      >
        <CardHeader>
          <CardTitle>Publication gate</CardTitle>
          <CardDescription>
            A card is published only when its status is <code>reviewed</code> or{" "}
            <code>delivery_ready</code> <strong>and</strong> its frontmatter carries{" "}
            <code>publish_to_jackgpt: true</code>. Only{" "}
            <code>## Short Version</code> and <code>## Answer Draft</code> are
            embedded — <code>## Evidence Notes</code>, <code>## Gaps</code>,{" "}
            <code>## Improvement Notes</code> and anything added later stay
            private.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className={styles.error}>
              Could not read the bank: {error}
              <br />
              The usual cause is a missing or expired{" "}
              <code>INTERVIEW_BANK_GITHUB_TOKEN</code>.
            </p>
          ) : null}

          {preview ? (
            <>
              <p className={styles.summary}>
                <strong>{preview.eligible}</strong> of {preview.total} card(s)
                would be published.
              </p>

              <ul className={styles.list}>
                {preview.entries.map((entry) => {
                  const isOpen = expanded === entry.slug;
                  return (
                    <li
                      key={entry.slug}
                      className={
                        entry.eligible ? styles.eligible : styles.excluded
                      }
                    >
                      <div className={styles.row}>
                        <span className={styles.badge}>
                          {entry.eligible ? "publishes" : "held back"}
                        </span>
                        <span className={styles.question}>
                          {entry.question ?? entry.slug}
                        </span>
                        <span className={styles.meta}>
                          {entry.status ?? "no status"}
                          {entry.eligible && entry.characters
                            ? ` · ${entry.characters} chars`
                            : entry.reason
                              ? ` · ${REASON_LABEL[entry.reason] ?? entry.reason}`
                              : ""}
                        </span>
                        {entry.eligible ? (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setExpanded(isOpen ? null : entry.slug)
                            }
                          >
                            {isOpen ? "Hide text" : "Show exact text"}
                          </Button>
                        ) : null}
                      </div>
                      {isOpen && entry.text ? (
                        // Verbatim, not rendered: the point is to read what is embedded,
                        // and markdown rendering would hide whitespace and stray headings.
                        <pre className={styles.text}>{entry.text}</pre>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </CardContent>
      </AdminPageShell>
    </>
  );
}
