import type { PageProps } from "@/lib/types";
import { NotionPage } from "@/components/NotionPage";
import { createStudioStaticProps } from "@/lib/server/studio-static-props";

// The Notion studio home. It used to live at `/`; the landing page now owns
// `/`, so the root Notion page is served here (see lib/map-page-url.ts, which
// maps rootNotionPageId → /studio for canonical URLs and internal links).
export const getStaticProps = createStudioStaticProps();

export default function NotionDomainPage(props: PageProps) {
  return <NotionPage {...props} />;
}
