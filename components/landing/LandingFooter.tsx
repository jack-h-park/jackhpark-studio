import type { JSX } from "react";
import Link from "next/link";

import { closing } from "@/content/landing";
import * as config from "@/lib/config";

import styles from "./landing.module.css";

type SocialName = "linkedin" | "github" | "instagram" | "youtube";

// Outline icons, 1.5px stroke, matching the pillar icon treatment.
function SocialIcon({ name }: { name: SocialName }) {
  const paths: Record<SocialName, JSX.Element> = {
    linkedin: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 11v5M8 8v.01M12 16v-5M16 16v-3a2 2 0 0 0-4 0" />
      </>
    ),
    github: (
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    ),
    instagram: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3" />
        <path d="M16.5 7.5v.01" />
      </>
    ),
    youtube: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="4" />
        <path d="m10 9 5 3-5 3z" />
      </>
    ),
  };

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function socialLinks(): Array<{ name: SocialName; href: string }> {
  const links: Array<{ name: SocialName; href: string }> = [];
  if (config.linkedin) {
    links.push({
      name: "linkedin",
      href: `https://www.linkedin.com/in/${config.linkedin}`,
    });
  }
  if (config.github) {
    links.push({ name: "github", href: `https://github.com/${config.github}` });
  }
  if (config.instagram) {
    links.push({
      name: "instagram",
      href: `https://www.instagram.com/${config.instagram}`,
    });
  }
  if (config.youtube) {
    links.push({
      name: "youtube",
      href: `https://www.youtube.com/${config.youtube}`,
    });
  }
  return links;
}

export function LandingFooter() {
  return (
    <>
      <section
        className={styles.closing}
        aria-labelledby="closing-title"
        id="contact"
      >
        <h2
          id="closing-title"
          className={styles.closingHeadline}
          data-anim="closing-headline"
        >
          {closing.headline}
        </h2>
        {/* The page's single Full-gradient interaction. */}
        <Link
          href={closing.cta.href}
          className={styles.buttonPrimary}
          data-anim="closing-cta"
        >
          {closing.cta.label}
        </Link>
      </section>
      <footer className={styles.footer}>
        <div className={styles.wordmark}>
          <span className={styles.wordmarkName}>{closing.footer.wordmark}</span>
          <span className={styles.studioTag}>{closing.footer.studioTag}</span>
        </div>
        <div className={styles.socials}>
          {socialLinks().map((link) => (
            <a
              key={link.name}
              href={link.href}
              className={styles.socialLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.name}
            >
              <SocialIcon name={link.name} />
            </a>
          ))}
        </div>
      </footer>
    </>
  );
}
