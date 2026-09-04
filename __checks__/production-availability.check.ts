import {
  AlertChannel,
  Frequency,
  RetryStrategyBuilder,
  UrlAssertionBuilder,
  UrlMonitor,
  WebhookAlertChannel,
} from 'checkly/constructs'

// ONE location. A second region mostly confirms the first behind a global CDN,
// and it doubles the run count — which is the binding constraint now (see the
// budget note below). Seoul because it is where the site is actually read from.
const productionLocations = ['ap-northeast-2'] as const
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
    frequency: Frequency.EVERY_15M,
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

// ─── Why only two, and why fifteen minutes ──────────────────────────────────
//
// The .github/workflows/prod-availability.yml smoke run is the PRIMARY monitor:
// it covers every route below plus body assertions Checkly's UrlMonitor cannot
// make (`<title>` contains "Ask JackGPT"), it runs every five minutes, and it is
// free because this repository is public. Checkly duplicated nine of its ten
// checks — one cause, two alerts — while being the only one of the pair that
// costs anything.
//
// What Checkly still uniquely provides is a probe from OUTSIDE GitHub: real DNS,
// real CDN, a real client in Seoul. That is worth two monitors, not twelve.
//
// The budget is the Hobby tier's 10,000 API runs/month, and it is a hard cap —
// Hobby STOPS EXECUTING once it is exhausted, so overshooting does not cost
// money, it costs monitoring, silently, for the rest of the month:
//
//   12 monitors x 2 locations x 5m  = 207,360 runs/month   (20.7x the cap)
//    9 monitors x 2 locations x 5m  = 155,520 runs/month   (15.5x — what was live)
//    2 monitors x 1 location  x 15m =   5,760 runs/month   (58% — this)
//
// The headroom is deliberate: singleRetry spends an extra run per failure, and a
// bad week must not be what silences the monitor.
//
// Coverage given up here did NOT disappear. The nine duplicated routes were
// already in the smoke run, and the three Notion content canaries moved into it —
// see the comment beside them there for the 2026-09-03 incident they exist for.

monitor('production-home', 'Prod · Home', '/')
monitor('production-chat', 'Prod · Chat', '/chat')
