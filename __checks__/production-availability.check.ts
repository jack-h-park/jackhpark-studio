import {
  AlertChannel,
  Frequency,
  RetryStrategyBuilder,
  UrlAssertionBuilder,
  UrlMonitor,
} from 'checkly/constructs'

const productionLocations = ['ap-northeast-2', 'us-east-1'] as const
const retryStrategy = RetryStrategyBuilder.singleRetry({
  baseBackoffSeconds: 30,
})
const emailAlert = AlertChannel.fromId(322_164)

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
    alertChannels: [emailAlert],
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
