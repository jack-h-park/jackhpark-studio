"use client";

import Image from "next/image";

import { cn } from "@/components/ui/utils";

const PROMPT_SUGGESTIONS = [
  "What are Jack’s 2–3 most impactful projects, and why?",
  "Show me how citations work on this site (give an example answer).",
  "Summarize Jack’s background in 5 bullet points.",
];

export type ChatEmptyStateProps = {
  onSelectPrompt?: (prompt: string) => void;
  className?: string;
};

export function ChatEmptyState({
  onSelectPrompt,
  className,
}: ChatEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-6 text-center",
        className,
      )}
    >
      <Image
        src="/images/7FAD09AA-76ED-4C18-A8E9-34D81940A59E.png"
        alt="Jack's AI Assistant"
        width={220}
        height={220}
      />
      <div className="max-w-md">
        <p className="text-base font-medium text-foreground leading-relaxed">
          Ask about Jack’s work, projects, or experience.
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Or explore how this AI assistant works: retrieval (RAG), citations, and
          telemetry.
        </p>
      </div>
      <div className="max-w-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Try one of these
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {PROMPT_SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-ai-border px-3 py-1 text-sm text-muted-foreground transition hover:border-ai-accent hover:text-ai hover:bg-[color-mix(in_srgb,var(--ai-accent),var(--ai-bg))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai-accent"
              onClick={() => onSelectPrompt?.(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
