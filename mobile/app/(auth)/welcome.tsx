import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../../src/components/ui/Button'
import { colors, spacing, fontSize, fontWeight } from '../../src/constants/theme'

const { width } = Dimensions.get('window')

const slides = [
  {
    id: '1',
    emoji: '🛠️',
    title: 'Finde den richtigen\nDienstleister',
    subtitle: 'Poste deine Aufgabe und erhalte Angebote von verifizierten Profis in deiner Nähe.',
  },
  {
    id: '2',
    emoji: '🔒',
    title: 'Sicher bezahlen\nmit Treuhand',
    subtitle: 'Dein Geld ist geschützt – es wird erst freigegeben, wenn du mit der Arbeit zufrieden bist.',
  },
  {
    id: '3',
    emoji: '⭐',
    title: 'Bewertetes\nNetzwerk',
    subtitle: 'Alle Dienstleister sind verifiziert und bewertet. Du siehst echte Bewertungen vor der Buchung.',
  },
]

export default function WelcomeScreen() {
  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const router = useRouter()

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width)
    setActiveIndex(idx)
  }

  const goNext = () => {
    if (activeIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 })
    }
  }

  const isLast = activeIndex === slides.length - 1

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Logo area */}
        <View style={styles.header}>
          <Text style={styles.logo}>Ich habe Zeit</Text>
          <Text style={styles.tagline}>Der Marktplatz für Dienstleistungen</Text>
        </View>

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <Text style={styles.slideEmoji}>{item.emoji}</Text>
              <Text style={styles.slideTitle}>{item.title}</Text>
              <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
            </View>
          )}
        />

        {/* Dots */}
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex ? styles.dotActive : null]}
            />
          ))}
        </View>

        {/* CTA Buttons */}
        <View style={styles.actions}>
          {isLast ? (
            <>
              <Button
                label="Jetzt registrieren"
                onPress={() => router.push('/(auth)/register')}
              />
              <Button
                label="Bereits ein Konto? Anmelden"
                variant="ghost"
                onPress={() => router.push('/(auth)/login')}
                style={styles.loginBtn}
              />
            </>
          ) : (
            <>
              <Button label="Weiter" onPress={goNext} />
              <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.skipBtn}>
                <Text style={styles.skipText}>Überspringen</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: spacing.lg },
  header: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg },
  logo: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    letterSpacing: -0.5,
  },
  tagline: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  slide: {
    width: width - spacing.lg * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  slideEmoji: { fontSize: 72, marginBottom: spacing.lg },
  slideTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: spacing.md,
  },
  slideSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  actions: { paddingBottom: spacing.xl, gap: spacing.sm },
  loginBtn: { marginTop: 0 },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { fontSize: fontSize.sm, color: colors.textSecondary },
})
