import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MyCheckInSummaryDto } from "@fithub/contracts";
import type { MobileSession, MyMembershipSummary, ScreenId } from "./types";
import {
  getMyCheckInSummary,
  getMyNotifications,
  refreshMyMembership,
} from "./api";
const lime = "#DFFF63";
const states: Record<string, string> = {
  NONE: "Chưa có gói",
  ACTIVE: "Đang hoạt động",
  EXPIRED: "Đã hết hạn",
  SCHEDULED: "Chưa đến ngày",
  PENDING_PAYMENT: "Chờ thanh toán",
  FROZEN: "Đang bảo lưu",
  CANCELLED: "Đã hủy",
};
export function HomePanel({
  session,
  baseUrl,
  progressRequest,
  onNavigate,
}: {
  session: MobileSession;
  baseUrl: string;
  progressRequest: number;
  onNavigate: (screen: ScreenId) => void;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const progressY = useRef(0);
  const [active, setActive] = useState(0);
  const [membership, setMembership] = useState<MyMembershipSummary | null>(
    null,
  );
  const [summary, setSummary] = useState<MyCheckInSummaryDto | null>(null);
  // UC16: unread count shown as a badge on the bell. A failure just hides the badge.
  const [unread, setUnread] = useState(0);
  const [errors, setErrors] = useState({ membership: "", progress: "" });
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  async function refresh() {
    const id = ++generation.current;
    setLoading(true);
    setErrors({ membership: "", progress: "" });
    await Promise.allSettled([
      refreshMyMembership(baseUrl, session)
        .then((v) => {
          if (generation.current === id) setMembership(v);
        })
        .catch((e) => {
          if (generation.current === id)
            setErrors((v) => ({
              ...v,
              membership: e.message || "Không tải được gói tập.",
            }));
        }),
      getMyNotifications(baseUrl, session, { pageSize: 1 })
        .then((v) => {
          if (generation.current === id) setUnread(v.unreadCount);
        })
        .catch(() => {
          if (generation.current === id) setUnread(0);
        }),
      getMyCheckInSummary(baseUrl, session)
        .then((v) => {
          if (generation.current === id) setSummary(v);
        })
        .catch((e) => {
          if (generation.current === id)
            setErrors((v) => ({
              ...v,
              progress: e.message || "Không tải được tiến độ.",
            }));
        }),
    ]);
    if (generation.current === id) setLoading(false);
  }
  useEffect(() => {
    void refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      generation.current++;
      listener.remove();
    };
  }, [baseUrl, session.accessToken]);
  function showProgress() {
    setActive(1);
    scroll.current?.scrollTo({ y: progressY.current, animated: true });
  }
  useEffect(() => {
    if (progressRequest) showProgress();
  }, [progressRequest]);
  const m = membership;
  const remaining = Math.max(0, m?.daysRemaining ?? 0);
  const fraction = m?.totalDays ? Math.min(1, remaining / m.totalDays) : 0;
  function failure(message: string) {
    return (
      <View accessibilityLiveRegion="polite">
        <Text style={s.error}>{message}</Text>
        <Pressable accessibilityRole="button" onPress={() => void refresh()}>
          <Text style={s.retry}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={s.root}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[s.content, { paddingBottom: 30 }]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={lime}
          />
        }
      >
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem hồ sơ cá nhân"
            style={s.avatar}
            onPress={() => onNavigate("09_PROFILE")}
          >
            <Feather name="user" size={29} color="white" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>XIN CHÀO,</Text>
            <Text style={s.name}>{session.user.displayName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"
            }
            style={s.bell}
            onPress={() => onNavigate("11_NOTIFICATIONS")}
          >
            <Feather name="bell" size={24} color="white" />
            {unread > 0 ? (
              <View style={s.bellBadge} testID="notification-badge">
                <Text style={s.bellBadgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <Pressable
          style={[s.card, { backgroundColor: lime }]}
          accessibilityRole="button"
          onPress={() => onNavigate("02_MY_PACKAGE")}
        >
          <Text style={s.eyebrow}>GÓI TẬP HIỆN TẠI</Text>
          {errors.membership ? (
            failure(errors.membership)
          ) : !m ? (
            <ActivityIndicator color="#151519" />
          ) : (
            <>
              <View style={s.badge}>
                <Text style={s.badgeText}>
                  {states[m.state] || "Chưa xác định"}
                </Text>
              </View>
              <Text style={s.packageName}>
                {m.packageName || "Chưa có gói tập"}
              </Text>
              {m.state === "ACTIVE" && (
                <Text style={s.remaining}>
                  {remaining}
                  <Text style={s.days}> ngày còn lại</Text>
                </Text>
              )}
              <Text style={s.meta}>
                {m.allowedHoursLabel || "Liên hệ quầy lễ tân để được hỗ trợ."}
              </Text>
              {m.state === "ACTIVE" && (
                <>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${fraction * 100}%` }]} />
                  </View>
                  <View style={s.between}>
                    <Text style={s.meta}>Thời gian còn lại</Text>
                    <Text style={s.meta}>
                      {remaining} / {m.totalDays} ngày
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </Pressable>
        <Text style={s.section}>Truy cập nhanh</Text>
        <View style={[s.card, { backgroundColor: "#C2B3FA" }]}>
          <Text style={s.title}>Mã QR vào phòng tập</Text>
          <View style={s.qrInner}>
            <Feather name="grid" size={48} color="white" />
            <Text style={s.qrTitle}>Check-in phòng tập</Text>
            <Text style={s.qrHint}>Mã QR tự động làm mới mỗi 20 giây</Text>
            <Pressable
              accessibilityRole="button"
              style={s.button}
              onPress={() => onNavigate("03_QR_CODE")}
            >
              <Text style={s.buttonText}>Hiển thị mã QR →</Text>
            </Pressable>
          </View>
        </View>
        <View
          onLayout={(e) => {
            progressY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={s.section}>Tiến độ tập luyện</Text>
          <View style={[s.card, { backgroundColor: "#E4C8F5" }]}>
            <Text style={s.title}>Trong tháng này</Text>
            {errors.progress ? (
              failure(errors.progress)
            ) : !summary ? (
              <ActivityIndicator color="#151519" />
            ) : (
              <>
                <Text style={s.remaining}>
                  {summary.sessionsThisMonth}
                  <Text style={s.days}> buổi tập</Text>
                </Text>
                <View style={s.between}>
                  <Text style={s.meta}>Đã tập trong tuần</Text>
                  <Text style={s.meta}>
                    {summary.week.reduce((n, d) => n + d.count, 0)} buổi
                  </Text>
                </View>
                <View style={s.week}>
                  {summary.week.map((day, i) => (
                    <View
                      key={day.date}
                      style={{ flex: 1, alignItems: "center", gap: 8 }}
                      accessibilityLabel={`${day.date}: ${day.count} lượt check-in`}
                    >
                      <View
                        style={[
                          s.day,
                          day.count > 0 && { backgroundColor: "#7953D3" },
                        ]}
                      >
                        {day.count > 0 && (
                          <Feather name="check" size={22} color="white" />
                        )}
                      </View>
                      <Text style={s.meta}>
                        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[s.meta, { marginTop: 20 }]}>
                  Cập nhật từ check-in đã xác nhận tại quầy.
                </Text>
              </>
            )}
          </View>
        </View>
      </ScrollView>
      <View style={[s.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {(["home", "bar-chart-2", "grid", "user"] as const).map((icon, i) => (
          <Pressable
            key={icon}
            accessibilityRole="button"
            accessibilityState={{ selected: active === i }}
            accessibilityLabel={["Trang chủ", "Tiến độ", "Mã QR", "Cá nhân"][i]}
            style={[s.tab, active === i && s.selected]}
            onPress={() => {
              if (i === 0) {
                setActive(0);
                scroll.current?.scrollTo({ y: 0 });
              } else if (i === 1) showProgress();
              else onNavigate(i === 2 ? "03_QR_CODE" : "09_PROFILE");
            }}
          >
            <Feather
              name={icon}
              size={24}
              color={active === i ? lime : "#B9B8C3"}
            />
            <Text
              style={{
                color: active === i ? lime : "#B9B8C3",
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {["Trang chủ", "Tiến độ", "Mã QR", "Cá nhân"][i]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#121215" },
  content: { padding: 16, width: "100%", maxWidth: 720, alignSelf: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 12,
    marginBottom: 26,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#242429",
    borderWidth: 1,
    borderColor: lime,
    alignItems: "center",
    justifyContent: "center",
  },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#242429",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#FF4D5E",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: { color: "white", fontSize: 11, fontWeight: "800" },
  greeting: { color: "#AAA9B2", fontSize: 13 },
  name: { color: "white", fontSize: 23, fontWeight: "800", marginTop: 4 },
  card: { borderRadius: 25, padding: 20, gap: 12 },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: "800",
    color: "#485322",
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 24,
    backgroundColor: "#20291B",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  badgeText: { color: lime, fontWeight: "700", fontSize: 12 },
  packageName: { color: "#121215", fontSize: 28, fontWeight: "900" },
  remaining: { color: "#121215", fontSize: 52, fontWeight: "900" },
  days: { fontSize: 18, fontWeight: "700" },
  meta: { color: "#554D65", fontSize: 13, flexShrink: 1 },
  track: {
    height: 8,
    borderRadius: 6,
    backgroundColor: "#B6CC53",
    overflow: "hidden",
    marginTop: 8,
  },
  fill: { height: "100%", backgroundColor: "#20291B", borderRadius: 6 },
  between: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  section: {
    color: "white",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 25,
    marginBottom: 16,
  },
  title: { color: "#191622", fontWeight: "800", fontSize: 23 },
  qrInner: {
    backgroundColor: "#24202E",
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
    gap: 16,
    marginTop: 8,
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "white",
    textAlign: "center",
  },
  qrHint: { color: "#C6BED8", fontSize: 13, textAlign: "center" },
  button: {
    backgroundColor: lime,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    padding: 12,
  },
  buttonText: { color: "#151519", fontWeight: "800", fontSize: 16 },
  week: { flexDirection: "row", gap: 6, marginTop: 6 },
  day: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: 64,
    backgroundColor: "#D5B4E7",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dock: {
    flexDirection: "row",
    backgroundColor: "#28272E",
    paddingTop: 8,
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
  error: { color: "#7C2424", fontSize: 14 },
  retry: { color: "#282035", fontWeight: "800", paddingVertical: 12 },
});
