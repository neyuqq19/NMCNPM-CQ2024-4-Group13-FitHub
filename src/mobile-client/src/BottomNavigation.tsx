import Feather from "@expo/vector-icons/Feather";
import { Pressable, StyleSheet, Text, View } from "react-native";

const lime = "#DFFF63";
const tabs = [
  { icon: "home", label: "Trang chủ" },
  { icon: "bar-chart-2", label: "Tiến độ" },
  { icon: "grid", label: "Mã QR" },
  { icon: "user", label: "Cá nhân" },
] as const;

export function BottomNavigation({
  activeIndex,
  onSelectTab,
}: {
  activeIndex: number;
  onSelectTab: (index: number) => void;
}) {
  return (
    <View style={styles.dock}>
      {tabs.map(({ icon, label }, index) => {
        const selected = index === activeIndex;
        const color = selected ? lime : "#B9B8C3";
        return (
          <Pressable
            key={icon}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[styles.tab, selected && styles.selected]}
            onPress={() => onSelectTab(index)}
          >
            <Feather name={icon} size={24} color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    backgroundColor: "#28272E",
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderColor: "#3B3A41",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
  },
  selected: { backgroundColor: "#3B3B42" },
  label: { fontSize: 12, fontWeight: "700" },
});
