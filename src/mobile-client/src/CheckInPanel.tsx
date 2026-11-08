import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import Feather from "@expo/vector-icons/Feather";
import type {
  CheckInQrDto,
  CheckInQrStatus,
  CheckInResult,
} from "@fithub/contracts";
import { MobileApiError, mobileRequest } from "./api";
import { C } from "./theme";

const dateTime = (s: string) =>
  new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
export function CheckInPanel({
  baseUrl,
  token,
  onHome,
  onAccepted,
}: {
  baseUrl: string;
  token: string;
  onHome: () => void;
  onAccepted: () => void;
}) {
  const [qr, setQr] = useState<CheckInQrDto | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const { width } = useWindowDimensions();
  const qrSize = Math.max(120, Math.min(320, width - 116));
  const latest = useRef<CheckInQrDto | null>(null);
  const acceptedCallback = useRef(onAccepted);
  acceptedCallback.current = onAccepted;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setForeground(s === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!foreground) return;
    const timer = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(timer);
  }, [foreground]);
  useEffect(() => {
    if (!foreground) {
      setQr(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setBusy(true);
    setError("");
    const request = <T,>(path: string, options: RequestInit = {}) =>
      mobileRequest<T>(baseUrl, path, options, token);
    async function tick() {
      try {
        // Read before rotation/resume so an accepted previous QR cannot be lost.
        if (latest.current) {
          const status = await request<CheckInQrStatus>(
            `/api/check-ins/qr/${latest.current.id}/status`,
          );
          if (stopped) return;
          offset.current = Date.parse(status.serverNow) - Date.now();
          if (status.result) {
            setResult(status.result);
            if (status.result.accepted) {
              setQr(null);
              setBusy(false);
              acceptedCallback.current();
              return;
            }
          }
        }
        if (
          !latest.current ||
          Date.parse(latest.current.expiresAt) <= Date.now() + offset.current
        ) {
          setQr(null);
          const next = await request<CheckInQrDto>("/api/check-ins/qr", {
            method: "POST",
          });
          if (stopped) return;
          latest.current = next;
          offset.current = Date.parse(next.serverNow) - Date.now();
          setResult(null);
        }
        if (stopped) return;
        setQr(latest.current);
        setNow(Date.now() + offset.current);
        setBusy(false);
        timer = setTimeout(
          () => void tick(),
          Math.min(
            2000,
            Math.max(
              100,
              Date.parse(latest.current!.expiresAt) -
                Date.now() -
                offset.current,
            ),
          ),
        );
      } catch (e) {
        if (stopped) return;
        setQr(null);
        setBusy(false);
        setError(e instanceof Error ? e.message : "Không thể lấy mã QR.");
        setRetryAt(e instanceof MobileApiError ? e.body.retryAt : undefined);
        // Remain visible with an explicit retry; never show cached QR after a failed check.
      }
    }
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [baseUrl, token, foreground, attempt]);
  const seconds = qr
    ? Math.max(0, Math.ceil((Date.parse(qr.expiresAt) - now) / 1000))
    : 0;
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text accessibilityRole="header" style={s.title}>
        Thẻ vào phòng tập
      </Text>
      {result?.accepted ? (
        <View style={s.card} accessibilityLiveRegion="polite">
          <Feather name="check-circle" size={56} color={C.lime} />
          <Text style={s.title}>Check-in thành công</Text>
          <Text style={s.name}>{result.member?.displayName}</Text>
          <Text style={s.text}>{result.member?.memberCode}</Text>
          <Text style={s.text}>{result.membership?.name}</Text>
          <Text style={s.text}>{dateTime(result.checkedInAt!)}</Text>
          <Text style={s.hint}>Được phép vào tập tại quầy.</Text>
          <Text style={s.hint}>
            Có thể check-in tiếp từ {dateTime(result.retryAt!)}.
          </Text>
        </View>
      ) : (
        <View style={s.card}>
          {busy && (
            <View accessibilityLiveRegion="polite">
              <ActivityIndicator color={C.lime} />
              <Text style={s.text}>Đang kiểm tra quyền vào tập…</Text>
            </View>
          )}
          {!foreground && (
            <Text style={s.text}>Mở lại ứng dụng để lấy mã QR.</Text>
          )}
          {qr && foreground && seconds > 0 && (
            <>
              <Text style={s.name}>{qr.member.displayName}</Text>
              <Text style={s.text}>
                {qr.member.memberCode} · {qr.membership.name}
              </Text>
              <Text style={s.hint}>Mã tự động đổi sau {seconds} giây</Text>
              <View style={s.qr} testID="checkin-qr">
                <QRCode
                  value={qr.payload}
                  size={qrSize}
                  quietZone={20}
                  color="#000000"
                  backgroundColor="#ffffff"
                  ecl="M"
                />
              </View>
              <Text style={s.hint}>Đưa mã QR cho camera tại quầy lễ tân.</Text>
            </>
          )}
          {qr && seconds === 0 && (
            <Text style={s.text}>Mã đã hết hạn. Đang đổi mã mới…</Text>
          )}
          {!!error && (
            <View accessibilityLiveRegion="polite">
              <Text style={s.error}>{error}</Text>
              {retryAt && (
                <Text style={s.hint}>
                  Có thể check-in từ {dateTime(retryAt)}.
                </Text>
              )}
            </View>
          )}
          {result && !result.accepted && !error && (
            <Text style={s.error} accessibilityLiveRegion="polite">
              {result.message}
            </Text>
          )}
          {!!error && (
            <Pressable
              accessibilityRole="button"
              style={s.button}
              onPress={() => {
                setResult(null);
                setAttempt((a) => a + 1);
              }}
            >
              <Text style={s.buttonText}>Thử lại</Text>
            </Pressable>
          )}
        </View>
      )}
      <Pressable accessibilityRole="button" style={s.button} onPress={onHome}>
        <Text style={s.buttonText}>Về trang chủ</Text>
      </Pressable>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#161619" },
  content: { padding: 16, paddingBottom: 150, gap: 22 },
  title: { fontSize: 25, fontWeight: "800", color: "#fff", marginBottom: 12 },
  card: {
    backgroundColor: "#202024",
    borderRadius: 26,
    padding: 16,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#34343b",
  },
  name: { color: "#fff", fontWeight: "700", fontSize: 22, textAlign: "center" },
  text: { color: "#e5e5eb", fontSize: 16, textAlign: "center" },
  hint: { color: "#b8b8c7", fontSize: 15, textAlign: "center", lineHeight: 23 },
  qr: {
    backgroundColor: "#fff",
    padding: 4,
    borderRadius: 18,
    marginVertical: 10,
  },
  error: {
    color: "#ffb3ba",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  button: {
    minHeight: 48,
    backgroundColor: C.lime,
    borderRadius: 28,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  buttonText: { color: "#161619", fontSize: 16, fontWeight: "700" },
});
