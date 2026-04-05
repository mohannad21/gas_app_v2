import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { TenantProfile } from "@/lib/api";

type ProfileFormState = {
  business_name: string;
  owner_name: string;
  phone: string;
  address: string;
};

function toFormState(profile: TenantProfile): ProfileFormState {
  return {
    business_name: profile.business_name ?? "",
    owner_name: profile.owner_name ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
  };
}

export default function BusinessProfileScreen() {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [form, setForm] = useState<ProfileFormState>({
    business_name: "",
    owner_name: "",
    phone: "",
    address: "",
  });

  useEffect(() => {
    if (profile) {
      setForm(toFormState(profile));
    }
  }, [profile]);

  function updateField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    if (!profile) {
      return;
    }

    const initialForm = toFormState(profile);
    const payload = (Object.keys(form) as Array<keyof ProfileFormState>).reduce<Partial<ProfileFormState>>((acc, key) => {
      if (form[key] !== initialForm[key]) {
        acc[key] = form[key];
      }
      return acc;
    }, {});

    try {
      await updateProfile.mutateAsync(payload);
      Alert.alert("Saved", "Profile updated.");
    } catch {
      Alert.alert("Error", "Could not save profile.");
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a7ea4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()} disabled={updateProfile.isPending}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <Text style={styles.title}>Business Profile</Text>

      <TextInput
        style={styles.input}
        placeholder="Business name"
        value={form.business_name}
        onChangeText={(value) => updateField("business_name", value)}
        editable={!updateProfile.isPending}
      />
      <TextInput
        style={styles.input}
        placeholder="Owner name"
        value={form.owner_name}
        onChangeText={(value) => updateField("owner_name", value)}
        editable={!updateProfile.isPending}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone"
        keyboardType="phone-pad"
        value={form.phone}
        onChangeText={(value) => updateField("phone", value)}
        editable={!updateProfile.isPending}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Address"
        multiline
        textAlignVertical="top"
        value={form.address}
        onChangeText={(value) => updateField("address", value)}
        editable={!updateProfile.isPending}
      />

      <Pressable
        style={[styles.button, updateProfile.isPending && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={updateProfile.isPending}
      >
        {updateProfile.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#f7f7f8" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f7f7f8" },
  backButton: { alignSelf: "flex-start", marginBottom: 12 },
  backText: { fontSize: 16, color: "#0a7ea4", fontFamily: "NunitoSans-SemiBold" },
  title: { fontSize: 24, fontFamily: "NunitoSans-Bold", marginBottom: 24 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 112,
  },
  button: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "NunitoSans-Bold" },
});
