---
trigger: always_on
---

When implementing any change, always prioritize the following principles:

Minimize code fragmentation
Avoid unnecessary abstraction, over-splitting, or scattered logic. Prefer cohesive, well-scoped modules.

Maintainability over cleverness
Choose solutions that are easy to understand, modify, and debug by future maintainers.

Readability is a first-class requirement
Code should clearly communicate intent. Favor explicitness over implicit or overly compact logic.

Avoid unnecessary code
Do not introduce functionality, configuration, or abstraction unless it is clearly required by the current scope.

Enforce consistency across the codebase
Follow existing patterns, naming conventions, file structure, and architectural decisions unless explicitly instructed otherwise.

Logging and telemetry must follow documented standards
All logging-related implementations must align with:

docs/telemetry/telemetry-logging.md
docs/telemetry/langfuse-guide.md
Do not introduce ad-hoc logs or alternative logging mechanisms.
UI/UX changes must align with the design system
Any UI or UX implementation must follow:

docs/design-system/ai-design-system.md
Reuse existing primitives, tokens, and patterns instead of creating new ones.
If there is a trade-off, always favor long-term clarity and consistency over short-term speed.
