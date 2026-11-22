export type PlayDestination =
  | "writing"
  | "questions"
  | "learning"
  | "decisions";
export interface ActivityOption {
  id: string;
  label: string;
  accepted: boolean;
  feedback: string;
}
export interface ActivityDefinition {
  title: string;
  instruction: string;
  result: string;
  stages: Array<{ prompt: string; options: ActivityOption[] }>;
}
export const activityDefinitions: Record<PlayDestination, ActivityDefinition> =
  {
    writing: {
      title: "Build a defensible viewpoint",
      instruction:
        "Assemble an argument from the shared source. Keep observation, interpretation and claim separate.",
      result:
        "Observation → interpretation → bounded claim. A draft can preserve both reasoning and limits.",
      stages: [
        {
          prompt: "Start with what the record supports.",
          options: [
            {
              id: "quality-gain",
              label: "The system improved answer quality.",
              accepted: false,
              feedback:
                "An improvement in answer quality is not established by a linked draft.",
            },
            {
              id: "observation",
              label: "A source-backed note is connected to an answer draft.",
              accepted: true,
              feedback: "Keep the observable endpoint before interpreting it.",
            },
          ],
        },
        {
          prompt: "Add an interpretation without turning it into an outcome.",
          options: [
            {
              id: "interpretation",
              label: "A retained viewpoint can help prepare a later answer.",
              accepted: true,
              feedback:
                "This describes a possible use, with its reasoning attached.",
            },
            {
              id: "automation",
              label: "Agents can publish the argument without review.",
              accepted: false,
              feedback:
                "Agent preparation still needs a person to review the source and argument.",
            },
          ],
        },
        {
          prompt: "Choose the claim you could responsibly put in a draft.",
          options: [
            {
              id: "universal",
              label: "This proves every answer will be better.",
              accepted: false,
              feedback: "One connection does not prove a general quality gain.",
            },
            {
              id: "bounded",
              label:
                "This example shows traceable reuse; quality improvement remains untested.",
              accepted: true,
              feedback: "The claim preserves the limit of the evidence.",
            },
          ],
        },
      ],
    },
    questions: {
      title: "Trace an answer back to its source",
      instruction:
        "Reconstruct how preparation can support a PM answer. An answer is useful when its reasoning can be revisited.",
      result:
        "Source-backed note → answer draft → human review. Preparation remains traceable; answer quality is not established.",
      stages: [
        {
          prompt:
            "A PM asks: what does AI quality mean beyond accuracy? Where do you start?",
          options: [
            {
              id: "confident-answer",
              label: "Start with a confident answer and add a source later.",
              accepted: false,
              feedback:
                "Start from the evidence rather than retrofitting provenance.",
            },
            {
              id: "source-note",
              label: "Retrieve the source-backed viewpoint on trust recovery.",
              accepted: true,
              feedback:
                "The documented external-signal example provides the anchor.",
            },
          ],
        },
        {
          prompt: "Choose what the Agent should prepare for the person.",
          options: [
            {
              id: "answer-draft",
              label:
                "A linked answer draft, with reasoning and unresolved limits.",
              accepted: true,
              feedback: "The person can review, revise or reject the draft.",
            },
            {
              id: "proven-answer",
              label: "A verified best answer with no need for human review.",
              accepted: false,
              feedback:
                "The observed artifact is a draft, not a validated best answer.",
            },
          ],
        },
      ],
    },
    learning: {
      title: "Turn a gap into a learning loop",
      instruction:
        "Order the learning steps. The same knowledge foundation supports preparation for unfamiliar work.",
      result:
        "Demand → sourced study → practice and review. Retain the practice record; proficiency still needs separate evidence.",
      stages: [
        {
          prompt: "What gives the learning loop a useful starting point?",
          options: [
            {
              id: "demand",
              label:
                "Identify a recurring capability requirement and the gap it exposes.",
              accepted: true,
              feedback:
                "External demand helps frame a specific question to study.",
            },
            {
              id: "trend",
              label: "Collect every trending topic without a question.",
              accepted: false,
              feedback:
                "A defined gap gives study a purpose and a way to revisit it.",
            },
          ],
        },
        {
          prompt: "What should connect the gap to preparation?",
          options: [
            {
              id: "certificate",
              label: "Mark the capability as mastered after saving an article.",
              accepted: false,
              feedback: "Saving material is not evidence of proficiency.",
            },
            {
              id: "study",
              label: "Build a sourced study note around the question.",
              accepted: true,
              feedback:
                "Keep sources, interpretations and unanswered questions distinct.",
            },
          ],
        },
        {
          prompt: "Close this cycle without overstating the result.",
          options: [
            {
              id: "practice",
              label:
                "Practice a response, review the gaps and retain the record.",
              accepted: true,
              feedback:
                "Practice creates something to inspect; it does not prove a learning gain.",
            },
            {
              id: "mastery",
              label: "Treat completion as demonstrated expertise.",
              accepted: false,
              feedback:
                "Expertise requires evidence beyond completing this exercise.",
            },
          ],
        },
      ],
    },
    decisions: {
      title: "Leave a judgment someone can revisit",
      instruction:
        "Optional scenario: a team must choose a next step for an AI feature with limited engineering capacity. Accuracy is measured; recovery after a wrong answer is still uncertain.",
      result:
        "A next step, a reason and an unresolved question. AI can prepare context; the person owns this illustrative judgment.",
      stages: [
        {
          prompt:
            "Choose a next step. There is no universally correct product judgment here.",
          options: [
            {
              id: "verify",
              label: "Verify recovery behavior before rollout.",
              accepted: true,
              feedback: "Record what evidence would resolve the uncertainty.",
            },
            {
              id: "revise",
              label: "Revise the scope toward a recovery flow.",
              accepted: true,
              feedback:
                "Explain the trade-off and what would change your view.",
            },
            {
              id: "hold",
              label: "Hold the rollout while collecting evidence.",
              accepted: true,
              feedback:
                "Explain the cost of waiting and the evidence needed to revisit it.",
            },
            {
              id: "proceed",
              label: "Proceed with a bounded pilot and review point.",
              accepted: true,
              feedback:
                "Explain the limits of the pilot and the review trigger.",
            },
          ],
        },
      ],
    },
  };
export function isPlayDestination(value: string): value is PlayDestination {
  return Object.hasOwn(activityDefinitions, value);
}
