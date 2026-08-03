import { Stack } from 'expo-router'
import { colors } from '../../../src/constants/theme'

export default function OrdersStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
  )
}
