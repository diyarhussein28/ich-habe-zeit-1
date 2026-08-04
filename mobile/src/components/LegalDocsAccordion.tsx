import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { legalApi } from '../api/legal.api'
import { colors, spacing, fontSize, fontWeight, radius } from '../constants/theme'

export function LegalDocsAccordion() {
  const [openType, setOpenType] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['legal-docs'],
    queryFn: () => legalApi.list().then((r) => r.data.documents),
  })

  if (isLoading) {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (isError || !data || data.length === 0) {
    return (
      <View style={styles.panel}>
        <Text style={styles.label}>Rechtliche Dokumente konnten nicht geladen werden.</Text>
      </View>
    )
  }

  return (
    <View style={styles.panel}>
      {data.map((doc) => {
        const isOpen = openType === doc.type
        return (
          <View key={doc.type} style={styles.docRow}>
            <TouchableOpacity onPress={() => setOpenType(isOpen ? null : doc.type)}>
              <Text style={styles.docTitle}>{isOpen ? '▾' : '▸'} {doc.title}</Text>
            </TouchableOpacity>
            {isOpen && <Text style={styles.docContent}>{doc.content}</Text>}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { paddingVertical: spacing.sm },
  docRow: { paddingVertical: spacing.xs },
  docTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  docContent: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
})
