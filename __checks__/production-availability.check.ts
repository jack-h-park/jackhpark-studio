import {
  AlertChannel,
  Frequency,
  RetryStrategyBuilder,
  UrlAssertionBuilder,
  UrlMonitor,
  WebhookAlertChannel,
} from 'checkly/constructs'

const productionLocations = ['ap-northeast-2', 'us-east-1'] as const
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
    frequency: Frequency.EVERY_5M,
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

monitor('production-home', 'Prod · Home', '/')
monitor('production-chat', 'Prod · Chat', '/chat')
monitor('production-studio', 'Prod · Studio', '/studio')
monitor('production-feed', 'Prod · Feed', '/feed')
monitor('production-admin-sign-in', 'Prod · Admin sign-in', '/admin/sign-in')
monitor('production-ping-api', 'Prod · Ping API', '/api/ping')
monitor('production-chat-config-api', 'Prod · Chat config API', '/api/chat-config')
monitor('production-chat-runtime-api', 'Prod · Chat runtime API', '/api/chat-runtime')
monitor('production-error-asset', 'Prod · Error asset', '/assets/avatar-favicon/error.png')

// Notion content pages. Every monitor above sits on a top-level route, and on
// 2026-09-03 all of them stayed green while 48 leaf pages served 404 for days:
// a rate-limited build had cached `notFound` for pages nothing was watching.
// One canary per depth, each of which was actually dead in that incident.
// Full coverage is the post-deploy sitemap sweep, not more monitors here —
// these pages are generated on demand, so polling all 162 every five minutes
// would rebuild the same rate-limit storm against live traffic.
monitor('production-content-experience', 'Prod · Content · Experience', '/experience-background')
monitor('production-content-tool-leaf', 'Prod · Content · Tool leaf', '/aws')
monitor('production-content-gallery-leaf', 'Prod · Content · Gallery leaf', '/beluga')
