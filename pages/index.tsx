import type { PageProps } from "@/lib/types";
import { NotionPage } from "@/components/NotionPage";
import { domain } from "@/lib/config";
import { logPagePropsSize } from "@/lib/diagnostics/measurePageProps";
import { resolveNotionPage } from "@/lib/resolve-notion-page";

export const getStaticProps = async () => {
  try {
    const props = await resolveNotionPage(domain);

    logPagePropsSize("/", props);

    return { props, revalidate: 10 };
  } catch (err) {
    console.error("page error", domain, err);

    // we don't want to publish the error version of this page, so
    // fall back to 404 to avoid failing the build on transient fetch errors
    return {
      notFound: true,
      revalidate: 10,
    };
  }
};

export default function NotionDomainPage(props: PageProps) {
  return <NotionPage {...props} />;
}
