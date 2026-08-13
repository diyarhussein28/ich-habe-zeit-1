import React, { useEffect, useRef } from 'react'
import { View, Text, TextInput, ActivityIndicator, StyleSheet } from 'react-native'
import { usePlzLookup } from '../../hooks/usePlzLookup'
import { formatPlzInput } from '../../utils/inputFormat'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'

interface Props {
  plz: string
  city: string
  onChangePlz: (plz: string) => void
  onChangeCity: (city: string) => void
  plzLabel?: string
  cityLabel?: string
  /** Style overrides so this drops into screens with their own input styling. */
  inputStyle?: object
  labelStyle?: object
}

/**
 * Paired PLZ + city inputs where entering a valid postal code fills the city
 * automatically. The city stays editable — some PLZ map to several places, and
 * the user must always be able to correct us.
 */
export function PlzCityFields({
  plz,
  city,
  onChangePlz,
  onChangeCity,
  plzLabel = 'PLZ',
  cityLabel = 'Stadt',
  inputStyle,
  labelStyle,
}: Props) {
  const { city: resolvedCity, loading, places } = usePlzLookup(plz)

  // Auto-fill only once per resolved PLZ, so a manual correction isn't
  // clobbered on every re-render — but a *new* PLZ does refill.
  const autofilledFor = useRef<string | null>(null)

  useEffect(() => {
    if (resolvedCity && autofilledFor.current !== plz) {
      autofilledFor.current = plz
      onChangeCity(resolvedCity)
    }
  }, [resolvedCity, plz, onChangeCity])

  const ambiguous = places.length > 1

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.plzCol}>
          <Text style={[styles.label, labelStyle]}>{plzLabel}</Text>
          <TextInput
            style={[styles.input, inputStyle]}
            value={plz}
            onChangeText={(v) => onChangePlz(formatPlzInput(v))}
            placeholder="10115"
            keyboardType="number-pad"
            maxLength={5}
            autoComplete="postal-code"
            placeholderTextColor={colors.textDisabled}
          />
        </View>
        <View style={styles.cityCol}>
          <Text style={[styles.label, labelStyle]}>{cityLabel}</Text>
          <View>
            <TextInput
              style={[styles.input, inputStyle]}
              value={city}
              onChangeText={onChangeCity}
              placeholder="Berlin"
              placeholderTextColor={colors.textDisabled}
            />
            {loading ? (
              <ActivityIndicator style={styles.spinner} size="small" color={colors.primary} />
            ) : null}
          </View>
        </View>
      </View>

      {ambiguous ? (
        <Text style={styles.hint}>
          Mehrere Orte mit dieser PLZ — bitte bei Bedarf anpassen:{' '}
          {places.slice(0, 4).map((p) => p.city).join(', ')}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  plzCol: { flex: 1 },
  cityCol: { flex: 2 },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  spinner: { position: 'absolute', right: spacing.sm, top: 0, bottom: 0 },
  hint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
})
