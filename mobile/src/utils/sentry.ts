import * as Sentry from '@sentry/react-native'

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

export function initSentry() {
  if (!dsn) return
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  })
}

export const captureException = Sentry.captureException
