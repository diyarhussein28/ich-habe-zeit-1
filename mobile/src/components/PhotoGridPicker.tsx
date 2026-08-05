import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { mediaApi, type MediaContext } from '../api/media.api'
import { colors, spacing, fontSize, fontWeight, radius } from '../constants/theme'

interface PhotoGridPickerProps {
  urls: string[]
  onChange: (urls: string[]) => void
  context: MediaContext
  maxPhotos?: number
}

export function PhotoGridPicker({ urls, onChange, context, maxPhotos = 10 }: PhotoGridPickerProps) {
  const [uploading, setUploading] = useState(false)

  async function pickAndUpload() {
    if (urls.length >= maxPhotos) return

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Zugriff benötigt', 'Bitte erlaube den Zugriff auf deine Fotos in den Einstellungen.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setUploading(true)
    try {
      const url = await mediaApi.upload(context, asset.uri, asset.mimeType ?? 'image/jpeg')
      onChange([...urls, url])
    } catch {
      Alert.alert('Fehler', 'Foto konnte nicht hochgeladen werden.')
    } finally {
      setUploading(false)
    }
  }

  function removePhoto(url: string) {
    onChange(urls.filter((u) => u !== url))
  }

  return (
    <View>
      <View style={styles.grid}>
        {urls.map((url) => (
          <View key={url} style={styles.thumbWrapper}>
            <Image source={{ uri: url }} style={styles.thumb} />
            <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(url)} activeOpacity={0.8}>
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {urls.length < maxPhotos && (
          <TouchableOpacity style={styles.addTile} onPress={pickAndUpload} disabled={uploading} activeOpacity={0.7}>
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.addIcon}>+</Text>
                <Text style={styles.addLabel}>Foto</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.hint}>{urls.length} / {maxPhotos} Fotos</Text>
    </View>
  )
}

const TILE = 84

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrapper: { width: TILE, height: TILE, borderRadius: radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.border },
  removeBtn: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: colors.textInverse, fontSize: 11, fontWeight: fontWeight.bold, lineHeight: 12 },
  addTile: {
    width: TILE, height: TILE, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background,
  },
  addIcon: { fontSize: 24, color: colors.primary, lineHeight: 26 },
  addLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  hint: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs },
})
