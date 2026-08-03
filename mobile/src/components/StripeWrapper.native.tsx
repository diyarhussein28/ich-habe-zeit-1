import { StripeProvider } from '@stripe/stripe-react-native'

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

export function StripeWrapper({ children }: { children: React.ReactElement | React.ReactElement[] }) {
  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.de.ichhabezeit">
      {children}
    </StripeProvider>
  )
}
