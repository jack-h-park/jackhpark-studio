import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";
import Link from "next/link";

import { ChatConfigCardHeader } from "@/components/admin/chat-config/ChatConfigHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function RagMetadataInfoCard() {
  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiBookOpen aria-hidden="true" />}
        title="RAG Document Metadata"
        description="Review and adjust document-level metadata used during RAG retrieval (doc_type, persona_type, visibility, tags). Use the dedicated manager for fine-grained edits."
      />

      <CardContent className="space-y-4 px-5 py-4">
        <div className="space-y-1 max-w-xl">
          <p className="ai-meta-text">
            Metadata such as <code>doc_type</code>, <code>persona_type</code>,{" "}
            <code>is_public</code>, and <code>tags</code> is applied per
            document and used by the retrieval layer for filtering and ranking.
          </p>
          <p className="ai-meta-text">
            To perform document-level edits, open the RAG Documents manager
            below. Changes will be picked up automatically on the next ingestion
            or metadata-only refresh.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Button variant="outline" type="button">
            <Link href="/admin/documents">Open RAG Documents Manager</Link>
          </Button>
          <p className="ai-meta-text text-xs">
            Tip: use this when you want to reclassify a page (e.g. profile vs
            project article) or adjust visibility without changing content.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
