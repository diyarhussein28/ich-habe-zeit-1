import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import type { NegotiationOffer, OfferStatus } from '../../api/negotiation.api'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'
import { formatEur } from '../../utils/currency'
import { formatDate } from '../../utils/date'

// Labels stay short on purpose: the badge sits beside the card title, and a
// long one ("Gegenangebot gesendet") wrapped onto a second line and pushed the
// header out of shape.
const STATUS_META: Record<OfferStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Offen', color: colors.primary, bg: colors.primaryLight },
  ACCEPTED: { label: 'Angenommen', color: colors.secondary, bg: colors.secondaryLight },
  REJECTED: { label: 'Abgelehnt', color: colors.error, bg: colors.errorLight },
  WITHDRAWN: { label: 'Zurückgezogen', color: colors.textSecondary, bg: colors.background },
  EXPIRED: { label: 'Abgelaufen', color: colors.textSecondary, bg: colors.background },
  COUNTERED: { label: 'Ersetzt', color: colors.warning, bg: colors.warningLight },
}

interface Props {
  offer: NegotiationOffer
  /** True when the current user made this offer — they can withdraw, not accept. */
  isOwn: boolean
  /** Only the customer can turn an offer into a paid order. */
  canAccept: boolean
  busy?: boolean
  onAccept: () => void
  onDecline: () => void
  onCounter: () => void
  onWithdraw: () => void
}

export function OfferCard({
  offer,
  isOwn,
  canAccept,
  busy,
  onAccept,
  onDecline,
  onCounter,
  onWithdraw,
}: Props) {
  const meta = STATUS_META[offer.status] ?? STATUS_META.PENDING
  const isLive = offer.status === 'PENDING'
  const expired = new Date(offer.validUntil) < new Date()
  const days = offer.estimatedDurationHours ? Math.round(offer.estimatedDurationHours / 8) : null

  return (
    <View style={[styles.card, isOwn ? styles.cardOwn : styles.cardTheirs]}>
      <View style={styles.header}>
        <Text style={styles.headerLabel} numberOfLines={1}>
          {offer.parentOfferId ? '🔁 Gegenangebot' : '📄 Angebot'}
        </Text>
        <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
          <Text style={[styles.badgeText, { color: meta.color }]} numberOfLines={1}>
            {meta.label}
          </Text>
        </View>
      </View>

      <Text style={styles.price}>{formatEur(offer.proposedPrice)}</Text>
      <Text style={styles.scope}>{offer.scopeOfWork}</Text>

      <View style={styles.metaRow}>
        {days ? <Text style={styles.metaItem}>⏱ ca. {days} Tag{days !== 1 ? 'e' : ''}</Text> : null}
        <Text style={styles.metaItem}>📅 ab {formatDate(offer.proposedDate)}</Text>
      </View>

      {isLive && !expired ? (
        <Text style={styles.validity}>Gültig bis {formatDate(offer.validUntil)}</Text>
      ) : null}

      {isLive && expired ? (
        <Text style={styles.expiredNote}>Dieses Angebot ist abgelaufen.</Text>
      ) : null}

      {isLive && !expired ? (
        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator color={colors.primary} style={styles.busy} />
          ) : isOwn ? (
            <TouchableOpacity onPress={onWithdraw} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Zurückziehen</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={onDecline} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Ablehnen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCounter} style={[styles.btn, styles.btnOutline]}>
                <Text style={styles.btnOutlineText}>Gegenangebot</Text>
              </TouchableOpacity>
              {canAccept ? (
                <TouchableOpacity onPress={onAccept} style={[styles.btn, styles.btnPrimary]}>
                  <Text style={styles.btnPrimaryText}>Annehmen ✓</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    marginVertical: spacing.xs,
    backgroundColor: colors.surface,
    maxWidth: '92%',
  },
  cardOwn: { alignSelf: 'flex-end', borderColor: colors.primary },
  cardTheirs: { alignSelf: 'flex-start', borderColor: colors.border },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerLabel: {
    flexShrink: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  badge: {
    flexShrink: 0,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  price: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text },
  scope: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  metaItem: { fontSize: fontSize.xs, color: colors.textSecondary },
  validity: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs },
  expiredNote: { fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  busy: { flex: 1, paddingVertical: spacing.xs },
  btn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.full },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  btnOutline: { borderWidth: 1, borderColor: colors.primary },
  btnOutlineText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textInverse },
})
