export function CodeBlockNode({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  return (
    <div className="ai-codeblock my-3 overflow-hidden rounded-md border bg-muted/50">
      {language && (
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{language}</span>
        </div>
      )}
      <div className="overflow-x-auto p-4">
        <pre className="font-mono text-xs leading-normal">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
