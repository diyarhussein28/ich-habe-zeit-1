import React, { useEffect } from 'react'
import { Stack } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet } from 'react-native'
import { StripeWrapper } from '../src/components/StripeWrapper'
import { useAuthStore } from '../src/store/auth.store'
import { useAccessibilityStore } from '../src/store/accessibility.store'
import { setUnauthorizedHandler } from '../src/api/client'
import { usePushNotifications } from '../src/hooks/usePushNotifications'
import { queryClient } from '../src/utils/queryClient'
import { colors } from '../src/constants/theme'

function RootLayoutInner() {
  const { hydrate, logout } = useAuthStore()
  const hydrateAccessibility = useAccessibilityStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
    hydrateAccessibility()
    setUnauthorizedHandler(() => logout())
  }, [hydrate, hydrateAccessibility, logout])

  usePushNotifications()

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(provider)" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="support" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="notification-settings" />
      <Stack.Screen name="accessibility-settings" />
      <Stack.Screen name="payment-methods" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="+not-found" />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StripeWrapper>
            <StatusBar style="auto" />
            <RootLayoutInner />
          </StripeWrapper>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  )
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } })
