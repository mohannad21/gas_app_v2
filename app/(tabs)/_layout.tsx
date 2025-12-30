import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabsLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const tint = Colors[colorScheme].tint;
  const inactive = Colors[colorScheme].tabIconDefault;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#e5e7eb", height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarShowLabel: true,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: inactive,
        tabBarLabelStyle: { fontWeight: "700", fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Activity", tabBarIcon: ({ color }) => <Ionicons name="list-outline" size={20} color={color} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color }) => <Ionicons name="speedometer-outline" size={20} color={color} /> }} />
      <Tabs.Screen name="customers" options={{ title: "Customers", tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={20} color={color} /> }} />
      <Tabs.Screen name="add/index" options={{ title: "Add", tabBarIcon: ({ color }) => <Ionicons name="add-circle-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="reports/index" options={{ title: "Daily", tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={20} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({});
