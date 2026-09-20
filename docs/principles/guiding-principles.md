## Coding Guiding Principles

When implementing any change, **always prioritize the following principles**:

- **Minimize code fragmentation**  
  Avoid unnecessary abstraction, over-splitting, or scattered logic. Prefer cohesive, well-scoped modules.

- **Maintainability over cleverness**  
  Choose solutions that are easy to understand, modify, and debug by future maintainers.

- **Readability is a first-class requirement**  
  Code should clearly communicate intent. Favor explicitness over implicit or overly compact logic.

- **Avoid unnecessary code**  
  Do not introduce functionality, configuration, or abstraction unless it is clearly required by the current scope.

- **Enforce consistency across the codebase**  
  Follow existing patterns, naming conventions, file structure, and architectural decisions unless explicitly instructed otherwise.

- **Logging and telemetry must follow documented standards**  
  All logging-related implementations must align with:
  - `docs/telemetry/telemetry-logging.md`
  - `docs/telemetry/langfuse-guide.md`  
    Do not introduce ad-hoc logs or alternative logging mechanisms.

- **UI/UX changes must align with the design system**  
  Any UI or UX implementation must follow:
  - `docs/design-system/ai-design-system.md`  
    Reuse existing primitives, tokens, and patterns instead of creating new ones.

- **Notion rendering preserves the document, not the canvas**  
  Notion is the CMS, so what must survive rendering is the *document*: content,
  order, hierarchy, block semantics, and the author's ability to change all of it
  from Notion. What may differ is the *canvas* — how much space a block gets at a
  given viewport. Notion's editor column is sized for a window with a sidebar and
  editing chrome; this site is read at 1920px and wider. Matching it pixel for
  pixel is not the goal, and never was: the `balanced` profile was written against
  notion.site, Notion's own publishing output, not the Notion app.

  Before changing layout, three questions:
  1. **Does the document change?** Content, order, and hierarchy must not.
  2. **Is the rule predictable from the block type alone?** If it needs a
     per-page or per-database exception, reconsider — an author who cannot
     predict the result from Notion has lost the CMS.
  3. **Does it narrow what Notion controls?** Moving authoring decisions into
     code is the expensive direction; prefer changes that leave them in Notion.

  Worked example: wide-viewport breakout (`styles/notion-parity.css`, PR #179).
  Gallery column count was never an authored value — Notion authors card size,
  and the count is derived from the available width. Widening the container fed
  a new input to a rule that already existed rather than adding one.

> If there is a trade-off, always favor long-term clarity and consistency over short-term speed.
