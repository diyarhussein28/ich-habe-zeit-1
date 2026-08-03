import { Redirect } from 'expo-router'
import { useAuthStore } from '../src/store/auth.store'
import { LoadingScreen } from '../src/components/ui/LoadingScreen'

export default function Index() {
  const { token, user, isHydrated } = useAuthStore()

  if (!isHydrated) {
    return <LoadingScreen message="Wird geladen..." />
  }

  if (!token || !user) {
    return <Redirect href="/(auth)/welcome" />
  }

  // Unverified user — redirect to the correct OTP step
  if (user.verificationStatus === 'REGISTERED') {
    const type = user.emailVerified ? 'phone' : 'email'
    return <Redirect href={`/(auth)/otp?identifier=${encodeURIComponent(user.email)}&type=${type}&purpose=register`} />
  }

  if (user.role === 'CUSTOMER') {
    return <Redirect href="/(customer)" />
  }

  if (user.role === 'PROVIDER') {
    return <Redirect href="/(provider)" />
  }

  // Admin/Help-Desk shouldn't use the mobile app
  return <Redirect href="/(auth)/login" />
}
