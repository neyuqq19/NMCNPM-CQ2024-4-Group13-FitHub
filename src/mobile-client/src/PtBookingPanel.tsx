import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
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
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Không tải được hồ sơ.",
          );
      });
    return () => {
      active = false;
    };
  }, [baseUrl, token, path, attempt]);
  return { data, error, retry: () => setAttempt((count) => count + 1) };
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.action}>
      <Text style={s.actionText}>{label}</Text>
    </Pressable>
  );
}

function RequestStatus({ error, retry }: { error: string; retry: () => void }) {
  if (!error)
    return <ActivityIndicator accessibilityLabel="Đang tải" color={C.lime} />;
  return (
    <View style={s.card}>
      <Text accessibilityRole="alert" style={s.text}>
        {error}
      </Text>
      <Action label="Thử lại" onPress={retry} />
    </View>
  );
}

function Summary({ trainer }: { trainer: TrainerSummaryDto }) {
  return (
    <View style={s.row}>
      {trainer.avatarUrl && (
        <Image source={{ uri: trainer.avatarUrl }} style={s.avatar} />
      )}
      <View style={s.summary}>
        <Text style={s.name}>{trainer.displayName}</Text>
        <Text style={s.meta}>Lĩnh vực chuyên môn</Text>
        <Text style={s.text}>{trainer.specialties.join(" · ")}</Text>
        <Text style={s.meta}>
          {trainer.experienceYears} năm kinh nghiệm ·{" "}
          {trainer.certificationCount} chứng chỉ
        </Text>
      </View>
    </View>
  );
}

const hourInVietnam = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function AvailableSlots({
  id,
  onBooked,
  ...connection
}: Connection & { id: string; onBooked: () => void }) {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState("");
  const { data, error, retry } = useTrainerRequest<WorkingSlotDto[]>(
    connection,
    `/api/trainers/${encodeURIComponent(id)}/available-slots?date=${date}`,
  );
  async function book(slot: WorkingSlotDto) {
    setBusy(slot.id);
    setNote("");
    try {
      const res = await mobileRequest<AppointmentActionResponse>(
        connection.baseUrl,
        "/api/appointments",
        { method: "POST", body: JSON.stringify({ slotId: slot.id }) },
        connection.token,
      );
      setNote(
        `Đặt lịch thành công (${res.appointment.code}). Bạn còn ${res.ptAvailable} buổi PT.`,
      );
      onBooked();
    } catch (cause) {
      setNote(errorText(cause, "Không đặt được lịch."));
    } finally {
      setBusy(undefined);
      retry(); // ca vừa đặt hoặc vừa bị người khác đặt không còn là ca trống
    }
  }
  function changeDay(days: number) {
    setDate((current) => {
      const day = new Date(current + "T00:00:00Z");
      day.setUTCDate(day.getUTCDate() + days);
      return day.toISOString().slice(0, 10);
    });
  }
  return (
    <View style={s.card}>
      <Text style={s.name}>Ca trống</Text>
      <Text style={s.text}>
        {date.split("-").reverse().join("/")} · Giờ Việt Nam
      </Text>
      <View style={s.row}>
        {date > today && (
          <Action label="Ngày trước" onPress={() => changeDay(-1)} />
        )}
        <Action label="Ngày sau" onPress={() => changeDay(1)} />
      </View>
      {data ? (
        data.length ? (
          data.map((slot) => (
            <View style={s.row} key={slot.id}>
              <Text style={[s.text, s.grow]}>
                {hourInVietnam.format(new Date(slot.startTime))} –{" "}
                {hourInVietnam.format(new Date(slot.endTime))}
              </Text>
              <Action
                label={busy === slot.id ? "Đang đặt…" : "Đặt lịch"}
                onPress={() => {
                  if (!busy) void book(slot);
                }}
              />
            </View>
          ))
        ) : (
          <Text style={s.meta}>Chưa có ca trống trong ngày này.</Text>
        )
      ) : (
        <RequestStatus error={error} retry={retry} />
      )}
      {!!note && (
        <Text accessibilityRole="alert" style={s.text}>
          {note}
        </Text>
      )}
    </View>
  );
}

