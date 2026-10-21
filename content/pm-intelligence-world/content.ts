import type { WorldContent } from "./types";

export const worldContent: WorldContent = {
  purpose:
    "Product knowledge is scattered across signals, projects and study. Jack’s personal AI system connects it for writing, PM questions, learning and decisions.",
  sections: [
    {
      id: "overview",
      navLabel: "Overview",
      eyebrow: "01 / THE WHOLE SYSTEM",
      title: "Product work has a longer memory.",
      summary:
        "A signal becomes useful when it can be traced, interpreted and connected to the work ahead. Explore how Jack records, reviews and reuses product knowledge.",
    },
    {
      id: "inputs",
      navLabel: "Inputs",
      eyebrow: "02 / THREE INPUTS",
      title: "Different work. A shared foundation.",
      summary:
        "External signals, hands-on experience and market-informed study contribute different kinds of evidence. Each can support more than one use.",
    },
    {
      id: "knowledge",
      navLabel: "Knowledge",
      eyebrow: "03 / RECORD · REVIEW · REUSE",
      title: "Keep the source. Keep the correction.",
      summary:
        "Knowledge combines external facts, direct experience and interpretation. Records remain available; deciding how to reuse them still takes judgment.",
    },
    {
      id: "writing",
      navLabel: "Viewpoints",
      eyebrow: "04 / STRATEGIC VIEWPOINTS",
      title: "From evidence to a point of view.",
      summary:
        "Source-backed notes give an argument a place to develop. Review and feedback can refine it; a draft is not a publication.",
    },
    {
      id: "questions",
      navLabel: "PM questions",
      eyebrow: "05 / PM QUESTIONS",
      title: "A viewpoint becomes an answer draft.",
      summary:
        "One observed connection links a strategy note to a PM interview question and a source-linked draft. The useful endpoint is inspectable reasoning.",
    },
    {
      id: "learning",
      navLabel: "Learning",
      eyebrow: "06 / LEARNING & NEW OPPORTUNITIES",
      title: "Demand informs what to study.",
      summary:
        "Requirements can inform a competency, a sourced study note and practice. Learning supports new challenges beyond a job change.",
    },
    {
      id: "decisions",
      navLabel: "Decisions",
      eyebrow: "OPTIONAL / PRODUCT DECISION",
      title: "A product decision starts with a question.",
      summary:
        "Knowledge can support writing, questions and learning on its own. When a product decision is needed, the system helps prepare evidence and alternatives for Jack to review.",
    },
    {
      id: "roles",
      navLabel: "People & agents",
      eyebrow: "07 / PREPARATION & RESPONSIBILITY",
      title: "Agents prepare. A person decides.",
      summary:
        "Agents prepare research, drafts, study material and evaluation context. The workflow engine coordinates execution; Jack supplies product context, reviews the evidence and owns the judgment.",
    },
    {
      id: "limits",
      navLabel: "Evidence",
      eyebrow: "08 / EVIDENCE & DIRECTION",
      title: "Show what is known. Leave room to learn.",
      summary:
        "The examples show how sources, drafts and practice records stay connected. Decision quality, time saved and learning gains still need separate evaluation.",
    },
  ],
  inputs: [
    {
      id: "external-signals",
      title: "External signals",
      description: "Source-backed insights from outside the work.",
    },
    {
      id: "hands-on-projects",
      title: "Hands-on projects",
      description: "Decisions, failures, corrections and project explanations.",
    },
    {
      id: "market-study",
      title: "Market sensing & study",
      description: "Requirements, learning priorities and sourced practice.",
    },
  ],
  uses: [
    {
      id: "strategic-viewpoints",
      title: "Strategic viewpoints",
      description: "Write, review and refine an argument.",
      section: "writing",
    },
    {
      id: "pm-questions",
      title: "PM questions",
      description: "Explain ideas with the reasoning still attached.",
      section: "questions",
    },
    {
      id: "new-opportunities",
      title: "New opportunities",
      description:
        "Prepare for unfamiliar challenges through study and practice.",
      section: "learning",
    },
    {
      id: "product-decisions",
      title: "Product decisions",
      description: "Frame a question, inspect evidence and retain a judgment.",
      section: "decisions",
    },
  ],
  relations: [
    {
      from: "external-signals",
      to: "strategic-viewpoints",
      status: "documented-purpose",
      explanation: "Source-backed observations can inform a viewpoint.",
    },
    {
      from: "external-signals",
      to: "product-decisions",
      status: "documented-purpose",
      explanation:
        "Selected insights may inform an explicitly requested product decision.",
    },
    {
      from: "hands-on-projects",
      to: "pm-questions",
      status: "documented-purpose",
      explanation:
        "Recorded experience remains available for later questions; retrieval quality is not measured here.",
    },
    {
      from: "hands-on-projects",
      to: "strategic-viewpoints",
      status: "documented-purpose",
      explanation:
        "Project corrections can inform how a product problem is explained.",
    },
    {
      from: "market-study",
      to: "new-opportunities",
      status: "documented-purpose",
      explanation:
        "Demand-informed study supports preparation for new challenges.",
    },
    {
      from: "market-study",
      to: "pm-questions",
      status: "documented-purpose",
      explanation:
        "Sourced knowledge can support an explanation beyond an interview.",
    },
  ],
  records: [
    {
      id: "strategy-note",
      title: "AI Quality Is Not Accuracy. It’s Trust Recovery.",
      observation:
        "The public introduction identifies a source-backed strategy note and its connection to an answer draft.",
      interpretation:
        "A product viewpoint can become material for a later PM question.",
      uncertainty: "The connection does not establish improved answer quality.",
      status: "observed",
      observedOn: "2026-09-11",
    },
    {
      id: "answer-draft",
      title: "A source-linked answer draft",
      observation:
        "A draft answer retains a link to the selected strategy note.",
      interpretation:
        "The reviewer can return to the argument before revising the answer.",
      uncertainty:
        "Observed endpoint: linked draft. Rehearsal and improved readiness are not established.",
      status: "observed",
      observedOn: "2026-09-11",
    },
    {
      id: "demand",
      title: "A recurring capability requirement",
      observation:
        "A sanitized requirement illustrates how external demand can inform a competency.",
      interpretation:
        "Learning priorities can be related to challenges in the market.",
      uncertainty:
        "Structural reconstruction; no employer, role or personal fit assessment is reproduced.",
      status: "illustrative",
    },
    {
      id: "study-note",
      title: "A reviewed, sourced study note",
      observation:
        "The introduction shows a requirement-to-competency-to-study connection.",
      interpretation:
        "Sources provide a foundation for recall and application prompts.",
      uncertainty:
        "This representation omits the underlying private study material.",
      status: "illustrative",
    },
    {
      id: "practice-response",
      title: "A recorded practice response",
      observation:
        "The observed learning loop ends at a reviewed note, prompts and a recorded response.",
      interpretation: "Practice leaves a record that can be revisited.",
      uncertainty:
        "Practice was recorded; learning gain and proficiency were not measured.",
      status: "illustrative",
    },
  ],
  roles: [
    {
      name: "Iris",
      role: "Operations",
      prepares: "Workflow and operational context",
    },
    {
      name: "Jax",
      role: "Jack Proxy",
      prepares: "Bounded retrieval and recommendation",
    },
    {
      name: "Cleo",
      role: "Interview preparation",
      prepares: "Source-linked answer drafts",
    },
    {
      name: "Quill",
      role: "Editorial",
      prepares: "Review and staging context",
    },
    { name: "Wren", role: "Narrative", prepares: "Source-backed notes" },
    {
      name: "Vega",
      role: "Evaluation",
      prepares: "Criteria and score-grid context",
    },
    {
      name: "Juno",
      role: "Career strategy",
      prepares: "Demand-informed learning topics",
    },
    {
      name: "Orin",
      role: "Domain study",
      prepares: "Sourced notes and practice prompts",
    },
  ],
  decisionExample: {
    title:
      "Should an existing platform capability become a managed product feature?",
    status: "illustrative",
    evidence: [
      "Customer interest suggests a problem worth investigating.",
      "Technical availability establishes feasibility of a component, not the entire service.",
      "Operational compatibility and administrative control still need evidence.",
    ],
    uncertainty:
      "Customer demand and operating constraints remain unverified in this fictional scenario.",
    nextReview:
      "Review after collecting customer evidence and testing operational compatibility.",
  },
  limits: [
    "Source links support review; they do not establish fidelity automatically.",
    "Historical decision artifacts are not proof of a shipped or commercially validated result.",
    "Quality, speed and learning gains need separate evaluation.",
  ],
  links: {
    deck: "/decks/pm-intelligence-system",
    project: "/studio",
    contact: "/#contact",
  },
};
