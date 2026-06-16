/**
 * Landing page copy — single source of truth.
 *
 * Sources (jackhpark-product-management-wiki):
 *   - wiki/frameworks/pm-meta-framework.md      → chain
 *   - wiki/philosophy/ai-security-pm-principles.md → pillars
 *   - wiki/frameworks/scope-discipline.md       → scopeDiscipline
 *   - wiki/persona/pm-persona.md                → selectedWork, trajectory
 *
 * METRIC SCOPE LABELS (pm-persona.md "Metric Calibration"):
 * Every number below carries its scope. Internal `b2b-solution-service`
 * figures are owner-approved for publication (confirmed 2026-06-12).
 */

export interface CountUpStat {
  /** Numeric target for the GSAP count-up tween. */
  value: number;
  /** Rendered before the number, e.g. "$". */
  prefix?: string;
  /** Rendered after the number, e.g. "M", "B+", "+". */
  suffix?: string;
  label: string;
  /** Metric calibration scope from pm-persona.md. Not rendered. */
  scope:
    | "knox-overall"
    | "b2b-solution-service"
    | "knox-suite"
    | "personal-impact";
}

export interface WorkCard {
  index: string;
  title: string;
  role: string;
  description: string;
  stats: readonly CountUpStat[];
  href: string;
}

// The Notion studio home currently lives at the root; flip this to "/work"
// when the deferred root swap lands (docs/ui/landing-storyboard.md §7).
const studioHref = "/";

export const hero = {
  eyebrow: "JACK H. PARK · PRINCIPAL PRODUCT LEADER",
  // Verbatim headline — do not edit without owner sign-off.
  headline: "Structure before execution.",
  subheadline:
    "Philosophy before frameworks, durable concepts before feature lists, and the discipline of choosing what not to build.",
  /** Phrase inside subheadline that receives emphasis styling. */
  subheadlineEmphasis: "what not to build",
  positioning:
    "I build enterprise security platforms from 0 to 1 — and the discipline to refuse what doesn’t belong.",
  primaryCta: { label: "Enter the studio", href: studioHref },
  secondaryCta: { label: "Ask JackGPT about my work", href: "/chat" },
} as const;

// Source: pm-meta-framework.md — "The Chain". One line per layer.
export const chain = {
  title: "The Chain",
  intro:
    "Four layers, run in order. Skip one and the next still exists — but without the grounding that makes it reliable.",
  nodes: [
    {
      name: "Philosophy",
      line: "Why the product exists — the highest-order decision criterion.",
    },
    {
      name: "Principles",
      line: "Repeatable decision logic derived from philosophy.",
    },
    {
      name: "Conceptual Models",
      line: "Durable abstractions that make individual feature decisions predictable.",
    },
    {
      name: "Execution",
      line: "Stage-based workflow that operationalizes the layers above.",
    },
  ],
  outro: "Each layer is load-bearing.",
} as const;

// Source: ai-security-pm-principles.md — one killer heuristic per pillar.
export const pillars = {
  title: "Operating Philosophy",
  intro:
    "Enterprise AI security is a negotiation among trust, speed, and scale. Four pillars keep the negotiation honest.",
  items: [
    {
      name: "Trust & Human-Centric Design",
      heuristic: "Explainability before accuracy.",
      detail:
        "Enterprises adopt AI security tools in proportion to how much they trust them — not how accurate they are. Ship the explanation before the accuracy improvement.",
    },
    {
      name: "Enterprise Rigor & Scale",
      heuristic: "Day 2 is the real launch.",
      detail:
        "The critical product phase begins after the contract is signed. Drift detection and silent operator reliability decide the renewal — not the demo.",
    },
    {
      name: "Security & Risk Management",
      heuristic: "Adversarial thinking by default.",
      detail:
        "Before shipping a feature, ask: how would I exploit my own AI to leak data? Guardrails are what let the enterprise accelerate without risk exposure.",
    },
    {
      name: "Strategic PM Mindset",
      heuristic: "Translate risk into value.",
      detail:
        "Speak the language of the CISO, the CFO, and the developer at once. Roadmaps that speak in outcomes earn executive trust faster than roadmaps that speak in features.",
    },
  ],
} as const;

// Source: scope-discipline.md — core principle + the Four Costs of Scope Creep.
export const scopeDiscipline = {
  title: "The Discipline of No",
  statement:
    "The hardest part of enterprise product management is not deciding what to build — it is the discipline to refuse what does not belong.",
  /** Word that receives the Mini-gradient hover underline. */
  emphasisWord: "No",
  costsTitle: "The four costs of scope creep",
  costs: [
    {
      name: "Identity dilution",
      mechanism:
        "The product stops being the best at one thing and becomes average at many.",
    },
    {
      name: "Wrong competitive set",
      mechanism:
        "New features drag you into markets where you have no advantage.",
    },
    {
      name: "Execution fragmentation",
      mechanism: "Team focus splits; quality degrades across both domains.",
    },
    {
      name: "Workflow mismatch",
      mechanism: "Features built for one persona create confusion for another.",
    },
  ],
  closing:
    "Saying no does not mean the need is invalid. It means this product is not the right solution for it — and pointing to the one that is.",
} as const;

