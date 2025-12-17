import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";

export default function SystemDetailsScreen() {
  const { id } = useLocalSearchParams();

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>System Details</Text>
      <Text>ID: {id}</Text>
    </View>
  );
}
