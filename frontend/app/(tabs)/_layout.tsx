import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function TabsLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const tint = Colors[colorScheme].tint;
  const inactive = Colors[colorScheme].tabIconDefault;

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#e5e7eb", height: 64, paddingBottom: 8, paddingTop: 8 },
        tabBarShowLabel: false,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: inactive,
        tabBarIconStyle: { marginBottom: 0 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="chart-bar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="customers-home"
        options={{
          title: "Customers",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-multiple-plus-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add/index"
        options={{
          title: "New",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cylinder" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports/index"
        options={{
          title: "Daily",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account/index"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account/change-password"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account/business-profile"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account/configuration/prices"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account/configuration/system-types"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account/configuration/expense-categories"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account/plan-billing"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account/workers"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
