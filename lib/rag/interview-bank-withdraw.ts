import type { WithheldInterviewCard } from "./sources/interview-bank";

/**
 * Take an already-published interview card out of retrieval because it names an unannounced
 * product.
 *
 * The other exclusions — a card demoted or opted out — are left to the source-scoped sweep,
 * which marks the document `missing`. That is not enough here: `missing` changes what
 * JackGPT retrieves only under the v2 match RPCs (RAG_MATCH_RPC_VERSION), and under v1 the
 * chunks keep answering. A confidential name has to stop being retrievable whichever
 * generation is deployed, so the chunks are deleted and the document is then marked.
 *
 * Deletion covers the embedding space this run writes. A card indexed under a second space
 * would need a run on that space too; the scheduled ingest uses one.
 *
 * The database calls are injected so the decision can be tested without one.
 */
export type WithdrawDeps = {
  /** Is there a document row for this id — has an earlier run published it? */
  hasDocument: (docId: string) => Promise<boolean>;
  /** Delete every chunk of the document in the run's embedding space. */
  deleteChunks: (docId: string) => Promise<void>;
  /** Mark the document no longer active, with the reason. */
  markWithdrawn: (docId: string, reason: string) => Promise<void>;
};

export type WithdrawOutcome = {
  slug: string;
  docId: string;
  /** True when an earlier run had published it and this one took it out. */
  withdrawn: boolean;
  error: string | null;
};

export const WITHHELD_REASON =
  "withheld: the card's published text names an unannounced product";

export async function withdrawWithheldCards(
  withheld: readonly WithheldInterviewCard[],
  docIdFor: (slug: string) => string,
  deps: WithdrawDeps,
): Promise<WithdrawOutcome[]> {
  const outcomes: WithdrawOutcome[] = [];
  for (const card of withheld) {
    const docId = docIdFor(card.slug);
    try {
      if (!(await deps.hasDocument(docId))) {
        outcomes.push({
          slug: card.slug,
          docId,
          withdrawn: false,
          error: null,
        });
        continue;
      }
      // Chunks first: if the mark then fails, nothing is retrievable either way, and the
      // next run finds the row still active and tries again.
      await deps.deleteChunks(docId);
      await deps.markWithdrawn(docId, WITHHELD_REASON);
      outcomes.push({ slug: card.slug, docId, withdrawn: true, error: null });
    } catch (err) {
      outcomes.push({
        slug: card.slug,
        docId,
        withdrawn: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}
