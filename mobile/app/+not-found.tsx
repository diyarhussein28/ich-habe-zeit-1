import { View, Text, StyleSheet } from 'react-native'
import { Link } from 'expo-router'
import { colors, fontSize, spacing } from '../src/constants/theme'

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.subtitle}>Seite nicht gefunden</Text>
      <Link href="/" style={styles.link}>
        Zur Startseite
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { fontSize: fontSize.xxxl, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.lg, color: colors.textSecondary, marginBottom: spacing.xl },
  link: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
})
