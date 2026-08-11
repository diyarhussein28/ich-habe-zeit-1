import { Text, View } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontSize } from '../../src/constants/theme'
import { useAuthStore } from '../../src/store/auth.store'
import { RoleSwitchFab } from '../../src/components/ui/RoleSwitchFab'

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
}

export default function CustomerLayout() {
  const insets = useSafeAreaInsets()
  const role = useAuthStore((s) => s.user?.role)
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingBottom: insets.bottom + 4,
            paddingTop: 4,
            height: 60 + insets.bottom,
          },
          tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '500' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Entdecken',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="requests"
          options={{
            title: 'Aufträge',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Buchungen',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="messages/index"
          options={{
            title: 'Nachrichten',
            tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile/index"
          options={{
            title: 'Profil',
            tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
          }}
        />
        {/* Hidden routes — navigable but not shown in tab bar */}
        <Tabs.Screen name="browse/[categoryId]" options={{ href: null }} />
        <Tabs.Screen name="listings/index" options={{ href: null }} />
        <Tabs.Screen name="listings/[id]" options={{ href: null }} />
        <Tabs.Screen name="profile/invoices" options={{ href: null }} />
      </Tabs>
      {role === 'PROVIDER' ? (
        <RoleSwitchFab
          label="Dienstleister-Modus"
          emoji="🔧"
          href="/(provider)"
          bottomOffset={60 + insets.bottom + 12}
        />
      ) : (
        <RoleSwitchFab
          label="Werde Dienstleister"
          emoji="🔧"
          href="/become-provider"
          replace={false}
          bottomOffset={60 + insets.bottom + 12}
        />
      )}
    </View>
  )
}
