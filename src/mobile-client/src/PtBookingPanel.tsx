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

function AvailableSlots({ id, ...connection }: Connection & { id: string }) {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const { data, error, retry } = useTrainerRequest<WorkingSlotDto[]>(
    connection,
    `/api/trainers/${encodeURIComponent(id)}/available-slots?date=${date}`,
  );
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
            <Text style={s.text} key={slot.id}>
              {hourInVietnam.format(new Date(slot.startTime))} –{" "}
              {hourInVietnam.format(new Date(slot.endTime))}
            </Text>
          ))
        ) : (
          <Text style={s.meta}>Chưa có ca trống trong ngày này.</Text>
        )
      ) : (
        <RequestStatus error={error} retry={retry} />
      )}
    </View>
  );
}

function TrainerDetail({
  id,
  onClose,
  ...connection
}: Connection & { id: string; onClose: () => void }) {
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
                <Text style={s.text}>{data.bio}</Text>
              </View>
              <AvailableSlots {...connection} id={id} />
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

export function PtBookingPanel({
  onBack,
  ...connection
}: Connection & { onBack: () => void }) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [path, setPath] = useState("/api/trainers");
  const [selected, setSelected] = useState<string>();
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
