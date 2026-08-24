import Head from "next/head";
import { signIn } from "next-auth/react";

const PAGE_TITLE = "Admin Sign In";

export default function AdminSignInPage() {
  return (
    <>
      <Head>
        <title>{`${PAGE_TITLE} — Jack H. Park`}</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-[var(--ai-bg)] px-6 py-12">
        <section className="w-full max-w-md rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] p-8 shadow-ai">
          <p className="ai-label-overline ai-label-overline--small ai-label-overline--muted">
            ADMIN
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--ai-text)]">
            Sign in to the dashboard
          </h1>
          <p className="mt-3 text-sm text-[var(--ai-text-muted)]">
            Continue with the approved Google account to access administrator
            tools.
          </p>
          <button
            type="button"
            className="ai-button ai-button-primary mt-6 w-full"
            onClick={() => {
              void signIn("google", { callbackUrl: "/admin/ingestion" });
            }}
          >
            Continue with Google
          </button>
        </section>
      </main>
    </>
  );
}
