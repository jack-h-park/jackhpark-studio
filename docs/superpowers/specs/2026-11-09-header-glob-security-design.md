# Header and Glob Dependency Security Patches

The owner approved updating `follow-redirects` to `1.16.2`, adding cross-realm sensitive-header regression coverage, and updating only affected `minimatch` 10.x dependencies to fixed `11.0.1`. Merge, deployment, ingestion, provider calls, and monitoring cadence changes remain held.

## Approach

Keep the existing exact follow-redirects override and update its patch version. Extend the installed dependency's loopback redirect tests across object/array header representations, same/cross-origin redirects, and same/cross-realm sensitive header names. Tests must fail on the currently installed `1.16.1` and pass after the patch.

Use `minimatch@10` as the pnpm override selector, preserving unaffected 3.x consumers. A global override would unnecessarily change old ESLint consumers. Remaining on vulnerable 10.x would leave the known amplification defect. Since the fixed version changes major version, verify real glob discovery and exclusion behavior, shared TypeScript ESLint consumers, and Checkly's fixed discovery patterns offline. Do not invoke Checkly deployment, remote tests, or trigger commands.

## Verification and evidence

Exercise a small, bounded hostile glob pattern in the Node test process and verify the fixed matcher remains usable for current file discovery patterns. Compare actual consumer results against literal fixture expectations; passing engine constraints alone is insufficient. Run the complete unit/golden suites, typecheck, lint and guards, and deterministic Next build. Verify Node 20/22/24 compatibility. Review the final branch independently and retain release holds in a Draft PR.

These patches address security defects. They do not prove that Production CPU usage is efficient or quantify savings from the prior release. Remaining usage evidence gaps are tracked separately in the task artifact report.
