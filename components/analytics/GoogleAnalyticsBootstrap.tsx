export function GoogleAnalyticsBootstrap({
  trackingId = process.env.NEXT_PUBLIC_GA_ID,
}: {
  trackingId?: string;
}) {
  if (!trackingId) return null;
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', ${JSON.stringify(trackingId).replaceAll("<", "\\u003c")}, {
        page_path: window.location.pathname,
      });
    `,
      }}
    />
  );
}
