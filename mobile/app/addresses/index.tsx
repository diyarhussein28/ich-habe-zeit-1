import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi, type Address } from '../../src/api/profile.api'
import { ConfirmModal } from '../../src/components/ui/ConfirmModal'
import { Button } from '../../src/components/ui/Button'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'

const EMPTY_FORM = { label: 'Zuhause', street: '', city: '', plz: '', isDefault: false }

export default function AddressesScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => profileApi.listAddresses().then((r) => r.data.addresses),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      editId
        ? profileApi.updateAddress(editId, form)
        : profileApi.addAddress(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] })
      closeForm()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteAddress(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] })
      setDeleteTarget(null)
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => profileApi.updateAddress(id, { isDefault: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  })

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(addr: Address) {
    setEditId(addr.id)
    setForm({ label: addr.label, street: addr.street, city: addr.city, plz: addr.plz, isDefault: addr.isDefault })
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meine Adressen</Text>
        <TouchableOpacity onPress={openCreate}>
          <Text style={styles.newBtn}>+ Neu</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📍</Text>
              <Text style={styles.emptyTitle}>Noch keine Adressen</Text>
              <Text style={styles.emptyText}>Speichere Adressen für schnelleres Buchen.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.label}>{item.label}</Text>
                {item.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Standard</Text>
                  </View>
                )}
              </View>
              <Text style={styles.addressText}>{item.street}</Text>
              <Text style={styles.addressText}>{item.plz} {item.city}</Text>
              <View style={styles.cardActions}>
                {!item.isDefault && (
                  <TouchableOpacity onPress={() => setDefaultMutation.mutate(item.id)}>
                    <Text style={styles.actionLink}>Als Standard</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => openEdit(item)}>
                  <Text style={styles.actionLink}>Bearbeiten</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteTarget(item)}>
                  <Text style={[styles.actionLink, styles.deleteLink]}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={closeForm}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editId ? 'Adresse bearbeiten' : 'Neue Adresse'}</Text>

            <Text style={styles.fieldLabel}>Bezeichnung</Text>
            <View style={styles.chipRow}>
              {['Zuhause', 'Arbeit', 'Sonstiges'].map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.chip, form.label === l && styles.chipActive]}
                  onPress={() => setForm((f) => ({ ...f, label: l }))}
                >
                  <Text style={[styles.chipText, form.label === l && styles.chipTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Straße & Hausnummer</Text>
            <TextInput style={styles.input} value={form.street} onChangeText={(v) => setForm((f) => ({ ...f, street: v }))} placeholder="Musterstraße 1" placeholderTextColor={colors.textDisabled} />

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>PLZ</Text>
                <TextInput style={styles.input} value={form.plz} onChangeText={(v) => setForm((f) => ({ ...f, plz: v }))} placeholder="10115" keyboardType="number-pad" maxLength={5} placeholderTextColor={colors.textDisabled} />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.fieldLabel}>Stadt</Text>
                <TextInput style={styles.input} value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Berlin" placeholderTextColor={colors.textDisabled} />
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <Button label="Abbrechen" variant="outline" onPress={closeForm} fullWidth={false} style={styles.modalBtn} />
              <Button
                label="Speichern"
                onPress={() => {
                  if (form.street.trim().length < 3) { setError('Bitte gib eine Straße ein.'); return }
                  if (!/^\d{5}$/.test(form.plz)) { setError('Bitte gib eine gültige 5-stellige PLZ ein.'); return }
                  if (form.city.trim().length < 2) { setError('Bitte gib eine Stadt ein.'); return }
                  setError('')
                  saveMutation.mutate()
                }}
                loading={saveMutation.isPending}
                fullWidth={false}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={!!deleteTarget}
        title="Adresse löschen?"
        message={`„${deleteTarget?.label}" wird dauerhaft entfernt.`}
        confirmLabel="Löschen"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(deleteTarget!.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { fontSize: fontSize.sm, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  newBtn: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
  list: { padding: spacing.lg, gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  label: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  defaultBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  defaultBadgeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  addressText: { fontSize: fontSize.sm, color: colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionLink: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  deleteLink: { color: colors.error },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.sm, color: colors.text, marginTop: spacing.xs },
  row2: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse, fontWeight: fontWeight.medium },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  modalBtn: { flex: 1 },
})
