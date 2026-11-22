# Observatory Wayfinding Plan

Status: locally implemented and verified; owner acceptance and publication pending.

**Goal:** Help visitors understand the whole campus and travel between sources, human review, knowledge and its several uses.

**Architecture:** Replace the compass list with a native-button campus map drawn from the actual navigation graph. The scene publishes its explorer position to a ref; only the open map samples it at five updates per second. Reuse existing source-specific completion records. Preserve direct landmarks, HTML reading and the optional decision activity.

**Constraints:** Route-local changes, English source/docs, existing theme tokens, no new dependencies/assets/API calls/telemetry. No remote publication or merge. Work in the existing isolated Studio branch.

## Tasks

- [x] Test map projection, all graph paths and accessible destination/completion labels, then implement the map model/component.
- [x] Wire the explorer position, compass open/close and destination travel. Correct unpausing walking so closing a panel does not cancel an existing click-travel route; enabling manual walking or actual movement may interrupt it.
- [x] Check keyboard focus, source-specific receipts, touch targets and narrow/short viewports. Run tests, type/lint/guards and production build; obtain code review, capture the local browser result and commit named files.

## Review focus

Live position is not the selected content location. Completion must belong to the current input. All destinations need native keyboard actions. Map timers must stop when hidden/closed. A menu or panel must clear held movement without silently canceling click travel on return.

## Decision record

The owner asked to continue direct implementation. This is a bounded wayfinding improvement within the chosen Signal Observatory direction; it does not reopen the visual concept or introduce a live platform workflow.
