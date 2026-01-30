import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Toast } from "@/components/Toast";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useSystemSettings } from "@/hooks/useSystemSettings";

const queryClient = new QueryClient();
const GLOBAL_ACCESSORY_ID = "globalDoneAccessory";

if (Platform.OS === "ios") {
  TextInput.defaultProps = {
    ...(TextInput.defaultProps ?? {}),
    inputAccessoryViewID: GLOBAL_ACCESSORY_ID,
  };
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "NunitoSans-Regular": require("../assets/fonts/NunitoSans-Regular.ttf"),
    "NunitoSans-SemiBold": require("../assets/fonts/NunitoSans-SemiBold.ttf"),
    "NunitoSans-Bold": require("../assets/fonts/NunitoSans-Bold.ttf"),
    "NunitoSans-ExtraBold": require("../assets/fonts/NunitoSans-ExtraBold.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <InitializationGuard />
          <Stack screenOptions={{ headerShown: false }} />
          <Toast />
          {Platform.OS === "ios" && (
            <InputAccessoryView nativeID={GLOBAL_ACCESSORY_ID}>
              <View style={styles.accessoryRow}>
                <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
                  <Text style={styles.accessoryText}>Done</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          )}
        </SafeAreaView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function InitializationGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { data, isLoading } = useSystemSettings();

  useEffect(() => {
    if (isLoading || !data) return;
    const inWelcome = segments[0] === "welcome";
    const isSetupCompleted = data.is_setup_completed;
    if (!isSetupCompleted && !inWelcome) {
      router.replace("/welcome");
      return;
    }
    if (isSetupCompleted && inWelcome) {
      router.replace("/(tabs)/reports");
    }
  }, [data?.is_setup_completed, isLoading, router, segments]);

  return null;
}

const styles = StyleSheet.create({
  accessoryRow: {
    backgroundColor: "#f1f5f9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5f5",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  accessoryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
