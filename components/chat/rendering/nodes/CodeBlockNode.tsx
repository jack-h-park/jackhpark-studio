import { useMemo } from "react";

import styles from "./CodeBlockNode.module.css";
import { tokenizeCode } from "./highlightCode";

const TOKEN_CLASS: Record<string, string | undefined> = {
  keyword: styles.tokenKeyword,
  string: styles.tokenString,
  comment: styles.tokenComment,
  number: styles.tokenNumber,
  plain: undefined,
};

export function CodeBlockNode({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const tokens = useMemo(() => tokenizeCode(code, language), [code, language]);

  return (
    <div className="ai-codeblock my-3 overflow-hidden rounded-md border bg-ai-bg-muted/50">
      {language && (
        <div className="flex items-center justify-between border-b bg-ai-bg-muted/40 px-4 py-2 text-xs font-medium text-ai-fg-muted">
          <span>{language}</span>
        </div>
      )}
      <div className="overflow-x-auto p-4">
        <pre className="font-mono text-xs leading-normal">
          <code>
            {tokens.map((token, i) => {
              const cls = TOKEN_CLASS[token.type];
              return cls ? (
                <span key={i} className={cls}>
                  {token.text}
                </span>
              ) : (
                token.text
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
