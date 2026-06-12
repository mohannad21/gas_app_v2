import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { SuccessPulse } from "@/components/SuccessPulse";
import { Toast } from "@/components/Toast";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useSystemSettings } from "@/hooks/useSystemSettings";

const queryClient = new QueryClient();

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
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
            <InitializationGuard />
            <Stack screenOptions={{ headerShown: false }} />
            <Toast />
            <SuccessPulse />
          </SafeAreaView>
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function InitializationGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    const inAuth = segments[0] === "login";

    if (!isAuthenticated) {
      if (!inAuth) router.replace("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router, segments]);

  if (authLoading || !isAuthenticated) {
    return null;
  }

  return <AuthenticatedInitializationGuard />;
}

function AuthenticatedInitializationGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { mustChangePassword } = useAuth();
  const { data, isLoading: settingsLoading } = useSystemSettings();

  useEffect(() => {
    const inAuth = segments[0] === "login";
    if (mustChangePassword) {
      if (segments[0] !== "force-change-password") {
        router.replace("/force-change-password");
      }
      return;
    }
    if (settingsLoading || !data) return;

    const inWelcome = segments[0] === "welcome";
    const isSetupCompleted = data.is_setup_completed;

    if (!isSetupCompleted && !inWelcome) {
      router.replace("/welcome");
      return;
    }

    if (isSetupCompleted && (inWelcome || inAuth)) {
      router.replace("/(tabs)/reports");
    }
  }, [mustChangePassword, data?.is_setup_completed, settingsLoading, router, segments]);

  return null;
}
