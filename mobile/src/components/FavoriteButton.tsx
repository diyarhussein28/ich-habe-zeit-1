import React from 'react'
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { favoritesApi } from '../api/favorites.api'
import { colors, radius } from '../constants/theme'

interface FavoriteButtonProps {
  targetId: string
  type: 'provider' | 'listing'
  size?: number
}

/** Heart toggle for saving a provider or listing. Reads/writes the shared favorites list. */
export function FavoriteButton({ targetId, type, size = 20 }: FavoriteButtonProps) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['favorites-mine'],
    queryFn: () => favoritesApi.getMine().then((r) => r.data),
    staleTime: 30000,
  })

  const isFavorited =
    type === 'provider'
      ? (data?.providers ?? []).some((p) => p.id === targetId)
      : (data?.listings ?? []).some((l) => l.id === targetId)

  const mutation = useMutation({
    mutationFn: () =>
      isFavorited
        ? type === 'provider'
          ? favoritesApi.removeProvider(targetId)
          : favoritesApi.removeListing(targetId)
        : type === 'provider'
          ? favoritesApi.addProvider(targetId)
          : favoritesApi.addListing(targetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites-mine'] }),
  })

  return (
    <TouchableOpacity
      style={[styles.btn, isFavorited && styles.btnActive]}
      onPress={() => mutation.mutate()}
      disabled={mutation.isPending}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {mutation.isPending ? (
        <ActivityIndicator size="small" color={isFavorited ? colors.error : colors.textSecondary} />
      ) : (
        <Text style={{ fontSize: size }}>{isFavorited ? '❤️' : '🤍'}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: { borderColor: colors.error },
})
