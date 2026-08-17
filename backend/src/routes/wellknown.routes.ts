import type { FastifyInstance } from 'fastify'

// Universal Links (iOS) / App Links (Android) scaffolding.
//
// APPLE_TEAM_ID must be replaced with the real Apple Developer Team ID (found
// on developer.apple.com under Membership) before Universal Links work on a
// real device — until then this file is harmless but inert.
const APPLE_TEAM_ID = 'REPLACE_WITH_APPLE_TEAM_ID'
const IOS_BUNDLE_ID = 'de.ichhabezeit.app'

// Replace with the app's release-keystore SHA-256 fingerprint, e.g. via
// `eas credentials` (Android > production > View keystore) or
// `keytool -list -v -keystore <path>`.
const ANDROID_SHA256_FINGERPRINTS: string[] = []
const ANDROID_PACKAGE = 'de.ichhabezeit.app'

function appleAppSiteAssociation() {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`,
          paths: [
            '/providers/*',
            '/listings/*',
            '/orders/*',
            '/requests/*',
          ],
        },
      ],
    },
  }
}

function androidAssetLinks() {
  if (ANDROID_SHA256_FINGERPRINTS.length === 0) return []
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: ANDROID_SHA256_FINGERPRINTS,
      },
    },
  ]
}

export async function wellKnownRoutes(app: FastifyInstance) {
  app.get('/.well-known/apple-app-site-association', async (_req, reply) => {
    reply.type('application/json')
    return appleAppSiteAssociation()
  })

  // Some tooling / CDNs look at the legacy unprefixed path too.
  app.get('/apple-app-site-association', async (_req, reply) => {
    reply.type('application/json')
    return appleAppSiteAssociation()
  })

  app.get('/.well-known/assetlinks.json', async (_req, reply) => {
    reply.type('application/json')
    return androidAssetLinks()
  })
}
