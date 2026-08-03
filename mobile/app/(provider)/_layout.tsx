import { Text } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontSize } from '../../src/constants/theme'

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
}

export default function ProviderLayout() {
  const insets = useSafeAreaInsets()
  return (
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
          title: 'Jobbörse',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📌" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="offers/index"
        options={{
          title: 'Angebote',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📝" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Aufträge',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔧" focused={focused} />,
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
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
      {/* Hidden — navigable via header buttons */}
      <Tabs.Screen name="requests/index" options={{ href: null }} />
      <Tabs.Screen name="listings/index" options={{ href: null }} />
      <Tabs.Screen name="listings/create" options={{ href: null }} />
    </Tabs>
  )
}