export const selectedWork = {
  title: "Selected Work",
  intro:
    "Three chapters of enterprise product leadership — zero-to-one, portfolio scale, and personal craft.",
  cards: [
    {
      index: "01",
      title: "Samsung Knox Enterprise Security — AI & Zero Trust",
      role: "Director, Strategic Product Management · Samsung Research America, 2024–present",
      description:
        "Directing Samsung Knox’s enterprise security portfolio — Zero Trust architecture, on-device AI governance, and FedRAMP readiness — across engineering, business, and regulatory domains.",
      stats: [
        // Resume (latest): "150M+ Galaxy device users" under Zero Trust coverage (knox-overall).
        {
          value: 150,
          suffix: "M+",
          label: "Galaxy devices under Samsung Knox platform coverage",
          scope: "knox-overall",
        },
        // Resume (latest): "15% increase in Knox solution MAU" (personal-impact).
        {
          value: 15,
          suffix: "%",
          label: "Knox solution MAU increase",
          scope: "personal-impact",
        },
      ],
      href: studioHref,
    },
    {
      index: "02",
      title: "Samsung Knox Suite",
      role: "Global Lead Product Manager · Samsung MX, 2018–2024",
      description:
        "Took Samsung’s enterprise mobility SaaS bundle from 0 to 1 across 30+ markets — EMM/UEM on a platform that secures over two billion devices worldwide.",
      stats: [
        // b2b-solution-service internal KPI slide, 2018→2025 (owner-approved).
        {
          value: 200,
          prefix: "$",
          suffix: "M+",
          label: "enterprise SaaS & services ARR",
          scope: "b2b-solution-service",
        },
        // 2025 annual figure; Knox enterprise SaaS contribution to B2B device sales.
        {
          value: 11.5,
          suffix: "M",
          label: "annual enterprise device sales",
          scope: "b2b-solution-service",
        },
        // 2025 figure (owner-approved).
        {
          value: 55,
          suffix: "K",
          label: "business customers",
          scope: "knox-suite",
        },
        {
          value: 30,
          suffix: "+",
          label: "markets launched",
          scope: "knox-suite",
        },
      ],
      href: studioHref,
    },
    {
      index: "03",
      title: "PM Intelligence System",
      role: "Independent project · 2024–present",
      description:
        "A production-grade AI operating system for PM workflow — multi-agent orchestration, RAG-based knowledge retrieval, and human-in-the-loop decision gates. The proof is the site itself.",
      stats: [
        // The lone "1" is the point: one person owning the full stack end-to-end.
        {
          value: 1,
          suffix: "",
          label:
            "person, end-to-end — product, architecture, design, engineering, and operations",
          scope: "personal-impact",
        },
      ],
      href: "/chat",
    },
  ],
} as const satisfies {
  title: string;
  intro: string;
  cards: readonly WorkCard[];
};

// Source: pm-persona.md — career arc + education.
export const trajectory = {
  title: "Trajectory",
  intro: "Architect first, product leader second — in that order, on purpose.",
  milestones: [
    {
      period: "2008–2011",
      org: "POSCO DX",
      role: "Software Architect, Platform R&D Center",
    },
    {
      period: "2011–2014",
      org: "Samsung Mobile eXperience (MX)",
      role: "Software Architect & Technical Partnership, Samsung Smart School",
    },
    {
      period: "2014–2018",
      org: "Samsung Mobile eXperience (MX)",
      role: "Product Strategy & Technical GTM Manager, Device Software Customization",
    },
    {
      period: "2018–2024",
      org: "Samsung Mobile eXperience (MX)",
      role: "Global Lead Product Manager, Enterprise Mobility Platform & SaaS",
    },
    {
      period: "2024–present",
      org: "Samsung Research America",
      role: "Director, Strategic Product Management, Enterprise Mobile & AI Security",
    },
  ],
  education: [
    {
      school: "Carnegie Mellon University",
      degree: "MSIT, Software Engineering",
    },
    {
      school: "Korea Advanced Institute of Science and Technology (KAIST)",
      degree: "MS, Software Technology",
    },
  ],
} as const;

export const closing = {
  headline: "Let’s build something with structure.",
  // The page's single Full-gradient interaction (brand rule: at most once per surface).
  cta: { label: "Enter the studio", href: studioHref },
  footer: {
    wordmark: "Jack H. Park",
    studioTag: "STUDIO",
  },
} as const;
