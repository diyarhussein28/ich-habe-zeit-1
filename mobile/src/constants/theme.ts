export const colors = {
  primary: '#1A56DB',
  primaryDark: '#1046B8',
  primaryLight: '#EBF1FD',
  secondary: '#10B981',
  secondaryLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderFocus: '#1A56DB',
  text: '#0F172A',
  textSecondary: '#64748B',
  textDisabled: '#94A3B8',
  textInverse: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.5)',
  star: '#F59E0B',
  statusOpen: '#10B981',
  statusPending: '#F59E0B',
  statusClosed: '#94A3B8',
  statusDisputed: '#EF4444',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
}

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
}

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
}

// High-contrast palette override, used by getAccessibleColors() when the
// user has enabled "Hoher Kontrast" in Barrierefreiheit settings.
const highContrastOverrides: Partial<typeof colors> = {
  text: '#000000',
  textSecondary: '#1A1A1A',
  textDisabled: '#4A4A4A',
  border: '#000000',
  borderFocus: '#000000',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  primary: '#0B3D91',
  primaryDark: '#062A66',
  primaryLight: '#D6E4FF',
}

export function getAccessibleColors(highContrast: boolean): typeof colors {
  return highContrast ? { ...colors, ...highContrastOverrides } : colors
}

export const LARGE_TEXT_SCALE = 1.2

export function scaleFont(base: number, largeText: boolean): number {
  return largeText ? Math.round(base * LARGE_TEXT_SCALE) : base
}

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
}
