import { MobileBackHeader } from "./MobileBackHeader";
import React, { useEffect, useRef, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  AppointmentActionResponse,
  AppointmentDto,
  AppointmentPageDto,
  AppointmentPreviewDto,
  TrainerListResponse,
  TrainerProfileDto,
  TrainerSummaryDto,
  WorkingSlotDto,
} from "@fithub/contracts";
import { mobileRequest } from "./api";
import { C } from "./theme";

type Connection = { baseUrl: string; token: string };
function useTrainerRequest<T>({ baseUrl, token }: Connection, path: string) {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    mobileRequest<T>(baseUrl, path, {}, token)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(errorText(cause, "Không tải được dữ liệu."));
      });
    return () => {
      active = false;
    };
  }, [baseUrl, token, path, attempt]);
  return { data, error, retry: () => setAttempt((v) => v + 1) };
}
function Action({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        s.action,
        secondary && s.secondary,
        (disabled || pressed) && s.dim,
      ]}
    >
      <Text style={secondary ? s.text : s.actionText}>{label}</Text>
    </Pressable>
  );
}
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        selected && s.chipSelected,
        pressed && s.dim,
      ]}
    >
      <Text style={[selected ? s.actionText : s.text, s.chipText]}>
        {label}
      </Text>
    </Pressable>
  );
}
function RequestStatus({ error, retry }: { error: string; retry: () => void }) {
  if (!error)
    return <ActivityIndicator accessibilityLabel="Đang tải" color={C.lime} />;
  return (
    <View style={s.message}>
      <Text accessibilityRole="alert" style={s.warn}>
        {error}
      </Text>
      <Action label="Thử lại" onPress={retry} />
    </View>
  );
}
function Summary({ trainer }: { trainer: TrainerSummaryDto }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [trainer.avatarUrl]);
  return (
    <View style={s.row}>
      {trainer.avatarUrl && !failed ? (
        <Image
          source={{ uri: trainer.avatarUrl }}
          style={s.avatar}
          onError={() => setFailed(true)}
          accessibilityLabel={`Ảnh ${trainer.displayName}`}
        />
      ) : (
        <View style={[s.avatar, s.avatarFallback]}>
          <Feather name="user" size={36} color={C.lime} />
        </View>
      )}
      <View style={s.summary}>
        <Text style={s.name}>{trainer.displayName}</Text>
        <Text style={s.specialty}>
          {trainer.specialties.join(" · ") || "Chưa cập nhật chuyên môn"}
        </Text>
        <Text style={s.meta}>{trainer.experienceYears} năm kinh nghiệm</Text>
        <Text style={s.meta}>{trainer.certificationCount} chứng chỉ</Text>
      </View>
    </View>
  );
}
const timeVN = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const localToday = () =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const formatDay = (iso: string) => iso.split("-").reverse().join("/");
const slotTime = (slot: { startTime: string; endTime: string }) =>
  `${timeVN.format(new Date(slot.startTime))} – ${timeVN.format(new Date(slot.endTime))}`;
const addDays = (iso: string, amount: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
};
const errorText = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

