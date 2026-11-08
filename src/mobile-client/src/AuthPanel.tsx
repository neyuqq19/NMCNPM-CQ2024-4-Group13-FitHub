import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { C } from "./theme";
import Feather from "@expo/vector-icons/Feather";
import {
  EmailVerification,
  MobileApiError,
  loginMobile,
  registerMobile,
  resendEmailOtp,
  verifyEmailOtp,
} from "./api";
import type { MobileSession } from "./types";
export function AuthPanel({
  baseUrl,
  onAuthenticated,
}: {
  baseUrl: string;
  onAuthenticated: (value: MobileSession) => Promise<void>;
}) {
  const [mode, setMode] = useState<"LOGIN" | "REGISTER" | "VERIFY">("LOGIN");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [verification, setVerification] = useState<EmailVerification | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const [lockedUntil, setLockedUntil] = useState(0);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  function revealFocusedInput() {
    if (Platform.OS === "web" || !Keyboard.isVisible()) return;
    const focused = TextInput.State.currentlyFocusedInput();
    if (focused)
      scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
        focused,
        24,
        true,
      );
  }
  useEffect(() => {
    const subscription = Keyboard.addListener(
      "keyboardDidShow",
      revealFocusedInput,
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (mode === "VERIFY") codeRef.current?.focus();
  }, [mode]);
  const remaining = verification
    ? Math.max(
        0,
        Math.ceil((new Date(verification.resendAt).getTime() - now) / 1000),
      )
    : 0;
  useEffect(() => {
    setNow(Date.now());
  }, [verification]);
  const expired = verification
    ? new Date(verification.expiresAt).getTime() <= now
    : false;
  const lockRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  function fail(e: unknown) {
    const message =
      e instanceof Error ? e.message : "Không thể hoàn tất yêu cầu.";
    setError(message);
    if (e instanceof MobileApiError) {
      if (e.body.retryAt) setLockedUntil(Date.parse(e.body.retryAt));
      if (e.body.verification) {
        setVerification(e.body.verification);
        setMode("VERIFY");
      }
    }
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function switchMode(next: "LOGIN" | "REGISTER") {
    if (busy || mode === next) return;
    setMode(next);
    setVisible({});
    setError("");
    setNotice("");
    setPassword("");
    setConfirmation("");
    setCode("");
    setVerification(null);
    setLockedUntil(0);
  }
  async function submit() {
    if (mode === "LOGIN") {
      if (!identifier.trim() || !password) {
        setError("Nhập email/số điện thoại và mật khẩu.");
        return;
      }
      await run(async () => {
        await onAuthenticated(await loginMobile(baseUrl, identifier, password));
        setPassword("");
      });
      return;
    }
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setError("Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số.");
      return;
    }
    if (password !== confirmation) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (mode === "REGISTER") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Địa chỉ email không hợp lệ.");
        return;
      }
      await run(async () => {
        const result = await registerMobile(
          baseUrl,
          email.trim().toLowerCase(),
          password,
          confirmation,
          name.trim() || undefined,
        );
        setVerification(result);
        setMode("VERIFY");
        setNotice("");
      });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Nhập đủ 6 chữ số xác minh.");
      codeRef.current?.focus();
      return;
    }
    if (verification)
      await run(async () => {
        await verifyEmailOtp(
          baseUrl,
          verification.verificationId,
          code,
          password,
          confirmation,
        );
        setIdentifier(email.trim().toLowerCase());
        setMode("LOGIN");
        setVisible({});
        setNotice(
          "Xác minh thành công! Hãy đăng nhập bằng mật khẩu đã đăng ký.",
        );
        setPassword("");
        setConfirmation("");
        setCode("");
        setVerification(null);
      });
  }
  function input(
    label: string,
    value: string,
    setValue: (value: string) => void,
    secret = false,
  ) {
    return (
      <View style={s.inputBox}>
        <Text style={s.label}>{label}</Text>
        <View style={s.inputRow}>
          <TextInput
            onFocus={() => requestAnimationFrame(revealFocusedInput)}
            accessibilityLabel={label}
            style={[s.input, s.fieldInput]}
            value={value}
            onChangeText={setValue}
            secureTextEntry={secret && !visible[label]}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            keyboardType={
              !secret && label.toLowerCase().includes("email")
                ? "email-address"
                : "default"
            }
            autoComplete={
              secret
                ? mode === "REGISTER"
                  ? "new-password"
                  : "current-password"
                : label === "Email"
                  ? "email"
                  : "off"
            }
          />
          {secret && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${visible[label] ? "Ẩn" : "Hiện"} ${label.toLocaleLowerCase("vi-VN")}`}
              accessibilityState={{
                selected: !!visible[label],
                disabled: busy,
              }}
              disabled={busy}
              onPress={() =>
                setVisible((current) => ({
                  ...current,
                  [label]: !current[label],
                }))
              }
              style={s.eyeButton}
            >
              <Feather
                name={visible[label] ? "eye-off" : "eye"}
                size={21}
                color={C.inkSoft}
                accessible={false}
              />
            </Pressable>
          )}
        </View>
      </View>
    );
  }
  return (
    <ScrollView
      ref={scrollRef}
      onLayout={() => requestAnimationFrame(revealFocusedInput)}
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      contentContainerStyle={s.content}
    >
      <View
        style={s.tabs}
        accessibilityRole="tablist"
        accessibilityLabel="Chọn đăng nhập hoặc đăng ký"
      >
        {(["LOGIN", "REGISTER"] as const).map((next) => {
          const selected =
            next === "LOGIN" ? mode === "LOGIN" : mode !== "LOGIN";
          return (
            <Pressable
              key={next}
              accessibilityRole="tab"
              aria-selected={selected}
              accessibilityState={{ selected, disabled: busy }}
              disabled={busy}
              onPress={() => switchMode(next)}
              style={[s.tab, selected && s.activeTab]}
            >
              <Text style={[s.tabText, selected && s.activeTabText]}>
                {next === "LOGIN" ? "Đăng nhập" : "Đăng ký"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {mode === "VERIFY" && (
        <Text accessibilityRole="header" style={s.heading}>
          Xác minh email
        </Text>
      )}
      {notice ? (
        <Text style={s.success} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      {mode === "LOGIN" ? (
        <>
          {input("Email hoặc số điện thoại", identifier, setIdentifier)}
          {input("Mật khẩu", password, setPassword, true)}
        </>
      ) : null}
      {mode === "REGISTER" ? (
        <>
          {input("Họ tên (không bắt buộc)", name, setName)}
          {input("Email", email, setEmail)}
          {input("Mật khẩu", password, setPassword, true)}
          {input("Xác nhận mật khẩu", confirmation, setConfirmation, true)}
          <Text style={s.hint}>
            Mật khẩu ít nhất 8 ký tự, gồm chữ và số. Xác minh email để kích hoạt
            tài khoản.
          </Text>
        </>
      ) : null}
      {mode === "VERIFY" && verification ? (
        <>
          <Text style={s.hint}>
            {verification.deliveryStatus === "SENT"
              ? `Mã xác minh đã được gửi đến ${verification.emailMasked}. Kiểm tra cả thư rác.`
              : verification.deliveryStatus === "FAILED"
                ? "Chưa gửi được email. Bạn có thể thử gửi lại sau."
                : "Yêu cầu gửi email đang được xử lý. Kiểm tra hộp thư trước khi gửi lại."}
          </Text>
          <Text style={s.hint}>
            {expired
              ? "Mã đã hết hạn. Hãy gửi lại mã."
              : `Mã có hiệu lực đến ${new Date(verification.expiresAt).toLocaleTimeString("vi-VN")}.`}
          </Text>
          <View style={s.inputBox}>
            <Text style={s.label}>Mã OTP</Text>
            <TextInput
              ref={codeRef}
              onFocus={() => requestAnimationFrame(revealFocusedInput)}
              accessibilityLabel="Mã OTP"
              style={[s.input, s.otp]}
              value={code}
              onChangeText={(value) =>
                setCode(value.replace(/\D/g, "").slice(0, 6))
              }
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              editable={!busy}
            />
          </View>
        </>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={s.error}
        >
          {error}
        </Text>
      ) : null}
      {lockRemaining > 0 ? (
        <Text style={s.error}>Có thể thử lại sau {lockRemaining} giây.</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          mode === "LOGIN"
            ? "Đăng nhập"
            : mode === "REGISTER"
              ? "Đăng ký"
              : "Xác nhận OTP"
        }
        disabled={busy || lockRemaining > 0 || (mode === "VERIFY" && expired)}
        onPress={() => void submit()}
        style={[
          s.primary,
          (busy || lockRemaining > 0 || (mode === "VERIFY" && expired)) &&
            s.disabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={C.ink} />
        ) : (
          <Text style={s.primaryText}>
            {mode === "LOGIN"
              ? "Đăng nhập"
              : mode === "REGISTER"
                ? "Đăng ký"
                : "Xác nhận OTP"}
          </Text>
        )}
      </Pressable>
      {mode === "VERIFY" ? (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={busy || remaining > 0 || lockRemaining > 0}
            style={s.textButton}
            onPress={() =>
              verification &&
              void run(async () => {
                setVerification(
                  await resendEmailOtp(baseUrl, verification.verificationId),
                );
                setCode("");
                setNotice("Đã gửi mã mới.");
              })
            }
          >
            <Text style={s.link}>
              {remaining > 0 ? `Gửi lại mã sau ${remaining}s` : "Gửi lại mã"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => switchMode("REGISTER")}
            style={s.textButton}
          >
            <Text style={s.link}>Đổi email / Quay lại đăng ký</Text>
          </Pressable>
        </>
      ) : null}
      {mode === "LOGIN" ? (
        <Text style={s.hint}>
          Quên mật khẩu? Vui lòng liên hệ lễ tân để được hỗ trợ.
        </Text>
      ) : null}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  content: { paddingBottom: 32, gap: 12 },
  tabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 28,
    backgroundColor: C.softGray,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activeTab: { backgroundColor: C.ink },
  tabText: { fontSize: 17, fontWeight: "700", color: C.inkSoft },
  activeTabText: { color: C.white },
  inputRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  fieldInput: { flex: 1, minWidth: 0 },
  eyeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  heading: { fontSize: 24, fontWeight: "700", color: C.ink, marginBottom: 4 },
  inputBox: {
    backgroundColor: C.softGray,
    borderWidth: 1,
    borderColor: "#dedee7",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  label: { fontSize: 12, fontWeight: "600", color: C.inkSoft, marginBottom: 4 },
  input: { color: C.ink, fontSize: 16, minHeight: 32, paddingVertical: 4 },
  otp: { letterSpacing: 8, fontSize: 24, textAlign: "center" },
  primary: {
    minHeight: 52,
    borderRadius: 28,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryText: { color: C.ink, fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  textButton: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  link: {
    color: "#5943ae",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  hint: { fontSize: 13, color: C.inkSoft, lineHeight: 20 },
  error: { color: "#b42318", fontSize: 13, lineHeight: 20 },
  success: { color: "#087538", fontSize: 13, lineHeight: 20 },
});
