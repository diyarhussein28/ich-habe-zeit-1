const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

const originalResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@stripe/stripe-react-native' && platform === 'web') {
    return {
      filePath: require.resolve('./src/mocks/stripe-web.js'),
      type: 'sourceFile',
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
