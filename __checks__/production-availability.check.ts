import {
  AlertChannel,
  Frequency,
  RetryStrategyBuilder,
  UrlAssertionBuilder,
  UrlMonitor,
  WebhookAlertChannel,
} from 'checkly/constructs'

// ONE location. A second region mostly confirms the first behind a global CDN,
// and it doubles the run count — which is the binding constraint (see the budget
// note below).
//
// N. Virginia, and this is measured rather than assumed: PostHog $pageview over
// the 30 days to 2026-09-04 was 94.2% United States (130/138 views, 20 of 25
// visitors); South Korea was 4 views from a single visitor. The probe ran from
// Seoul until then, on the stated grounds that Seoul was "where the site is
// actually read from" — it was not. Behind a CDN the region barely changes
// whether a page is UP, but it decides whose latency degradedResponseTime is
// measuring, and it was measuring an audience of one.
const productionLocations = ['us-east-1'] as const
const retryStrategy = RetryStrategyBuilder.singleRetry({
  baseBackoffSeconds: 30,
})
const emailAlert = AlertChannel.fromId(322_164)

// Deliberately NOT using checkly/constructs' TelegramAlertChannel: its
// constructor hardcodes `&parse_mode=HTML` onto the template regardless of
// what `payload` contains (the SDK source even admits "For historical
// reasons the payload is not escaped even though it should be"). With HTML
// parsing on, a stray `<`/`>` in the free-form AI_ANALYSIS_ROOT_CAUSE text
// (e.g. "latency <2s") makes Telegram silently 400 the whole message — this
// is exactly what caused the alert channel to go quiet during the
// 2026-09-03 incident. Building the request via the generic
// WebhookAlertChannel instead, with no parse_mode at all, sidesteps entity
// parsing entirely. Verified against the exact payload that broke before.
const telegramApiKey = process.env.CHECKLY_TELEGRAM_BOT_TOKEN
const telegramChatId = process.env.CHECKLY_TELEGRAM_CHAT_ID
// Optional forum topic inside a Telegram supergroup. Sent as a separate
// `message_thread_id` parameter, NOT appended to chat_id: Telegram rejects
// `chat_id=-100…:17` with a 400 and delivers nothing. Unset = the group root,
// which is also the correct value for a plain group with no topics.
const telegramThreadId = process.env.CHECKLY_TELEGRAM_THREAD_ID?.trim()
const telegramThreadParam = telegramThreadId
  ? `&message_thread_id=${telegramThreadId}`
  : ''
if (!telegramApiKey || !telegramChatId) {
  throw new Error(
    'CHECKLY_TELEGRAM_BOT_TOKEN and CHECKLY_TELEGRAM_CHAT_ID must be set ' +
      '(see .env.local) to deploy production-availability.check.ts.',
  )
}

const telegramAlert = new WebhookAlertChannel('jackhpark-com-telegram-ops', {
  name: 'jackhpark.com Alert Channel',
  webhookType: 'WEBHOOK_TELEGRAM',
  url: `https://api.telegram.org/bot${telegramApiKey}/sendMessage`,
  method: 'POST',
  template: `chat_id=${telegramChatId}${telegramThreadParam}&text={{ALERT_TITLE}} at {{RUN_LOCATION}} ({{RESPONSE_TIME}}ms)
{{#if AI_ANALYSIS_CLASSIFICATION}}
AI Analysis: {{AI_ANALYSIS_CLASSIFICATION}}

{{AI_ANALYSIS_ROOT_CAUSE}}
Read full analysis: {{AI_ANALYSIS_LINK}}
{{/if}}

Tags: {{#each TAGS}} {{this}} {{#unless @last}},{{/unless}} {{/each}}
View check result: {{RESULT_LINK}}
`,
  sendRecovery: true,
  sendFailure: true,
  sendDegraded: false,
})

function monitor(
  logicalId: string,
  name: string,
  path: string,
  expectedStatus = 200,
) {
  new UrlMonitor(logicalId, {
    name,
    frequency: Frequency.EVERY_30M,
    locations: [...productionLocations],
    retryStrategy,
    alertChannels: [emailAlert, telegramAlert],
    degradedResponseTime: 2000,
    maxResponseTime: 30_000,
    request: {
      url: `https://www.jackhpark.com${path}`,
      followRedirects: true,
      assertions: [UrlAssertionBuilder.statusCode().equals(expectedStatus)],
    },
  })
}

// ─── Why five, and why thirty minutes ───────────────────────────────────────
//
// #158 cut this file to two monitors on the premise that
// .github/workflows/prod-availability.yml is the primary monitor and "runs every
// five minutes". Measured afterwards, it does not: its cron says `*/5` but
// GitHub delivers scheduled workflows on a best-effort basis for public repos,
// and across 28 consecutive runs the MEDIAN interval was 212 minutes. No runs
// were cancelled — GitHub simply does not fire the schedule. So the routes moved
// there did not get five-minute detection, they got roughly three-and-a-half
// hours of it.
//
// The three Notion content canaries are the ones that matter. They exist because
// on 2026-09-03 a rate-limited build cached `notFound` for 48 leaf pages, which
// served 404 for days while every top-level route stayed green. Leaving the one
// signal that can see that failure on a schedule that fires every ~3.5 hours put
// it back out of reach.
//
// So they come back here, where the cadence is actually honoured, and the budget
// pays for it by halving the frequency rather than by dropping monitors.
//
// The budget is the Hobby tier's 10,000 API runs/month, and it is a hard cap —
// Hobby STOPS EXECUTING once exhausted, so overshooting does not cost money, it
// costs monitoring, silently, for the rest of the month:
//
//    9 monitors x 2 locations x  5m = 155,520 runs/month   (15.5x — what was live)
//    5 monitors x 1 location  x 15m =  14,400 runs/month   (1.4x — still over)
//    5 monitors x 1 location  x 30m =   7,200 runs/month   (72% — this)
//
// Note the account is on Trial today, where the limit is a monitor COUNT
// (UPTIME_CHECKS: 75) and none of this binds. These numbers are for the Hobby
// plan the trial lapses into, which is when getting it wrong goes quiet.
//
// The remaining headroom is deliberate: singleRetry spends an extra run per
// failure, and a bad week must not be what silences the monitor.
//
// The smoke run keeps the other six routes and its body assertions
// (`<title>` contains "Ask JackGPT"), which a UrlMonitor cannot make. It stays
// the free backstop; it is no longer load-bearing for the canaries.

monitor('production-home', 'Prod · Home', '/')
monitor('production-chat', 'Prod · Chat', '/chat')

// Notion content canaries, one per depth — each was actually dead in the
// 2026-09-03 incident. Full coverage is the post-deploy sitemap sweep
// (.github/workflows/sitemap-availability.yml); these three only have to notice
// that the content layer as a whole has gone missing between deploys. Polling
// all 162 here would rebuild the rate-limit storm that caused the incident.
monitor('production-content-experience', 'Prod · Content · Experience', '/experience-background')
monitor('production-content-tool-leaf', 'Prod · Content · Tool leaf', '/aws')
monitor('production-content-gallery-leaf', 'Prod · Content · Gallery leaf', '/beluga')
