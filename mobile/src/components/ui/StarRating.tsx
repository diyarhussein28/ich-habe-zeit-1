import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { colors, spacing } from '../../constants/theme'

interface StarRatingProps {
  value: number
  maxStars?: number
  onPress?: (rating: number) => void
  size?: number
}

export function StarRating({ value, maxStars = 5, onPress, size = 24 }: StarRatingProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: maxStars }, (_, i) => {
        const filled = i < Math.round(value)
        return onPress ? (
          <TouchableOpacity key={i} onPress={() => onPress(i + 1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={{ fontSize: size, color: filled ? colors.star : colors.border }}>★</Text>
          </TouchableOpacity>
        ) : (
          <Text key={i} style={{ fontSize: size, color: filled ? colors.star : colors.border }}>★</Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
})