function TrainerDetail({
  id,
  onClose,
  onBooked,
  ...connection
}: Connection & { id: string; onClose: () => void; onBooked: () => void }) {
  const { data, error, retry } = useTrainerRequest<TrainerProfileDto>(
    connection,
    `/api/trainers/${encodeURIComponent(id)}`,
  );
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.content}>
          <Action label="Đóng hồ sơ" onPress={onClose} />
          <Text accessibilityRole="header" style={s.heading}>
            Hồ sơ chuyên môn
          </Text>
          {data ? (
            <>
              <View style={s.card}>
                <Summary trainer={data} />
                <Text style={s.meta}>Giới thiệu bản thân</Text>
                <Text style={s.text}>{data.bio}</Text>
              </View>
              <AvailableSlots {...connection} id={id} onBooked={onBooked} />
              <Text style={s.name}>Chứng chỉ hành nghề</Text>
              {!data.certifications.length && (
                <Text style={s.meta}>Chưa có chứng chỉ.</Text>
              )}
              {data.certifications.map((cert) => (
                <View key={cert.id} style={s.card}>
                  <Text style={s.name}>{cert.name}</Text>
                  <Text style={s.text}>
                    {cert.issuer} ·{" "}
                    {cert.issuedAt.slice(0, 10).split("-").reverse().join("/")}
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

const MEMBER_FREE_CANCEL_HOURS = 12;
const statusText: Record<AppointmentDto["status"], string> = {
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
  const [target, setTarget] = useState<AppointmentDto>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const hoursLeft = target
    ? (new Date(target.startTime).getTime() - Date.now()) / 3600_000
    : 0;
  async function cancel() {
    if (!target) return;
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
          ? `Đã hủy lịch ${res.appointment.code}. Bạn được hoàn lại 1 buổi PT (còn ${res.ptAvailable}).`
          : `Đã hủy lịch ${res.appointment.code}. Hủy sát giờ nên 1 buổi PT đã bị trừ (còn ${res.ptAvailable}).`,
      );
      setTarget(undefined);
      onChanged();
    } catch (cause) {
      setNote(errorText(cause, "Không hủy được lịch."));
      setTarget(undefined);
    } finally {
      setBusy(false);
      retry();
    }
  }
  return (
    <View style={s.card}>
      <Text style={s.name}>Lịch hẹn PT của tôi</Text>
      {data ? (
        <>
          <Text style={s.text}>Số buổi PT còn lại: {data.ptAvailable ?? 0}</Text>
          {!data.items.length && (
            <Text style={s.meta}>Bạn chưa đặt lịch hẹn nào.</Text>
          )}
          {data.items.map((a) => (
            <View key={a.id} style={s.item}>
              <Text style={s.text}>
                {a.workDate.split("-").reverse().join("/")} ·{" "}
                {hourInVietnam.format(new Date(a.startTime))} –{" "}
                {hourInVietnam.format(new Date(a.endTime))}
              </Text>
              <Text style={s.meta}>
                PT {a.trainer.displayName} · {statusText[a.status]}
                {a.compensationGranted ? " · được đền bù +1 buổi" : ""}
              </Text>
              {a.status === "CONFIRMED" &&
                new Date(a.startTime).getTime() > Date.now() && (
                  <Action label="Hủy lịch" onPress={() => setTarget(a)} />
                )}
            </View>
          ))}
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
        <Modal transparent animationType="fade" onRequestClose={() => setTarget(undefined)}>
          <View style={s.backdrop}>
            <View style={s.card}>
              <Text style={s.name}>Hủy lịch hẹn {target.code}?</Text>
              <Text style={hoursLeft >= MEMBER_FREE_CANCEL_HOURS ? s.text : s.warn}>
                {hoursLeft >= MEMBER_FREE_CANCEL_HOURS
                  ? "Còn trên 12 giờ: Bạn được hoàn lại 1 buổi PT."
                  : "Còn dưới 12 giờ: Bạn sẽ bị trừ 1 buổi PT nếu xác nhận hủy."}
              </Text>
              <View style={s.row}>
                <Action label="Giữ lịch" onPress={() => setTarget(undefined)} />
                <Action
                  label={busy ? "Đang hủy…" : "Xác nhận hủy"}
                  onPress={() => {
                    if (!busy) void cancel();
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

export function PtBookingPanel({
  onBack,
  ...connection
}: Connection & { onBack: () => void }) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [path, setPath] = useState("/api/trainers");
  const [selected, setSelected] = useState<string>();
  const [version, setVersion] = useState(0);
  const { data, error, retry } = useTrainerRequest<TrainerListResponse>(
    connection,
    path,
  );
  function search() {
    const query = new URLSearchParams();
    if (name.trim()) query.set("q", name.trim());
    if (specialty.trim()) query.set("specialty", specialty.trim());
    const suffix = query.toString();
    const next = suffix ? `/api/trainers?${suffix}` : "/api/trainers";
    if (next === path) retry();
    else setPath(next);
  }
  return (
    <View style={s.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        <Action label="Về trang chủ" onPress={onBack} />
        <Text accessibilityRole="header" style={s.heading}>
          Huấn luyện viên
        </Text>
        <MyAppointments
          {...connection}
          version={version}
          onChanged={() => setVersion((v) => v + 1)}
        />
        <TextInput
          accessibilityLabel="Tên huấn luyện viên"
          placeholder="Tên huấn luyện viên"
          placeholderTextColor={C.mutedOnDark}
          style={s.input}
          value={name}
          onChangeText={setName}
          onSubmitEditing={search}
        />
        <TextInput
          accessibilityLabel="Chuyên môn"
          placeholder="Chuyên môn"
          placeholderTextColor={C.mutedOnDark}
          style={s.input}
          value={specialty}
          onChangeText={setSpecialty}
          onSubmitEditing={search}
        />
        <Action label="Tìm kiếm" onPress={search} />
        {data ? (
          <>
            {!data.items.length && (
              <Text style={s.meta}>
                Không tìm thấy huấn luyện viên phù hợp.
              </Text>
            )}
            {data.items.map((trainer) => (
              <Pressable
                key={trainer.id}
                accessibilityRole="button"
                accessibilityLabel={`Xem hồ sơ ${trainer.displayName}`}
                style={s.card}
                onPress={() => setSelected(trainer.id)}
              >
                <Summary trainer={trainer} />
                <Text style={s.link}>Xem hồ sơ →</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <RequestStatus error={error} retry={retry} />
        )}
      </ScrollView>
      {selected && (
        <TrainerDetail
          {...connection}
          id={selected}
          onClose={() => setSelected(undefined)}
          onBooked={() => setVersion((v) => v + 1)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.phoneBg },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 16,
    gap: 14,
  },
  heading: { color: C.white, fontSize: 28, fontWeight: "800" },
  name: { color: C.white, fontSize: 19, fontWeight: "700" },
  text: { color: C.softGray, fontSize: 16 },
  meta: { color: C.mutedOnDark, fontSize: 14 },
  card: { backgroundColor: C.cardDark, borderRadius: 18, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  summary: { flex: 1, gap: 5 },
  grow: { flex: 1 },
  item: { gap: 6, paddingVertical: 6 },
  warn: { color: "#ffb4a8", fontSize: 16, fontWeight: "700" },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  link: { color: C.lime, fontWeight: "700" },
  action: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  actionText: { color: C.ink, fontWeight: "700", fontSize: 15 },
  input: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: C.cardDark,
    borderWidth: 1,
    borderColor: C.strokeDark,
    color: C.white,
    fontSize: 16,
  },
});
