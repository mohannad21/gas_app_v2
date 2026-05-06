import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/useColorScheme";

type TabIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function BottomTabIcon({
  name,
  color,
  size,
  focused,
  accent = false,
}: {
  name: TabIconName;
  color: string;
  size: number;
  focused: boolean;
  accent?: boolean;
}) {
  return (
    <View style={[styles.iconShell, focused && styles.iconShellActive, accent && styles.iconShellAccent]}>
      <MaterialCommunityIcons name={name} size={accent ? size + 3 : size} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const tint = Colors[colorScheme].tint;
  const inactive = Colors[colorScheme].tabIconDefault;

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "#e5e7eb",
          height: 68,
          paddingBottom: 8,
          paddingTop: 8,
        },
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
          tabBarIcon: ({ color, size, focused }) => (
            <BottomTabIcon name="chart-box-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers-home"
        options={{
          title: "Customers",
          tabBarIcon: ({ color, size, focused }) => (
            <BottomTabIcon name="account-group-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="add/index"
        options={{
          title: "New",
          tabBarIcon: ({ color, size, focused }) => (
            <BottomTabIcon name="note-plus-outline" color={color} size={size} focused={focused} accent />
          ),
        }}
      />
      <Tabs.Screen
        name="reports/index"
        options={{
          title: "Daily",
          tabBarIcon: ({ color, size, focused }) => (
            <BottomTabIcon name="calendar-month-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account/index"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size, focused }) => (
            <BottomTabIcon name="account-outline" color={color} size={size} focused={focused} />
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
        name="account/configuration/currency-settings"
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

const styles = StyleSheet.create({
  iconShell: {
    minWidth: 38,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconShellActive: {
    backgroundColor: "rgba(10, 126, 164, 0.12)",
  },
  iconShellAccent: {
    minWidth: 42,
  },
});
