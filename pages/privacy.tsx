import Head from "next/head";

import * as config from "@/lib/config";

import styles from "./privacy.module.css";

// A static page rather than a Notion page: the Google OAuth consent screen
// needs a stable, always-reachable URL, and a Notion-backed page would add a
// fetch dependency and let the text change without review. Next.js serves
// pages/privacy.tsx ahead of the [pageId] catch-all.
const EFFECTIVE_DATE = "November 10, 2026";
const LIMITED_USE_POLICY_URL =
  "https://developers.google.com/terms/api-services-user-data-policy";

export default function PrivacyPolicyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy | {config.name}</title>
        <meta
          name="description"
          content="Privacy policy for a personal home-camera app that connects to a Google Nest Doorbell."
        />
        <link rel="canonical" href={`${config.host}/privacy`} />
      </Head>
      <main className={styles.page}>
        <article className={styles.article}>
          <h1>Privacy Policy</h1>
          <p className={styles.meta}>Effective date: {EFFECTIVE_DATE}</p>

          <p>
            This policy covers a personal, non-commercial home-camera app
            (&quot;local-vision&quot;) built and run by {config.author}, an
            individual. The app is used only by the owner and their family. It
            is not offered to the public.
          </p>

          <h2>What the app accesses</h2>
          <p>
            Through Google&apos;s Smart Device Management (Nest Device Access)
            API, the app accesses the owner&apos;s own Nest Doorbell:
          </p>
          <ul>
            <li>
              event notifications (motion, person and doorbell press events)
            </li>
            <li>event clip previews</li>
            <li>the live stream</li>
          </ul>

          <h2>How it is used</h2>
          <p>
            This data is processed on the owner&apos;s own computers to detect
            and describe events and to notify the household. It is not sold, not
            shared with third parties, and not used for advertising or to train
            models. Data is kept for a limited time (currently 7 days) and then
            deleted.
          </p>

          <h2>Google API Services User Data Policy</h2>
          <p>
            The app&apos;s use and transfer of information received from Google
            APIs adheres to the{" "}
            <a href={LIMITED_USE_POLICY_URL} rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>

          <h2>Revoking access</h2>
          <p>
            You can revoke the app&apos;s access at any time in your Google
            Account under Security, in the third-party access section, or by
            removing the partner connection in the Google Home app.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy can be sent through{" "}
            <a
              href={`https://www.linkedin.com/in/${config.linkedin}`}
              rel="noopener noreferrer"
            >
              {config.author} on LinkedIn
            </a>
            .
          </p>
        </article>
      </main>
    </>
  );
}
