# Production crawler policy decision, 2026-11-24

The Production robots handler asks the single user-agent token `meta-externalagent` to skip all paths. This voluntary rule reduces exposure to that crawler across the site, including portfolio content it might otherwise index. Other crawlers, including Meta's separate link-preview and user-triggered fetch agents, retain the wildcard policy. Preview continues to disallow all crawlers. The change takes effect when a deployment containing it serves Production and the crawler reads the new policy.

## Why this restriction was selected

The Studio Production function CPU metric attributed about 32.2 minutes and 3,111 invocations to requests matching `meta-externalagent` on the Notion route over 30 complete UTC days. The entire route used 80.28 minutes across 979 request paths. The crawler appeared on all 30 days and accounted for about 40% of the route's CPU. Those figures establish a source of recurring work. They do not establish avoidable CPU, the cause of the former team quota suspension or the identity behind every user-agent string.

To reproduce the baseline while history is available, sum `vercel.function_invocation.function_cpu_time_ms` and count `vercel.function_invocation.count` for project `jackhpark-studio`, environment `production`, route `/[pageId]`, from 2026-10-26 00:00 UTC inclusive to 2026-11-25 00:00 UTC exclusive (Oct 25 17:00 PDT to Nov 24 16:00 PST). Run the query with and without `clientUserAgent:*meta-externalagent*`. Historical totals include deployments, sitemap sweeps, manual refreshes and the service interruption.

## Review after rollout

The maintainer reviewing the rollout should record the Ready Production commit, effective timestamp and first observed crawler policy refresh if available. Allow for the one-day shared-cache lifetime on robots.txt and crawler-side caching. Compare seven complete UTC days after adoption with a pre-change week covering the same weekdays. Exclude deployment, sitemap sweep, manual refresh, outage and other known intervention bands from both windows at matching offsets. Record exact bounds, excluded time, raw and matched CPU and invocation counts for the crawler and the whole route, plus other traffic volume and any gaps. If adoption or comparable history is unavailable, record that uncertainty. A lower crawler count alone does not demonstrate net savings.

## Narrowing or retiring the restriction

Revisit after the first matched week, after a rendering or cache fix that changes the cost of crawling, or when Meta discovery becomes valuable. If only specific paths still impose material costs, narrow the disallow to those measured paths. If total CPU shows no material benefit at comparable traffic, or the discovery trade-off outweighs the measured benefit, remove the two-line agent group from [the handler](../../pages/robots.txt.tsx) and update [the robots test](../../test/robots-cache.test.ts) in the same PR. Keep any wildcard API exclusions applicable to a newly narrowed group because a matching specific group supersedes the wildcard. Run the test for Production and Preview and repeat the matched comparison after the reversal.

Record each later review here with its date, deployed revision, evidence window, CPU and calls, discovery impact if known, and the decision to retain, narrow or remove the rule. The initial decision has no measured post-deployment savings yet.
