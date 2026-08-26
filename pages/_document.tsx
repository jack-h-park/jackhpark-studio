import { IconContext } from "@react-icons/all-files";
import Document, { Head, Html, Main, NextScript } from "next/document";

import { name } from "@/lib/config";
import { THEME_NOFLASH_SCRIPT } from "@/lib/theme";

export default class MyDocument extends Document {
  override render() {
    return (
      <IconContext.Provider value={{ style: { verticalAlign: "middle" } }}>
        <Html lang="en">
          <Head>
            <meta name="application-name" content={name} />
            <meta name="apple-mobile-web-app-title" content={name} />
            <meta name="msapplication-TileColor" content="#000000" />
            <meta name="theme-color" content="#000000" />
            <link rel="shortcut icon" href="/favicon.ico" />
            <link
              rel="icon"
              type="image/png"
              sizes="32x32"
              href="/favicon-32x32.png"
            />
            <link
              rel="icon"
              type="image/png"
              sizes="16x16"
              href="/favicon-16x16.png"
            />
            <link
              rel="apple-touch-icon"
              sizes="180x180"
              href="/apple-touch-icon.png"
            />

            <link rel="manifest" href="/manifest.json" />

            {process.env.NEXT_PUBLIC_GA_ID && (
              <>
                {/* gtag.js is loaded from _app on the first user interaction.
                    Evaluating it here cost ~150ms of script evaluation plus a
                    ~110ms timer callback inside the hydration window. The
                    dataLayer shim below stays inline and is cheap, so queued
                    hits (including the initial pageview) are not lost. */}
                <script
                  dangerouslySetInnerHTML={{
                    __html: `
                      window.dataLayer = window.dataLayer || [];
                      function gtag(){dataLayer.push(arguments);}
                      gtag('js', new Date());
                      gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                        page_path: window.location.pathname,
                      });
                    `,
                  }}
                />
              </>
            )}
          </Head>

          <body>
            {/* react-notion-x가 찾는 포탈 루트 (항상 존재하도록 서버에서 미리 추가) */}
            <div className="notion-frame" style={{ display: "none" }} />

            <script
              dangerouslySetInnerHTML={{ __html: THEME_NOFLASH_SCRIPT }}
            />
            <Main />

            <NextScript />
          </body>
        </Html>
      </IconContext.Provider>
    );
  }
}
