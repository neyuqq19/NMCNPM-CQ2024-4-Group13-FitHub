import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { NotificationDto, NotificationTargetScreen } from "@fithub/contracts";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api";
import { C } from "./theme";
import type { MobileSession, ScreenId } from "./types";

// Where a notification takes the member. The PT booking screen does not exist in the app
// yet, so reminders about PT sessions open the package screen, which holds the schedule.
const TARGET: Record<NotificationTargetScreen, ScreenId> = {
  MY_PACKAGE: "02_MY_PACKAGE",
  PT_APPOINTMENTS: "02_MY_PACKAGE",
};
const FILTERS = [
  { key: "ALL", label: "Tất cả" },
  { key: "PT_REMINDER", label: "Lịch PT" },
  { key: "PACKAGE_EXPIRY", label: "Gói tập" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const when = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

export function NotificationInboxPanel({
  baseUrl,
  session,
  onBack,
  onNavigate,
}: {
  baseUrl: string;
  session: MobileSession;
  onBack: () => void;
  onNavigate: (screen: ScreenId) => void;
}) {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await getMyNotifications(baseUrl, session, {
        type: filter === "ALL" ? undefined : filter,
        pageSize: 50,
      });
      setItems(r.items);
      setUnread(r.unreadCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được thông báo.");
    } finally {
      setLoading(false);
    }
  }, [baseUrl, session.accessToken, filter]);
  useEffect(() => {
    void load();
  }, [load]);

  async function open(n: NotificationDto) {
    // Move on even if marking it read fails; the member should never be stuck here.
    if (!n.isRead) {
      try {
        const r = await markNotificationRead(baseUrl, session, n.id);
        setItems((list) => list.map((x) => (x.id === n.id ? r.notification : x)));
        setUnread(r.unreadCount);
      } catch {
        /* keep going */
      }
    }
    onNavigate(TARGET[n.targetScreen] ?? "01_HOME");
  }

  async function readAll() {
    try {
      const r = await markAllNotificationsRead(baseUrl, session);
      setItems((list) => list.map((x) => ({ ...x, isRead: true })));
      setUnread(r.unreadCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đánh dấu đã đọc.");
    }
  }

  return (
    <View style={s.root} testID="notification-inbox">
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={s.iconBtn}
          onPress={onBack}
        >
          <Feather name="chevron-left" size={24} color="white" />
        </Pressable>
        <Text style={s.title}>Thông báo</Text>
        <Text style={s.count} accessibilityLabel={`${unread} thông báo chưa đọc`}>
          {unread > 0 ? `${unread} chưa đọc` : "Đã đọc hết"}
        </Text>
      </View>
      <View style={s.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            style={[s.chip, filter === f.key && s.chipOn]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.chipText, filter === f.key && s.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          disabled={unread === 0}
          style={[s.readAll, unread === 0 && { opacity: 0.4 }]}
          onPress={() => void readAll()}
        >
          <Text style={s.readAllText}>Đánh dấu tất cả đã đọc</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={C.lime} />
        }
      >
        {error ? (
          <View accessibilityLiveRegion="polite">
            <Text style={s.error}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()}>
              <Text style={s.retry}>Thử lại</Text>
            </Pressable>
          </View>
        ) : null}
        {loading && items.length === 0 ? <ActivityIndicator color={C.lime} /> : null}
        {!loading && !error && items.length === 0 ? (
          <Text style={s.empty}>Chưa có thông báo nào.</Text>
        ) : null}
        {items.map((n) => (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            accessibilityLabel={`${n.isRead ? "" : "Chưa đọc. "}${n.title}`}
            style={[s.row, !n.isRead && s.rowUnread]}
            onPress={() => void open(n)}
          >
            <View style={[s.dot, { backgroundColor: n.isRead ? "transparent" : C.lime }]} />
            <View style={[s.icon, { backgroundColor: n.type === "PT_REMINDER" ? C.lavender : C.lilac }]}>
              <Feather
                name={n.type === "PT_REMINDER" ? "calendar" : "clock"}
                size={18}
                color={C.ink}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, n.isRead && s.rowTitleRead]}>{n.title}</Text>
              <Text style={s.rowBody}>{n.body}</Text>
              <Text style={s.rowTime}>{when(n.createdAt)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#121215" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#242429",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "white", fontSize: 22, fontWeight: "800", flex: 1 },
  count: { color: C.mutedOnDark, fontSize: 13, fontWeight: "600" },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  chip: {
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 13,
    backgroundColor: "#242429",
  },
  chipOn: { backgroundColor: C.lime },
  chipText: { color: "white", fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: C.ink },
  readAll: { paddingVertical: 7, paddingHorizontal: 4 },
  readAllText: { color: C.lime, fontWeight: "700", fontSize: 13 },
  list: { padding: 16, gap: 10, width: "100%", maxWidth: 720, alignSelf: "center" },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#1B1B22",
    borderWidth: 1,
    borderColor: "#2E2E38",
  },
  rowUnread: { borderColor: C.lime, backgroundColor: "#20241A" },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: "white", fontWeight: "800", fontSize: 15 },
  rowTitleRead: { fontWeight: "600", color: "#C9C9D2" },
  rowBody: { color: "#AAA9B2", fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowTime: { color: C.mutedOnDark, fontSize: 12, marginTop: 6 },
  empty: { color: C.mutedOnDark, textAlign: "center", marginTop: 40 },
  error: { color: C.coral, fontWeight: "600" },
  retry: { color: C.lime, fontWeight: "700", marginTop: 6 },
});
