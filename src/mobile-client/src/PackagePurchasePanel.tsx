import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as Crypto from "expo-crypto";
import type {
  CreateVNPayUrlResponse,
  MyPaymentDto,
  PackageDto,
  PaymentDetailDto,
  PurchaseOptionsDto,
} from "@fithub/contracts";
import type { MobileSession } from "./types";
import { mobileRequest } from "./api";
import { C } from "./theme";
const date = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const money = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    n,
  );
const endOf = (v: string, months: number) => {
  const d = new Date(v + "T00:00:00Z"),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)) - 86400000)
    .toISOString()
    .slice(0, 10);
};
const states: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  FAILED: "Thanh toán chưa thành công",
  CONFIRMED: "Đã xác nhận thanh toán",
  CANCELLED: "Đã hủy",
};
function Button({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      <Text style={secondary ? s.text : s.buttonText}>{label}</Text>
    </Pressable>
  );
}
type Props = {
  baseUrl: string;
  session: MobileSession;
  onBack: () => void;
  onChanged: () => void;
  onNavigate: (
    screen: "01_HOME" | "03_QR_CODE" | "09_PROFILE" | "11_NOTIFICATIONS",
  ) => void;
};
export function PackagePurchasePanel({
  baseUrl,
  session,
  onBack,
  onChanged,
  onNavigate,
}: Props) {
  const [filter, setFilter] = useState("Tất cả");
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState(false);
  const [method, setMethod] = useState("VNPAY");
  const [options, setOptions] = useState<PurchaseOptionsDto>();
  const [orders, setOrders] = useState<MyPaymentDto[]>();
  const [packageId, setPackageId] = useState("");
  const [draft, setDraft] = useState<{ pack: PackageDto; startsOn: string }>();
  const [order, setOrder] = useState<MyPaymentDto>();
  const [activeId, setActiveId] = useState<string>();
  const [url, setUrl] = useState<CreateVNPayUrlResponse>();
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [pollError, setPollError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const lock = useRef(false);
  const request = useRef<{ signature: string; id: string } | undefined>(
    undefined,
  );
  const generation = useRef(0);
  const mounted = useRef(true);
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const notified = useRef(new Set<string>());
  const call = <T,>(path: string, body?: unknown) =>
    mobileRequest<T>(
      baseUrl,
      path,
      body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
      session.accessToken,
    );
  async function reload() {
    const id = ++generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const [o, p] = await Promise.all([
        call<PurchaseOptionsDto>("/api/my/purchase-options"),
        call<MyPaymentDto[]>("/api/my/payments"),
      ]);
      if (mounted.current && generation.current === id) {
        setOptions(o);
        setOrders(p);
        setPackageId((previous) =>
          o.packages.some((pack) => pack.id === previous)
            ? previous
            : (o.packages[0]?.id ?? ""),
        );
      }
    } catch (e) {
      if (mounted.current && generation.current === id)
        setLoadError(
          e instanceof Error
            ? e.message
            : "Không tải được danh mục và đơn thanh toán.",
        );
    } finally {
      if (mounted.current && generation.current === id) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [baseUrl, session.accessToken]);
  useEffect(() => {
    if (!activeId) return;
    let live = true,
      inFlight = false;
    async function read() {
      if (
        !live ||
        inFlight ||
        (AppState.currentState && AppState.currentState !== "active")
      )
        return;
      inFlight = true;
      try {
        const p = await call<MyPaymentDto>(`/api/my/payments/${activeId}`);
        if (!live) return;
        setOrder(p);
        setPollError("");
        setOrders((old) =>
          old ? [p, ...old.filter((v) => v.id !== p.id)].slice(0, 20) : [p],
        );
        if (p.status === "CONFIRMED" && !notified.current.has(p.id)) {
          notified.current.add(p.id);
          onChanged();
          void reload();
        }
      } catch (e) {
        if (live)
          setPollError(
            e instanceof Error
              ? e.message
              : "Không đọc được trạng thái thanh toán.",
          );
      } finally {
        inFlight = false;
      }
    }
    void read();
    const timer = setInterval(() => {
      if (!order || order.status === "PENDING") void read();
    }, 4000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void read();
        void reload();
      }
    });
    return () => {
      live = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [activeId, order?.status, baseUrl, session.accessToken]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (mounted.current) {
        setCancelPrompt(false);
        setError(
          e instanceof Error
            ? e.message
            : "Không thực hiện được. Vui lòng thử lại.",
        );
        scroll.current?.scrollTo({ y: 0, animated: true });
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const pack = options?.packages.find((p) => p.id === packageId);
  const today =
    options?.serverDate ??
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const start = pack?.grantsGymAccess
    ? (options?.suggestedStartsOn ?? today)
    : today;
  const eligible =
    options?.member.accountStatus === "ACTIVE" && options.member.verified;
  function selectOrder(p: MyPaymentDto) {
    request.current = undefined;
    setActiveId(p.id);
    setOrder(p);
    setUrl(undefined);
    setError("");
    setCancelPrompt(false);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }
  async function create() {
    if (!draft) return;
    await run(async () => {
      const signature = JSON.stringify([
        draft.pack.id,
        draft.startsOn,
        draft.pack.price,
      ]);
      if (request.current?.signature !== signature)
        request.current = { signature, id: Crypto.randomUUID() };
      try {
        const p = await call<PaymentDetailDto>("/api/memberships/register", {
          requestId: request.current.id,
          packageId: draft.pack.id,
          startsOn: draft.startsOn,
          expectedPrice: draft.pack.price,
        });
        setActiveId(p.id);
        setOrder(undefined);
        setUrl(undefined);
        setDraft(undefined);
        scroll.current?.scrollTo({ y: 0, animated: true });
        request.current = undefined;
        onChanged();
        await reload();
      } catch (e) {
        setDraft(undefined);
        await reload();
        throw e;
      }
    });
  }
  async function startPayment() {
    if (!order) return;
    await run(async () => {
      const result = await call<CreateVNPayUrlResponse>(
        `/api/payments/${order.id}/vnpay-url`,
        {},
      );
      setUrl(result);
      const p = await call<MyPaymentDto>(`/api/my/payments/${order.id}`);
      setOrder(p);
    });
  }
  async function simulate(result: "SUCCESS" | "FAILED") {
    if (!order || !url?.simulationAllowed) return;
    await run(async () => {
      await call(`/api/payments/${order.id}/vnpay-simulate`, { result });
      const p = await call<MyPaymentDto>(`/api/my/payments/${order.id}`);
      setOrder(p);
      setUrl(undefined);
      onChanged();
      await reload();
    });
  }
  const step = activeId ? 3 : draft ? 2 : 1;
  const available = (options?.packages ?? []).filter(
    (p) =>
      filter === "Tất cả" ||
      (filter === "Gym + PT"
        ? (p.ptSessionsIncluded ?? 0) > 0
        : (p.ptSessionsIncluded ?? 0) === 0),
  );
  const row = (label: string, value: string) => (
    <View style={s.detailRow}>
      <Text style={s.meta}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
  return (
    <View style={s.root}>
      <View style={s.brandRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại gói của tôi"
          onPress={() => {
            if (draft) setDraft(undefined);
            else if (activeId) {
              setActiveId(undefined);
              setOrder(undefined);
            } else onBack();
          }}
          style={s.back}
        >
          <Feather name="arrow-left" size={15} color={C.mutedOnDark} />
          <Text style={s.meta}>
            {step === 1
              ? "Gói tập của tôi"
              : step === 2
                ? "Thay đổi gói"
                : "Chọn gói khác"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông báo"
          style={s.bell}
          onPress={() => onNavigate("11_NOTIFICATIONS")}
        >
          <Feather name="bell" size={20} color={C.white} />
        </Pressable>
      </View>
      <ScrollView
        ref={scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.kicker}>
          {step === 1 ? "THÀNH VIÊN / GIA HẠN GÓI" : `BƯỚC ${step} / 3`}
        </Text>
        <Text accessibilityRole="header" style={s.heading}>
          {step === 1
            ? "Đăng ký & gia hạn"
            : step === 2
              ? "Xem lại đăng ký"
              : "Thanh toán"}
        </Text>
        <Text style={s.meta}>
          {step === 1
            ? "Chọn gói phù hợp với mục tiêu tập luyện của bạn."
            : step === 2
              ? "Kiểm tra thông tin và thời gian sử dụng trước khi thanh toán."
              : "Theo dõi và hoàn tất thanh toán cho gói đã chọn."}
        </Text>
        {step > 1 && (
          <View style={s.steps}>
            {[1, 2, 3].map((n) => (
              <React.Fragment key={n}>
                <View
                  style={[
                    s.stepDot,
                    n === step && { backgroundColor: C.lime },
                    n < step && { backgroundColor: "#29473e" },
                  ]}
                >
                  <Text style={{ color: n === step ? C.ink : C.white }}>
                    {n < step ? "✓" : n}
                  </Text>
                </View>
                {n < 3 && <View style={s.stepLine} />}
              </React.Fragment>
            ))}
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {!!loadError && (
          <View style={s.card}>
            <Text accessibilityRole="alert" style={s.error}>
              {loadError}
            </Text>
            <Button label="Thử tải lại" onPress={() => void reload()} />
          </View>
        )}
        {loading && (
          <ActivityIndicator
            accessibilityLabel="Đang tải danh mục"
            color={C.lime}
          />
        )}
        {activeId && (
          <View style={s.card}>
            <Text style={s.title}>Đơn thanh toán của tôi</Text>
            {order ? (
              <>
                <Text style={s.text}>
                  {order.code} · {order.packageName}
                </Text>
                <Text style={s.price}>{money(order.amount)}</Text>
                <Text style={s.text}>
                  {states[order.status] ?? order.status}
                </Text>
                <Text style={s.meta}>
                  {date(order.startsOn)} –{" "}
                  {date(
                    new Date(
                      Date.parse(order.endsBefore) - 86400000,
                    ).toISOString(),
                  )}
                </Text>
                {order.status === "CONFIRMED" && (
                  <Text accessibilityRole="alert" style={s.text}>
                    {order.benefitStatus === "GRANTED"
                      ? order.membershipStatus === "SCHEDULED"
                        ? `Đã thanh toán. Gói sẽ bắt đầu từ ${date(order.startsOn)}.`
                        : "Đã thanh toán và cấp quyền sử dụng gói."
                      : "Đã ghi nhận thanh toán, quyền lợi cần lễ tân kiểm tra. Không thanh toán lại."}
                  </Text>
                )}
                {!!order.invoice && (
                  <View style={s.inset}>
                    <Text style={s.text}>
                      Hóa đơn: {order.invoice.code ?? "Chờ xử lý"}
                    </Text>
                    <Text style={s.meta}>
                      {order.invoice.status === "ISSUED"
                        ? "Biên lai điện tử mô phỏng, chưa phải hóa đơn từ nhà cung cấp."
                        : "Chưa phát hành được hóa đơn. Liên hệ lễ tân để được hỗ trợ."}
                    </Text>
                    {!!order.invoice.receipt && (
                      <Text style={s.meta}>
                        {order.invoice.receipt.buyerName} ·{" "}
                        {order.invoice.receipt.packageName} ·{" "}
                        {money(order.invoice.receipt.amount)}
                      </Text>
                    )}
                  </View>
                )}
                {(order.status === "PENDING" || order.status === "FAILED") && (
                  <>
                    <Text style={s.title}>Phương thức thanh toán</Text>
                    {(
                      [
                        {
                          id: "VNPAY",
                          icon: "grid",
                          title: "Thanh toán trực tuyến",
                          sub: "VNPay · kết quả được hệ thống xác nhận",
                        },
                        {
                          id: "CASH",
                          icon: "credit-card",
                          title: "Thanh toán tại quầy",
                          sub: "Nhân viên tiếp nhận và xác nhận đơn",
                        },
                      ] as const
                    ).map((m) => (
                      <Pressable
                        key={m.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: method === m.id }}
                        onPress={() => setMethod(m.id)}
                        style={[
                          s.card,
                          s.planTop,
                          method === m.id && s.selected,
                        ]}
                      >
                        <Feather name={m.icon} size={24} color={C.lime} />
                        <View style={{ flex: 1, gap: 5 }}>
                          <Text style={s.value}>{m.title}</Text>
                          <Text style={s.meta}>{m.sub}</Text>
                        </View>
                        {method === m.id && (
                          <Feather name="check" size={18} color={C.lime} />
                        )}
                      </Pressable>
                    ))}
                    {method === "CASH" && (
                      <View style={s.notice}>
                        <Text style={s.meta}>
                          Cung cấp mã đơn {order.code} cho lễ tân. Gói chỉ có
                          hiệu lực sau khi nhân viên xác nhận đã thu tiền. Nếu
                          yêu cầu VNPay còn hiệu lực, cần chờ kết quả hoặc hết
                          hạn trước khi thu tại quầy.
                        </Text>
                      </View>
                    )}
                    {method === "VNPAY" && (
                      <>
                        <Button
                          label={
                            busy
                              ? "Đang xử lý…"
                              : order.status === "FAILED"
                                ? "Thử lại thanh toán VNPay"
                                : "Thanh toán qua VNPay"
                          }
                          disabled={busy}
                          onPress={() => void startPayment()}
                        />
                      </>
                    )}
                    <Button
                      label="Hủy đơn chưa thanh toán"
                      secondary
                      disabled={busy}
                      onPress={() => setCancelPrompt(true)}
                    />
                  </>
                )}
                {url?.mode === "SANDBOX" && order.status === "PENDING" && (
                  <View style={s.inset}>
                    <Text style={s.text}>VNPay Sandbox</Text>
                    <Text style={s.meta}>
                      Cổng thanh toán thử nghiệm. Hạn yêu cầu:{" "}
                      {new Date(url.expiresAt).toLocaleString("vi-VN")}. Sau khi
                      thanh toán, quay về ứng dụng để kiểm tra kết quả được xác
                      nhận từ hệ thống.
                    </Text>
                    <Button
                      label="Mở cổng VNPay Sandbox"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          if (!/^https:\/\//i.test(url.paymentUrl))
                            throw Error("Địa chỉ thanh toán không hợp lệ.");
                          await Linking.openURL(url.paymentUrl);
                        })
                      }
                    />
                  </View>
                )}
                {url?.mode === "SIMULATED" && order.status === "PENDING" && (
                  <View style={s.inset}>
                    <Text style={s.text}>Thanh toán mô phỏng</Text>
                    <Text style={s.meta}>
                      Đây là thanh toán thử, không chuyển tiền thật.
                    </Text>
                    {url.simulationAllowed ? (
                      <>
                        <Button
                          label="Thanh toán thử thành công"
                          disabled={busy}
                          onPress={() => void simulate("SUCCESS")}
                        />
                        <Button
                          label="Thanh toán thử thất bại"
                          secondary
                          disabled={busy}
                          onPress={() => void simulate("FAILED")}
                        />
                      </>
                    ) : (
                      <Text style={s.meta}>
                        Thanh toán thử không khả dụng tại môi trường này. Vui
                        lòng liên hệ lễ tân.
                      </Text>
                    )}
                  </View>
                )}
              </>
            ) : (
              !pollError && <ActivityIndicator color={C.lime} />
            )}
            {!!pollError && (
              <Text accessibilityRole="alert" style={s.error}>
                {pollError}
              </Text>
            )}
            <Button
              label="Kiểm tra trạng thái đơn"
              secondary
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const p = await call<MyPaymentDto>(
                    `/api/my/payments/${activeId}`,
                  );
                  setOrder(p);
                  setPollError("");
                  onChanged();
                  await reload();
                })
              }
            />
          </View>
        )}
        {options && !loadError && step === 1 && (
          <>
            {!eligible && (
              <Text style={s.error}>
                Tài khoản cần hoạt động và xác minh trước khi đăng ký gói.
              </Text>
            )}
            {session.membership.packageName && (
              <View
                style={[
                  s.card,
                  { borderLeftColor: C.lime, borderLeftWidth: 3 },
                ]}
              >
                <Text style={s.meta}>
                  Gói tập hiện tại ·{" "}
                  {session.membership.state === "ACTIVE"
                    ? "Đang hoạt động"
                    : session.membership.state}
                </Text>
                <Text style={s.title}>{session.membership.packageName}</Text>
                <Text style={s.meta}>
                  {session.membership.endsInclusive
                    ? `Hết hạn ngày ${session.membership.endsInclusive}`
                    : ""}{" "}
                  · {session.membership.allowedHoursLabel}
                </Text>
              </View>
            )}
            <View style={s.detailRow}>
              <Text style={s.title}>Khám phá gói tập</Text>
              <Text style={s.meta}>{options.packages.length} gói</Text>
            </View>
            <View style={s.chips}>
              {["Tất cả", "Gym", "Gym + PT"].map((f) => (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === f }}
                  onPress={() => {
                    setFilter(f);
                    setExpanded(false);
                  }}
                  style={[s.chip, filter === f && { backgroundColor: C.lime }]}
                >
                  <Text
                    style={{
                      color: filter === f ? C.ink : C.softGray,
                      fontWeight: "600",
                    }}
                  >
                    {f}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!options.packages.length && (
              <Text style={s.meta}>Chưa có gói đang cung cấp.</Text>
            )}
            {(expanded ? available : available.slice(0, 3)).map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Chọn gói ${p.name}`}
                accessibilityState={{ selected: p.id === packageId }}
                disabled={busy}
                onPress={() => setPackageId(p.id)}
                style={[s.card, packageId === p.id && s.selected]}
              >
                <View style={s.planTop}>
                  <View style={s.planIcon}>
                    <Feather name="activity" size={24} color="#70e0c5" />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={s.title}>{p.name}</Text>
                    <Text style={s.price}>{money(p.price)}</Text>
                  </View>
                  <Feather
                    name={packageId === p.id ? "check-circle" : "circle"}
                    size={22}
                    color={packageId === p.id ? C.lime : C.mutedOnDark}
                  />
                </View>
                <Text style={s.text}>
                  {p.durationMonths} tháng · {p.ptSessionsIncluded ?? 0} buổi PT
                </Text>
                <Text style={s.meta}>
                  {p.grantsGymAccess
                    ? p.accessWindow === "OFF_PEAK"
                      ? "Gym thấp điểm 09:00–16:00"
                      : "Gym 05:30–22:00"
                    : "Không gồm quyền vào gym"}
                </Text>
              </Pressable>
            ))}
            {!expanded && available.length > 3 && (
              <Button
                label={`Xem thêm ${available.length - 3} gói tập  ›`}
                secondary
                onPress={() => setExpanded(true)}
              />
            )}
            <Text style={s.meta}>
              Gói mới chỉ được kích hoạt sau khi thanh toán được xác nhận và đến
              ngày bắt đầu.
            </Text>
          </>
        )}
        {step === 1 && (
          <Button
            label={
              history ? "Ẩn lịch sử giao dịch" : "Xem lịch sử giao dịch  ›"
            }
            secondary
            onPress={() => setHistory(!history)}
          />
        )}
        {history && (
          <>
            <Text style={s.title}>Giao dịch gần đây</Text>
            <Text style={s.meta}>Mở lại đơn chờ để tiếp tục thanh toán.</Text>
            {orders?.map((p) => (
              <Button
                key={p.id}
                secondary
                label={`${p.code} · ${p.packageName} · ${states[p.status] ?? p.status}`}
                onPress={() => selectOrder(p)}
              />
            ))}
            {orders?.length === 0 && (
              <Text style={s.meta}>Bạn chưa có giao dịch nào.</Text>
            )}
          </>
        )}
        {draft && !activeId && (
          <>
            <View style={s.card}>
              <Text style={s.title}>{draft.pack.name}</Text>
              <Text style={s.price}>{money(draft.pack.price)}</Text>
              {row("Thời hạn sử dụng", `${draft.pack.durationMonths} tháng`)}
              {row("Số buổi PT", `${draft.pack.ptSessionsIncluded ?? 0} buổi`)}
              {row(
                "Giờ hoạt động",
                draft.pack.grantsGymAccess
                  ? draft.pack.accessWindow === "OFF_PEAK"
                    ? "09:00 – 16:00"
                    : "05:30 – 22:00"
                  : "Không gồm gym",
              )}
            </View>
            <View style={s.card}>
              {row("Ngày bắt đầu dự kiến", date(draft.startsOn))}
              {row(
                "Ngày kết thúc dự kiến",
                date(endOf(draft.startsOn, draft.pack.durationMonths)),
              )}
            </View>
            <View style={s.notice}>
              <Feather name="info" size={18} color={C.lime} />
              <Text style={[s.meta, { flex: 1, color: "#d0d4b8" }]}>
                Ngày bắt đầu và quyền lợi được xác nhận theo quy định gia hạn.
                Gói hiện tại không tự động bị thay thế khi chọn gói mới. Xác
                nhận bên dưới sẽ tạo đơn chờ thanh toán.
              </Text>
            </View>
            <View style={s.total}>
              {row("Tổng thanh toán", money(draft.pack.price))}
            </View>
            <Button
              label={busy ? "Đang tạo đơn…" : "Tiếp tục thanh toán  →"}
              disabled={busy}
              onPress={() => void create()}
            />
            <Button
              label="Đổi gói tập"
              secondary
              disabled={busy}
              onPress={() => setDraft(undefined)}
            />
          </>
        )}
      </ScrollView>
      {step === 1 && pack && !loading && !loadError && (
        <View style={s.sticky}>
          <View style={s.detailRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.meta}>Gói đã chọn</Text>
              <Text style={s.value}>{pack.name}</Text>
            </View>
            <Text style={s.price}>{money(pack.price)}</Text>
          </View>
          <Button
            label="Tiếp tục  →"
            disabled={!eligible || busy}
            onPress={() => {
              setDraft({ pack, startsOn: start });
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
          />
        </View>
      )}
      <View style={s.dock}>
        {(
          [
            { icon: "home", label: "Trang chủ", target: "01_HOME" },
            { icon: "bar-chart-2", label: "Gói tập", target: "02_MY_PACKAGE" },
            { icon: "grid", label: "Mã QR", target: "03_QR_CODE" },
            { icon: "user", label: "Cá nhân", target: "09_PROFILE" },
          ] as const
        ).map((n) => (
          <Pressable
            key={n.label}
            accessibilityRole="button"
            accessibilityLabel={n.label}
            style={[
              s.navItem,
              n.label === "Gói tập" && { backgroundColor: C.lavender },
            ]}
            onPress={() =>
              n.target === "02_MY_PACKAGE" ? onBack() : onNavigate(n.target)
            }
          >
            <Feather name={n.icon} size={19} color={C.ink} />
            <Text style={s.navText}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
      {cancelPrompt && (
        <Modal
          transparent
          onRequestClose={() => {
            if (!busy) setCancelPrompt(false);
          }}
        >
          <SafeAreaView style={s.backdrop}>
            <View style={s.card}>
              <Text style={s.title}>Hủy đơn chưa thanh toán?</Text>
              <Text style={s.meta}>
                Chỉ hủy được đơn chưa thanh toán và không có yêu cầu thanh toán
                trực tuyến còn hiệu lực.
              </Text>
              <Button
                label="Giữ đơn"
                secondary
                disabled={busy}
                onPress={() => setCancelPrompt(false)}
              />
              <Button
                label="Xác nhận hủy đơn"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    if (!activeId) return;
                    const p = await call<MyPaymentDto>(
                      `/api/my/payments/${activeId}/cancel`,
                      {},
                    );
                    setOrder(p);
                    request.current = undefined;
                    setUrl(undefined);
                    setCancelPrompt(false);
                    onChanged();
                    await reload();
                  })
                }
              />
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.phoneBg },
  content: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  brandRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#222227",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
  },
  brand: { flexDirection: "row", gap: 9, alignItems: "center" },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0b3935",
    borderWidth: 1,
    borderColor: "#157b6c",
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: C.lime, fontStyle: "italic", fontWeight: "900" },
  brandText: { fontSize: 23, fontWeight: "800", color: C.white },
  bell: { padding: 10, borderRadius: 12, backgroundColor: "#26262d" },
  back: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 8,
  },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.mutedOnDark,
    fontWeight: "700",
  },
  steps: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.strokeDark,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#44444b",
    marginHorizontal: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  value: {
    fontSize: 13,
    fontWeight: "700",
    color: C.white,
    flexShrink: 1,
    textAlign: "right",
  },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: "#292930",
  },
  planTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  planIcon: { padding: 10, borderRadius: 12, backgroundColor: "#2b3b34" },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#252b1e",
  },
  total: { padding: 14, backgroundColor: "#292930", borderRadius: 16 },
  sticky: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderColor: C.strokeDark,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
  },
  dock: {
    flexDirection: "row",
    margin: 10,
    borderRadius: 32,
    backgroundColor: "#f7f7fa",
    padding: 6,
    width: "94%",
    maxWidth: 410,
    alignSelf: "center",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 28,
    gap: 4,
  },
  navText: { fontSize: 10, color: C.ink, fontWeight: "600" },
  heading: { fontSize: 27, fontWeight: "800", color: C.white },
  title: { fontSize: 18, fontWeight: "700", color: C.white },
  text: { fontSize: 16, color: C.softGray, lineHeight: 23 },
  meta: { fontSize: 14, color: C.mutedOnDark, lineHeight: 21 },
  error: { fontSize: 15, color: C.coral },
  price: { fontSize: 23, fontWeight: "800", color: C.lime },
  card: {
    width: "100%",
    padding: 16,
    gap: 12,
    borderRadius: 18,
    backgroundColor: C.cardDark,
    borderWidth: 1,
    borderColor: C.strokeDark,
  },
  selected: { borderColor: C.lime, borderWidth: 2 },
  inset: {
    padding: 12,
    borderRadius: 12,
    gap: 10,
    backgroundColor: C.strokeDark,
  },
  button: {
    minHeight: 48,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  secondary: { backgroundColor: C.strokeDark },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
    textAlign: "center",
  },
  backdrop: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,.7)",
  },
  modalContent: {
    flexGrow: 1,
    justifyContent: "center",
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
});