function ConfirmBooking({
  connection,
  trainer,
  slot,
  busy,
  onClose,
  onConfirm,
}: {
  connection: Connection;
  trainer: TrainerProfileDto;
  slot: WorkingSlotDto;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { data, error, retry } = useTrainerRequest<AppointmentPreviewDto>(
    connection,
    `/api/appointments/booking-preview?slotId=${encodeURIComponent(slot.id)}`,
  );
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={s.backdrop}>
        <ScrollView contentContainerStyle={s.modalContent}>
          <View style={s.card} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={s.name}>
              Xác nhận đặt lịch
            </Text>
            <Text style={s.text}>PT {trainer.displayName}</Text>
            <Text style={s.text}>
              {formatDay(slot.workDate)} · {slotTime(slot)}
            </Text>
            <Text style={s.meta}>Giờ Việt Nam</Text>
            {data ? (
              <View style={s.inset}>
                <Text style={s.text}>
                  Gói dự kiến: {data.membership.packageName}
                </Text>
                <Text style={s.text}>
                  Còn {data.membership.ptSessionsRemaining} buổi · Giữ 1 buổi
                  khi đặt
                </Text>
                <Text style={s.meta}>
                  Ca và gói được kiểm tra lại khi bạn xác nhận.
                </Text>
              </View>
            ) : (
              <RequestStatus error={error} retry={retry} />
            )}
            <Text style={s.meta}>
              Hủy trước ít nhất 12 giờ: hoàn 1 buổi. Hủy dưới 12 giờ: mất buổi.
              PT hủy dưới 6 giờ: hoàn buổi và đền bù thêm 1 buổi.
            </Text>
            <Action
              label={busy ? "Đang đặt…" : "Xác nhận đặt lịch"}
              disabled={busy || !data}
              onPress={onConfirm}
            />
            <Action
              label="Chọn lại"
              secondary
              disabled={busy}
              onPress={onClose}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
function AvailableSlots({
  trainer,
  initialDate,
  onBooked,
  ...connection
}: Connection & {
  trainer: TrainerProfileDto;
  initialDate?: string;
  onBooked: () => void;
}) {
  const today = localToday();
  const first = initialDate && initialDate >= today ? initialDate : today;
  const [date, setDate] = useState(first);
  const [week, setWeek] = useState(first);
  const [target, setTarget] = useState<WorkingSlotDto>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [note, setNote] = useState("");
  const { data, error, retry } = useTrainerRequest<WorkingSlotDto[]>(
    connection,
    `/api/trainers/${encodeURIComponent(trainer.id)}/available-slots?date=${date}`,
  );
  async function book() {
    if (!target || saving.current) return;
    saving.current = true;
    setBusy(true);
    setNote("");
    try {
      const res = await mobileRequest<AppointmentActionResponse>(
        connection.baseUrl,
        "/api/appointments",
        { method: "POST", body: JSON.stringify({ slotId: target.id }) },
        connection.token,
      );
      setNote(
        `Đặt lịch thành công (${res.appointment.code}). Bạn còn ${res.ptAvailable} buổi PT.`,
      );
      onBooked();
    } catch (cause) {
      setNote(
        errorText(
          cause,
          "Không đặt được lịch. Vui lòng kiểm tra lịch hẹn trước khi thử lại.",
        ),
      );
    } finally {
      saving.current = false;
      setBusy(false);
      setTarget(undefined);
      retry();
    }
  }
  return (
    <View style={s.card}>
      <Text style={s.name}>Chọn lịch tập</Text>
      <Text style={s.text}>{formatDay(date)} · Giờ Việt Nam</Text>
      <View style={s.wrap}>
        <Action
          label="Tuần trước"
          secondary
          disabled={week <= today}
          onPress={() => {
            const next = addDays(week, -7) < today ? today : addDays(week, -7);
            setWeek(next); setDate(next); setNote("");
          }}
        />
        <Action
          label="Tuần sau"
          secondary
          onPress={() => { const next = addDays(week, 7); setWeek(next); setDate(next); setNote(""); }}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.strip}
      >
        {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => (
          <Chip
            key={d}
            label={`${new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "UTC" }).format(new Date(d))}\n${formatDay(d).slice(0, 5)}`}
            selected={date === d}
            onPress={() => {
              setDate(d);
              setNote("");
            }}
          />
        ))}
      </ScrollView>
      {data ? (
        data.length ? (
          <View style={s.wrap}>
            {data.map((slot) => (
              <Chip
                key={slot.id}
                label={slotTime(slot)}
                selected={target?.id === slot.id}
                onPress={() => {
                  if (!busy) setTarget(slot);
                }}
              />
            ))}
          </View>
        ) : (
          <Text style={s.meta}>Chưa có ca trống trong ngày này.</Text>
        )
      ) : (
        <RequestStatus error={error} retry={retry} />
      )}
      <Action
        label="Tải lại lịch trống"
        secondary
        disabled={busy}
        onPress={retry}
      />
      {!!note && (
        <Text accessibilityRole="alert" style={s.text}>
          {note}
        </Text>
      )}
      {target && (
        <ConfirmBooking
          connection={connection}
          trainer={trainer}
          slot={target}
          busy={busy}
          onClose={() => setTarget(undefined)}
          onConfirm={() => void book()}
        />
      )}
    </View>
  );
}
function TrainerDetail({
  id,
  initialDate,
  onClose,
  onBooked,
  ...connection
}: Connection & {
  id: string;
  initialDate?: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { data, error, retry } = useTrainerRequest<TrainerProfileDto>(
    connection,
    `/api/trainers/${encodeURIComponent(id)}`,
  );
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.content}>
          <Action label="Đóng hồ sơ" secondary onPress={onClose} />
          <Text accessibilityRole="header" style={s.heading}>
            Hồ sơ chuyên môn
          </Text>
          {data ? (
            <>
              <View style={s.card}>
                <Summary trainer={data} />
                <Text style={s.sectionLabel}>GIỚI THIỆU</Text>
                <Text style={s.text}>
                  {data.bio || "Chưa cập nhật giới thiệu."}
                </Text>
              </View>
              <AvailableSlots
                {...connection}
                trainer={data}
                initialDate={initialDate}
                onBooked={onBooked}
              />
              <Text style={s.name}>Chứng chỉ hành nghề</Text>
              {!data.certifications.length && (
                <Text style={s.meta}>Chưa có chứng chỉ.</Text>
              )}
              {data.certifications.map((cert) => (
                <View key={cert.id} style={s.card}>
                  <Text style={s.name}>{cert.name}</Text>
                  <Text style={s.text}>
                    {cert.issuer} · {formatDay(cert.issuedAt.slice(0, 10))}
                  </Text>
                  {cert.credentialUrl && (
                    <Text selectable style={s.meta}>
                      {cert.credentialUrl}
                    </Text>
                  )}
                </View>
              ))}
            </>
          ) : (
            <RequestStatus error={error} retry={retry} />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const statuses: Record<AppointmentDto["status"], string> = {
  CONFIRMED: "Đã xác nhận",
  CANCELLED_BY_MEMBER: "Bạn đã hủy",
  CANCELLED_BY_PT: "PT đã hủy",
  NO_SHOW: "Vắng mặt",
  COMPLETED: "Đã hoàn thành",
};
function MyAppointments({
  version,
  onChanged,
  ...connection
}: Connection & { version: number; onChanged: () => void }) {
  const { data, error, retry } = useTrainerRequest<AppointmentPageDto>(
    connection,
    `/api/appointments/my?v=${version}`,
  );
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState("Sắp tới");
  const [target, setTarget] = useState<AppointmentDto>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [note, setNote] = useState("");
  const hoursLeft = target
    ? (new Date(target.startTime).getTime() - Date.now()) / 3600_000
    : 0;
  const visible = (data?.items ?? [])
    .filter((a) =>
      tab === "Đã hủy"
        ? a.status === "CANCELLED_BY_MEMBER" || a.status === "CANCELLED_BY_PT"
        : tab === "Đã hoàn thành"
          ? a.status === "COMPLETED" || a.status === "NO_SHOW"
          : a.status === "CONFIRMED",
    )
    .sort((a, b) =>
      tab === "Sắp tới"
        ? a.startTime.localeCompare(b.startTime)
        : b.startTime.localeCompare(a.startTime),
    );
  async function cancel() {
    if (!target || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const res = await mobileRequest<AppointmentActionResponse>(
        connection.baseUrl,
        `/api/appointments/${target.id}/cancel-by-member`,
        { method: "POST" },
        connection.token,
      );
      setNote(
        res.ptSessionOutcome === "REFUND"
          ? `Đã hủy ${res.appointment.code}. Hoàn 1 buổi PT, còn ${res.ptAvailable}.`
          : `Đã hủy ${res.appointment.code}. Hủy sát giờ nên mất 1 buổi PT, còn ${res.ptAvailable}.`,
      );
      onChanged();
    } catch (cause) {
      setNote(errorText(cause, "Không hủy được lịch."));
    } finally {
      saving.current = false;
      setBusy(false);
      setTarget(undefined);
      retry();
    }
  }
  return (
    <View style={s.card}>
      <View style={s.wrap}>
        <Text style={[s.name, s.grow]}>Lịch tập của tôi</Text>
        <Action
          label={expanded ? "Thu gọn" : "Xem tất cả"}
          secondary
          onPress={() => setExpanded((v) => !v)}
        />
      </View>
      {data ? (
        <>
          <Text style={s.text}>
            {data.ptAvailable == null
              ? "Chưa có số dư PT"
              : `${data.ptAvailable} buổi PT còn lại`}
          </Text>
          {!expanded && (
            <Text style={s.meta}>Quản lý và theo dõi lịch hẹn</Text>
          )}
          {expanded && (
            <>
              <View style={s.wrap}>
                {["Sắp tới", "Đã hoàn thành", "Đã hủy"].map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={tab === t}
                    onPress={() => setTab(t)}
                  />
                ))}
              </View>
              {tab === "Đã hoàn thành" && (
                <Text style={s.meta}>
                  Gồm buổi đã hoàn thành và buổi vắng mặt có xác nhận.
                </Text>
              )}
              {!visible.length && (
                <Text style={s.meta}>Chưa có lịch hẹn trong mục này.</Text>
              )}
              {visible.map((a) => (
                <View key={a.id} style={s.item}>
                  <Text style={s.text}>
                    {formatDay(a.workDate)} · {slotTime(a)}
                  </Text>
                  <Text style={s.name}>{a.trainer.displayName}</Text>
                  <Text style={s.meta}>
                    {a.code} ·{" "}
                    {a.status === "CONFIRMED" &&
                    new Date(a.endTime).getTime() <= Date.now()
                      ? "Chờ xác nhận kết quả"
                      : statuses[a.status]}
                  </Text>
                  {a.compensationGranted && (
                    <Text style={s.specialty}>
                      Đã hoàn 1 buổi và đền bù thêm 1 buổi
                    </Text>
                  )}
                  {a.status === "CONFIRMED" &&
                    new Date(a.startTime).getTime() > Date.now() && (
                      <Action
                        label="Hủy lịch"
                        secondary
                        onPress={() => setTarget(a)}
                      />
                    )}
                </View>
              ))}
            </>
          )}
        </>
      ) : (
        <RequestStatus error={error} retry={retry} />
      )}
      {!!note && (
        <Text accessibilityRole="alert" style={s.text}>
          {note}
        </Text>
      )}
      {target && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!busy) setTarget(undefined);
          }}
        >
          <SafeAreaView style={s.backdrop}>
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={s.card}>
                <Text style={s.name}>Hủy lịch hẹn {target.code}?</Text>
                <Text style={hoursLeft >= 12 ? s.text : s.warn}>
                  {hoursLeft >= 12
                    ? "Còn ít nhất 12 giờ: bạn được hoàn lại 1 buổi PT."
                    : "Còn dưới 12 giờ: bạn mất 1 buổi PT nếu xác nhận hủy."}
                </Text>
                <Action
                  label="Giữ lịch"
                  secondary
                  disabled={busy}
                  onPress={() => setTarget(undefined)}
                />
                <Action
                  label={busy ? "Đang hủy…" : "Xác nhận hủy"}
                  disabled={busy}
                  onPress={() => void cancel()}
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi");
export function PtBookingPanel({
  onBack,
  onNotifications,
  ...connection
}: Connection & { onBack: () => void; onNotifications?: () => void }) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [selected, setSelected] = useState<{ id: string; date?: string }>();
  const [version, setVersion] = useState(0);
  const { data, error, retry } = useTrainerRequest<TrainerListResponse>(
    connection,
    `/api/trainers?v=${version}`,
  );
  const specialties = [
    ...new Set(data?.items.flatMap((t) => t.specialties) ?? []),
  ];
  const trainers =
    data?.items.filter(
      (t) =>
        normalize(t.displayName).includes(normalize(name.trim())) &&
        (!specialty || t.specialties.includes(specialty)),
    ) ?? [];
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, []);
  return (
    <View style={s.root}>
      <View style={s.headerWrap}>
        <MobileBackHeader onBack={onBack} onNotifications={onNotifications} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={!data && !error}
            onRefresh={refresh}
            tintColor={C.lime}
          />
        }
      >
        <Text accessibilityRole="header" style={s.heading}>
          Huấn luyện viên
        </Text>
        <Text style={s.meta}>Tìm PT phù hợp với mục tiêu của bạn</Text>
        <TextInput
          accessibilityLabel="Tên huấn luyện viên"
          placeholder="Tìm huấn luyện viên…"
          placeholderTextColor={C.mutedOnDark}
          style={s.input}
          value={name}
          onChangeText={setName}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.strip}
        >
          <Chip
            label="Tất cả"
            selected={!specialty}
            onPress={() => setSpecialty("")}
          />
          {specialties.map((value) => (
            <Chip
              key={value}
              label={value}
              selected={specialty === value}
              onPress={() => setSpecialty(value)}
            />
          ))}
        </ScrollView>
        {data ? (
          <>
            {!trainers.length && (
              <Text style={s.meta}>
                Không tìm thấy huấn luyện viên phù hợp.
              </Text>
            )}
            {trainers.map((trainer) => (
              <View key={trainer.id} style={s.card}>
                <Summary trainer={trainer} />
                <View style={s.inset}>
                  <Text style={s.text}>Lịch trống gần nhất</Text>
                  {trainer.nextAvailableSlots?.length ? (
                    <View style={s.wrap}>
                      {trainer.nextAvailableSlots.map((slot) => (
                        <Chip
                          key={slot.id}
                          label={`${formatDay(slot.workDate).slice(0, 5)} · ${slotTime(slot)}`}
                          selected={false}
                          onPress={() =>
                            setSelected({ id: trainer.id, date: slot.workDate })
                          }
                        />
                      ))}
                    </View>
                  ) : (
                    <Text style={s.meta}>
                      {trainer.workStatus === "ON_LEAVE"
                        ? "PT đang nghỉ phép"
                        : "Chưa có lịch trống sắp tới"}
                    </Text>
                  )}
                </View>
                <Action
                label="Xem hồ sơ & đặt lịch"
                accessibilityLabel={`Xem hồ sơ & đặt lịch · ${trainer.displayName}`}
                  onPress={() => setSelected({ id: trainer.id })}
                />
              </View>
            ))}
          </>
        ) : (
          <RequestStatus error={error} retry={retry} />
        )}
        <MyAppointments {...connection} version={version} onChanged={refresh} />
        <Action label="Làm mới" secondary onPress={refresh} />
      </ScrollView>
      {selected && (
        <TrainerDetail
          {...connection}
          id={selected.id}
          initialDate={selected.date}
          onClose={() => setSelected(undefined)}
          onBooked={refresh}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.phoneBg },
  headerWrap: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: C.phoneBg,
    borderBottomWidth: 1,
    borderBottomColor: "#222227",
    zIndex: 10,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  heading: { color: C.white, fontSize: 28, fontWeight: "800" },
  name: { color: C.white, fontSize: 18, fontWeight: "700" },
  text: { color: C.softGray, fontSize: 16 },
  meta: { color: C.mutedOnDark, fontSize: 14, lineHeight: 21 },
  specialty: { color: C.lime, fontSize: 14, lineHeight: 21 },
  sectionLabel: {
    color: C.mutedOnDark,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
  card: {
    backgroundColor: C.cardDark,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    width: "100%",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  strip: { gap: 8, paddingVertical: 4 },
  summary: { flex: 1, minWidth: 0, gap: 5 },
  grow: { flexGrow: 1, flexShrink: 1 },
  item: {
    gap: 8,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: C.strokeDark,
  },
  inset: {
    backgroundColor: C.strokeDark,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  warn: { color: C.coral, fontSize: 16 },
  message: { gap: 12, paddingVertical: 12 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 16,
  },
  modalContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  avatar: { width: 72, height: 88, borderRadius: 16 },
  avatarFallback: {
    backgroundColor: C.phoneBg,
    alignItems: "center",
    justifyContent: "center",
  },
  action: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.lime,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "100%",
  },
  secondary: { backgroundColor: C.strokeDark },
  actionText: {
    color: C.ink,
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  dim: { opacity: 0.5 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: C.strokeDark,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.mutedOnDark,
    maxWidth: "100%",
  },
  chipSelected: { backgroundColor: C.lime, borderColor: C.lime },
  chipText: { textAlign: "center" },
  input: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: C.cardDark,
    borderWidth: 1,
    borderColor: C.strokeDark,
    color: C.white,
    fontSize: 16,
  },
});
