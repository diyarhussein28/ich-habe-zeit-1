import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAccessibilityStore } from '../../src/store/accessibility.store'
import { spacing, fontSize, fontWeight, radius, getAccessibleColors, scaleFont } from '../../src/constants/theme'

export default function AccessibilitySettingsScreen() {
  const router = useRouter()
  const { largeText, highContrast, setLargeText, setHighContrast } = useAccessibilityStore()
  const colors = useMemo(() => getAccessibleColors(highContrast), [highContrast])
  const styles = useMemo(() => makeStyles(colors, largeText), [colors, largeText])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Barrierefreiheit</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={styles.rowLabel}>Große Schrift</Text>
              <Text style={styles.rowHint}>Vergrößert Texte in Buttons, Eingabefeldern und Karten in der gesamten App.</Text>
            </View>
            <Switch value={largeText} onValueChange={setLargeText} trackColor={{ true: colors.primary }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={styles.rowLabel}>Hoher Kontrast</Text>
              <Text style={styles.rowHint}>Verstärkt Text- und Rahmenfarben für bessere Lesbarkeit.</Text>
            </View>
            <Switch value={highContrast} onValueChange={setHighContrast} trackColor={{ true: colors.primary }} />
          </View>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Vorschau</Text>
          <Text style={styles.previewText}>So sieht Text mit deinen aktuellen Einstellungen aus.</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

function makeStyles(colors: ReturnType<typeof getAccessibleColors>, largeText: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    backBtn: { fontSize: scaleFont(fontSize.sm, largeText), color: colors.primary },
    title: { fontSize: scaleFont(fontSize.lg, largeText), fontWeight: fontWeight.bold, color: colors.text },
    content: { padding: spacing.lg },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
    rowLabel: { fontSize: scaleFont(fontSize.sm, largeText), fontWeight: fontWeight.medium, color: colors.text },
    rowHint: { fontSize: scaleFont(fontSize.xs, largeText), color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    divider: { height: 1, backgroundColor: colors.border },
    previewCard: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
    previewLabel: { fontSize: scaleFont(fontSize.xs, largeText), fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
    previewText: { fontSize: scaleFont(fontSize.md, largeText), color: colors.text, lineHeight: 24 },
  })
}
