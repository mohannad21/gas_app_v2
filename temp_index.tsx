import { useEffect, useMemo, useState } from "react";
import { FlatList, View, Text, StyleSheet, TextInput, Pressable, Platform } from "react-native";
import { useActivities } from "@/hooks/useActivities";
import { useCustomers } from "@/hooks/useCustomers";
import { useLocalSearchParams, useRouter } from "expo-router";

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const typeLabel: Record<string, string> = {
  order: "Order",
  customer: "Customer",
  price: "Price",
  system: "System",
  inventory: "Inventory",
};

const actionStyleMap: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
};

export default function ActivityScreen() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useActivities(search);
  const customersQuery = useCustomers();
  const customers = customersQuery.data ?? [];
  const params = useLocalSearchParams();
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const param = Array.isArray(params.flash) ? params.flash[0] : params.flash;
    if (!param) return;
    const message =
      param === "order-created"
        ? "Order created"
        : param === "customer-created"
          ? "Customer created"
          : null;
