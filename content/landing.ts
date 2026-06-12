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
      mechanism:
        "Features built for one persona create confusion for another.",
    },
  ],
  closing:
    "Saying no does not mean the need is invalid. It means this product is not the right solution for it — and pointing to the one that is.",
} as const;

export const selectedWork = {
  title: "Selected Work",
  intro: "Three platforms, each taken from zero to one.",
  cards: [
    {
      index: "01",
      title: "Knox Suite",
      role: "Lead Product Manager · Samsung MX, 2018–2024",
      description:
        "Took Samsung’s enterprise mobility SaaS bundle from 0 to 1 across 30+ markets — EMM/UEM on a platform that secures over two billion devices worldwide.",
      stats: [
        // b2b-solution-service internal KPI slide, 2018→2025 (owner-approved).
        {
          value: 227,
          prefix: "$",
          suffix: "M",
          label: "B2B revenue, from $42M",
          scope: "b2b-solution-service",
        },
        {
          value: 11.5,
          suffix: "M",
          label: "B2B device sales, from 2.1M",
          scope: "b2b-solution-service",
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
      index: "02",
      title: "Knox Customization SDK & Configure",
      role: "Solution Sales Engineering Manager · Samsung MX, 2014–2018",
      description:
        "Developer-facing 0 to 1: the SDK and cloud service that let partners turn Samsung devices into purpose-built appliances — with pre-sales enablement across EMEA and Korea.",
      stats: [
        // pm-persona.md Domain Expertise: "0→1 + $2B sales growth".
        {
          value: 2,
          prefix: "$",
          suffix: "B",
          label: "device sales growth enabled",
          scope: "personal-impact",
        },
        {
          value: 2,
          suffix: "",
          label: "products taken 0→1",
          scope: "personal-impact",
        },
      ],
      href: studioHref,
    },
    {
      index: "03",
      title: "Personal AI Assistant & RAG Backbone",
      role: "Design, engineering, and operations · 2025–present",
      description:
        "The platform serving this page: a production RAG pipeline over my own knowledge base — ingestion, retrieval, evaluation, and full LLM observability. The proof is the site itself.",
      stats: [
        {
          value: 1,
          suffix: "",
          label: "person: PM, architect, and engineer",
          scope: "personal-impact",
        },
      ],
      href: "/chat",
    },
  ],
} as const satisfies { title: string; intro: string; cards: readonly WorkCard[] };

// Source: pm-persona.md — career arc + education.
export const trajectory = {
  title: "Trajectory",
  intro: "Architect first, product leader second — in that order, on purpose.",
  milestones: [
    {
      period: "2008–2011",
      org: "POSCO DX",
      role: "Associate Software Architect, Robotics Software",
    },
    {
      period: "2012–2014",
      org: "Samsung MX",
      role: "Software Architect & Technical Partnership, Samsung Smart School",
    },
    {
      period: "2014–2018",
      org: "Samsung MX",
      role: "Solution Sales Engineering Manager, Knox Customization",
    },
    {
      period: "2018–2024",
      org: "Samsung MX",
      role: "Lead Product Manager, Knox Suite (Enterprise Mobility SaaS)",
    },
    {
      period: "2024–present",
      org: "Samsung Research America",
      role: "Strategic Product Manager, Enterprise Mobile Security",
    },
  ],
  education: [
    { school: "Carnegie Mellon University", degree: "MSIT, Software Engineering" },
    { school: "KAIST", degree: "MS, Software Technology" },
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
