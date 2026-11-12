// UC13 — Nhật ký tập luyện (WKO-01..05).
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type {
  PersonalRecordDto,
  WorkoutHistoryResponse,
  WorkoutSessionDto,
  WorkoutSetType,
} from "@fithub/contracts";
import {
  deleteWorkout,
  getMyPersonalRecords,
  getMyWorkouts,
  saveWorkout,
  MobileApiError,
} from "./api";
import { C } from "./theme";
import type { MobileSession } from "./types";

const PRESETS = ["Bench Press", "Back Squat", "Deadlift", "Overhead Press", "Lat Pulldown", "Barbell Row"];
const SET_TYPES: { type: WorkoutSetType; label: string }[] = [
  { type: "W", label: "Khởi động" },
  { type: "R", label: "Hiệp chính" },
  { type: "D", label: "Drop set" },
  { type: "F", label: "Tới thất bại" },
];
const REST_OPTIONS = [60, 90, 120];
const gold = "#FFD54A";

type SetDraft = { key: string; setType: WorkoutSetType; kg: string; reps: string; done: boolean };
type ExerciseDraft = { key: string; name: string; sets: SetDraft[] };
type Tab = "log" | "history" | "records";

let seq = 0;
const uid = () => `k${++seq}`;
const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const toNum = (s: string) => Number(s.replace(",", "."));
/** Number with vi-VN thousands separator and up to 2 decimals. */
export function fmt(n: number) {
  const [int, dec] = (Math.round(n * 100) / 100).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const d = dec.replace(/0+$/, "");
  return d ? `${grouped},${d}` : grouped;
}
const viDate = (d: string) => d.split("-").reverse().join("/");
/** Preview only; the server computes the stored value (calculateEpley1RM). */
function epley(setType: WorkoutSetType, kg: number, reps: number) {
  if (setType !== "R" || !(kg > 0) || !(reps >= 1) || !Number.isInteger(reps)) return null;
  return reps === 1 ? kg : Math.round(kg * (1 + reps / 30) * 100) / 100;
}
const newSet = (from?: SetDraft): SetDraft => ({
  key: uid(),
  setType: from?.setType ?? "R",
  kg: from?.kg ?? "",
  reps: from?.reps ?? "",
  done: false,
});
const errorText = (e: unknown) => {
  if (e instanceof MobileApiError) return e.body.message;
  return e instanceof Error ? e.message : "Không thể hoàn tất yêu cầu.";
};

// ---------------------------------------------------------------------------
// WKO-05 — Rest timer 60–120 s
// ---------------------------------------------------------------------------
export function RestTimerBar({
  runId,
  seconds,
  onSeconds,
}: {
  /** Changes every time a set is completed; restarts the countdown. */
  runId: number;
  seconds: number;
  onSeconds: (s: number) => void;
}) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (runId) setEndsAt(Date.now() + seconds * 1000);
  }, [runId]);
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (endsAt === null) return null;
  // `now` only drives re-renders; always measure against the real clock.
  void now;
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <View style={s.timer} accessibilityLiveRegion="polite" testID="rest-timer">
      <View style={s.between}>
        <Text style={s.timerLabel}>{left > 0 ? "Nghỉ giữa hiệp" : "Hết giờ nghỉ — vào hiệp tiếp theo!"}</Text>
        <Text style={s.timerClock} accessibilityLabel={`Còn ${left} giây nghỉ`}>
          {mm}:{ss}
        </Text>
      </View>
      <View style={s.row}>
        {REST_OPTIONS.map((sec) => (
          <Pressable
            key={sec}
            accessibilityRole="button"
            style={[s.chip, seconds === sec && s.chipOn]}
            onPress={() => {
              onSeconds(sec);
              setEndsAt(Date.now() + sec * 1000);
            }}
          >
            <Text style={[s.chipText, seconds === sec && s.chipTextOn]}>{sec}s</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          style={s.chip}
          onPress={() => setEndsAt((e) => Math.max(e ?? 0, Date.now()) + 15000)}
        >
          <Text style={s.chipText}>+15s</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={s.chip} onPress={() => setEndsAt(null)}>
          <Text style={s.chipText}>Bỏ qua nghỉ</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Home card — số buổi tập thật trong tháng (WKO-03)
// ---------------------------------------------------------------------------
export function WorkoutSummaryCard({
  baseUrl,
  session,
  onOpen,
}: {
  baseUrl: string;
  session: MobileSession;
  onOpen: () => void;
}) {
  const [stats, setStats] = useState<WorkoutHistoryResponse["stats"] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getMyWorkouts(baseUrl, session, { pageSize: 1 })
      .then((r) => live && setStats(r.stats))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [baseUrl, session.accessToken]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mở nhật ký tập luyện"
      style={[s.card, { backgroundColor: C.lavender, marginTop: 16 }]}
      onPress={onOpen}
    >
      <Text style={s.cardTitle}>Nhật ký tập luyện</Text>
      {error ? (
        <Text style={s.errorDark}>{error}</Text>
      ) : !stats ? (
        <ActivityIndicator color={C.ink} />
      ) : (
        <>
          <Text style={s.big}>
            {stats.sessionsThisMonth}
            <Text style={s.bigUnit}> buổi đã ghi trong tháng</Text>
          </Text>
          <Text style={s.metaDark}>
            {stats.totalMinutesThisMonth ? `${stats.totalMinutesThisMonth} phút · ` : ""}
            {fmt(stats.totalVolumeThisMonth)} kg · chuỗi {stats.currentStreakDays} ngày
          </Text>
        </>
      )}
      <View style={s.darkPill}>
        <Text style={s.darkPillText}>Mở nhật ký tập luyện →</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Màn hình 10_WORKOUT_LOG
// ---------------------------------------------------------------------------
export function WorkoutLogPanel({
  baseUrl,
  session,
  onBack,
}: {
  baseUrl: string;
  session: MobileSession;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("log");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [performedOn, setPerformedOn] = useState(todayVN());
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [customName, setCustomName] = useState("");
  const [restSeconds, setRestSeconds] = useState(90);
  const [restRun, setRestRun] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<WorkoutSessionDto | null>(null);

  const [history, setHistory] = useState<WorkoutHistoryResponse | null>(null);
  const [records, setRecords] = useState<PersonalRecordDto[] | null>(null);
  const [listError, setListError] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  async function loadLists(page = 1) {
    setLoadingList(true);
    setListError("");
    try {
      const [h, r] = await Promise.all([
        getMyWorkouts(baseUrl, session, { page, pageSize: 10 }),
        getMyPersonalRecords(baseUrl, session),
      ]);
      setHistory((prev) =>
        page > 1 && prev ? { ...h, items: [...prev.items, ...h.items] } : h,
      );
      setRecords(r);
    } catch (e) {
      setListError(errorText(e));
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => {
    void loadLists();
  }, [baseUrl, session.accessToken]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setPerformedOn(todayVN());
    setDuration("");
    setNotes("");
    setExercises([]);
    setFormError("");
  }
  function addExercise(name: string) {
    const n = name.trim().replace(/\s+/g, " ");
    if (!n) return;
    if (exercises.some((e) => e.name.toLowerCase() === n.toLowerCase())) {
      setFormError(`Bài "${n}" đã có trong buổi tập.`);
      return;
    }
    setFormError("");
    setSaved(null);
    setExercises((list) => [...list, { key: uid(), name: n, sets: [newSet()] }]);
    setCustomName("");
  }
  function patchSet(exKey: string, setKey: string, patch: Partial<SetDraft>) {
    setExercises((list) =>
      list.map((e) =>
        e.key !== exKey
          ? e
          : { ...e, sets: e.sets.map((st) => (st.key === setKey ? { ...st, ...patch } : st)) },
      ),
    );
  }
  function toggleDone(ex: ExerciseDraft, st: SetDraft) {
    if (!st.done) {
      const kg = toNum(st.kg);
      const reps = Number(st.reps);
      if (!st.kg.trim() || !(kg >= 0) || kg > 1000 || !Number.isInteger(reps) || reps < 1 || reps > 500) {
        setFormError(`${ex.name}: nhập mức tạ (0–1000 kg) và số lần (1–500) trước khi hoàn thành hiệp.`);
        return;
      }
      setFormError("");
      setRestRun((n) => n + 1); // WKO-05: start the rest timer
    }
    patchSet(ex.key, st.key, { done: !st.done });
  }

  async function submit() {
    setFormError("");
    const payloadExercises = exercises
      .map((e) => ({
        exerciseName: e.name,
        sets: e.sets
          .filter((st) => st.done)
          .map((st) => ({ setType: st.setType, reps: Number(st.reps), weightKg: toNum(st.kg) })),
      }))
      .filter((e) => e.sets.length);
    if (!title.trim()) return setFormError("Nhập tiêu đề buổi tập.");
    if (!payloadExercises.length)
      return setFormError("Cần ít nhất 1 hiệp đã tích hoàn thành (✓) để lưu buổi tập.");
    const minutes = duration.trim() ? Number(duration) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600))
      return setFormError("Thời lượng là số phút từ 1 đến 600.");
    setSaving(true);
    try {
      const result = await saveWorkout(
        baseUrl,
        session,
        { title, performedOn, durationMinutes: minutes, notes: notes.trim() || null, exercises: payloadExercises },
        editingId ?? undefined,
      );
      setSaved(result);
      resetForm();
      scroll.current?.scrollTo({ y: 0, animated: true });
      void loadLists();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  function edit(w: WorkoutSessionDto) {
    setEditingId(w.id);
    setTitle(w.title);
    setPerformedOn(w.performedOn);
    setDuration(w.durationMinutes ? String(w.durationMinutes) : "");
    setNotes(w.notes ?? "");
    setExercises(
      w.exercises.map((e) => ({
        key: uid(),
        name: e.exerciseName,
        sets: e.sets.map((st) => ({
          key: uid(),
          setType: st.setType,
          kg: String(st.weightKg),
          reps: String(st.reps),
          done: true,
        })),
      })),
    );
    setSaved(null);
    setTab("log");
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  async function remove(id: string) {
    if (confirmDelete !== id) return setConfirmDelete(id);
    setConfirmDelete(null);
    try {
      await deleteWorkout(baseUrl, session, id);
      if (editingId === id) resetForm();
      await loadLists();
    } catch (e) {
      setListError(errorText(e));
    }
  }

  const doneSets = exercises.flatMap((e) => e.sets.filter((st) => st.done));
  const liveVolume = doneSets.reduce((n, st) => n + Number(st.reps) * toNum(st.kg), 0);
  const best = saved?.newRecords.reduce<{ exerciseName: string; oneRepMax: number } | null>(
    (b, r) => (!b || r.oneRepMax > b.oneRepMax ? r : b),
    null,
  );

  return (
    <View style={s.root}>
      <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Quay lại trang chủ" style={s.back} onPress={onBack}>
            <Feather name="chevron-left" size={24} color="white" />
          </Pressable>
          <Text style={s.h1}>Nhật ký tập luyện</Text>
        </View>

        <View style={s.tabs}>
          {(
            [
              ["log", editingId ? "Sửa buổi tập" : "Buổi tập mới"],
              ["history", "Lịch sử"],
              ["records", "Kỷ lục PR"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              style={[s.tab, tab === id && s.tabOn]}
              onPress={() => setTab(id)}
            >
              <Text style={[s.tabText, tab === id && s.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {saved && (
          <View
            style={[s.banner, best ? { backgroundColor: gold } : { backgroundColor: C.lime }]}
            accessibilityLiveRegion="polite"
            testID="save-result"
          >
            {best ? (
              <Text style={s.bannerTitle}>
                🏆 KỶ LỤC CÁ NHÂN MỚI (PR): {fmt(best.oneRepMax)} kg — {best.exerciseName}
              </Text>
            ) : (
              <Text style={s.bannerTitle}>Đã lưu buổi tập "{saved.title}"</Text>
            )}
            <Text style={s.bannerSub}>Tổng khối lượng: {fmt(saved.totalVolume)} kg</Text>
          </View>
        )}

        {tab === "log" && (
          <>
            <TextInput
              style={s.input}
              placeholder="Tiêu đề, ví dụ: Push Day - Ngực & Tay sau"
              placeholderTextColor={C.mutedOnDark}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              accessibilityLabel="Tiêu đề buổi tập"
            />
            <View style={s.row}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={performedOn}
                onChangeText={setPerformedOn}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.mutedOnDark}
                accessibilityLabel="Ngày tập"
                maxLength={10}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={duration}
                onChangeText={setDuration}
                placeholder="Số phút"
                placeholderTextColor={C.mutedOnDark}
                keyboardType="number-pad"
                accessibilityLabel="Thời lượng (phút)"
                maxLength={3}
              />
            </View>

            <Text style={s.h2}>Thêm bài tập</Text>
            <View style={s.wrap}>
              {PRESETS.map((p) => (
                <Pressable key={p} accessibilityRole="button" style={s.chip} onPress={() => addExercise(p)}>
                  <Text style={s.chipText}>+ {p}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.row}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={customName}
                onChangeText={setCustomName}
                placeholder="Bài tập khác…"
                placeholderTextColor={C.mutedOnDark}
                accessibilityLabel="Tên bài tập khác"
                maxLength={80}
                onSubmitEditing={() => addExercise(customName)}
              />
              <Pressable accessibilityRole="button" style={s.addBtn} onPress={() => addExercise(customName)}>
                <Feather name="plus" size={22} color={C.ink} />
              </Pressable>
            </View>

            {exercises.map((ex) => (
              <View key={ex.key} style={s.exercise}>
                <View style={s.between}>
                  <Text style={s.exerciseName}>{ex.name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Bỏ bài ${ex.name}`}
                    onPress={() => setExercises((l) => l.filter((e) => e.key !== ex.key))}
                  >
                    <Feather name="x" size={20} color={C.mutedOnDark} />
                  </Pressable>
                </View>
                <Text style={s.hint}>W khởi động · R hiệp chính · D drop set · F tới thất bại</Text>
                {ex.sets.map((st, i) => {
                  const e1rm = epley(st.setType, toNum(st.kg), Number(st.reps));
                  return (
                    <View key={st.key} style={[s.setRow, st.done && s.setDone]}>
                      <Text style={s.setNo}>{i + 1}</Text>
                      <View style={s.typeGroup}>
                        {SET_TYPES.map(({ type, label }) => (
                          <Pressable
                            key={type}
                            accessibilityRole="button"
                            accessibilityLabel={`Hiệp ${i + 1}: ${label}`}
                            accessibilityState={{ selected: st.setType === type }}
                            style={[s.type, st.setType === type && s.typeOn]}
                            onPress={() => patchSet(ex.key, st.key, { setType: type })}
                          >
                            <Text style={[s.typeText, st.setType === type && s.typeTextOn]}>{type}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <TextInput
                        style={s.num}
                        value={st.kg}
                        onChangeText={(kg) => patchSet(ex.key, st.key, { kg })}
                        placeholder="kg"
                        placeholderTextColor={C.mutedOnDark}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`${ex.name} hiệp ${i + 1} mức tạ kg`}
                      />
                      <TextInput
                        style={s.num}
                        value={st.reps}
                        onChangeText={(reps) => patchSet(ex.key, st.key, { reps })}
                        placeholder="reps"
                        placeholderTextColor={C.mutedOnDark}
                        keyboardType="number-pad"
                        accessibilityLabel={`${ex.name} hiệp ${i + 1} số lần`}
                      />
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: st.done }}
                        accessibilityLabel={`Hoàn thành hiệp ${i + 1} ${ex.name}`}
                        style={[s.check, st.done && s.checkOn]}
                        onPress={() => toggleDone(ex, st)}
                      >
                        <Feather name="check" size={18} color={st.done ? C.ink : C.mutedOnDark} />
                      </Pressable>
                      {e1rm !== null && <Text style={s.e1rm}>1RM ≈ {fmt(e1rm)}</Text>}
                    </View>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setExercises((l) =>
                      l.map((e) => (e.key === ex.key ? { ...e, sets: [...e.sets, newSet(e.sets.at(-1))] } : e)),
                    )
                  }
                >
                  <Text style={s.link}>+ Thêm hiệp</Text>
                </Pressable>
              </View>
            ))}

            <RestTimerBar runId={restRun} seconds={restSeconds} onSeconds={setRestSeconds} />

            <TextInput
              style={[s.input, { minHeight: 64 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ghi chú (không bắt buộc)"
              placeholderTextColor={C.mutedOnDark}
              multiline
              maxLength={1000}
              accessibilityLabel="Ghi chú"
            />
            <Text style={s.hint}>
              {doneSets.length} hiệp đã hoàn thành · Tổng khối lượng {fmt(liveVolume || 0)} kg. Chỉ hiệp đã tích ✓ được lưu.
            </Text>
            {formError ? (
              <Text style={s.error} accessibilityRole="alert">
                {formError}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={[s.primary, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={() => void submit()}
            >
              {saving ? (
                <ActivityIndicator color={C.ink} />
              ) : (
                <Text style={s.primaryText}>{editingId ? "Lưu thay đổi" : "Lưu buổi tập"}</Text>
              )}
            </Pressable>
            {editingId && (
              <Pressable accessibilityRole="button" onPress={resetForm}>
                <Text style={[s.link, { textAlign: "center" }]}>Hủy sửa</Text>
              </Pressable>
            )}
          </>
        )}

        {tab !== "log" && listError ? (
          <View>
            <Text style={s.error}>{listError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadLists()}>
              <Text style={s.link}>Thử lại</Text>
            </Pressable>
          </View>
        ) : null}

        {tab === "history" && (
          <>
            {history && (
              <View style={s.statsGrid}>
                {[
                  [String(history.stats.sessionsThisMonth), "buổi trong tháng"],
                  [String(history.stats.totalMinutesThisMonth), "phút tập"],
                  [fmt(history.stats.totalVolumeThisMonth), "kg khối lượng"],
                  [String(history.stats.currentStreakDays), "ngày liên tiếp"],
                ].map(([v, l]) => (
                  <View key={l} style={s.stat}>
                    <Text style={s.statValue}>{v}</Text>
                    <Text style={s.statLabel}>{l}</Text>
                  </View>
                ))}
              </View>
            )}
            {!history && loadingList && <ActivityIndicator color={C.lime} />}
            {history?.items.length === 0 && <Text style={s.empty}>Chưa có buổi tập nào. Hãy ghi buổi đầu tiên!</Text>}
            {history?.items.map((w) => (
              <View key={w.id} style={s.historyItem}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expanded === w.id }}
                  onPress={() => setExpanded(expanded === w.id ? null : w.id)}
                >
                  <View style={s.between}>
                    <Text style={s.exerciseName}>{w.title}</Text>
                    {w.newRecords.length > 0 && <Text style={s.prBadge}>🏆 PR</Text>}
                  </View>
                  <Text style={s.meta}>
                    {viDate(w.performedOn)}
                    {w.durationMinutes ? ` · ${w.durationMinutes} phút` : ""} · {fmt(w.totalVolume)} kg ·{" "}
                    {w.exercises.length} bài
                  </Text>
                </Pressable>
                {expanded === w.id && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {w.exercises.map((e) => (
                      <View key={e.id}>
                        <Text style={s.subTitle}>{e.exerciseName}</Text>
                        {e.sets.map((st) => (
                          <Text key={st.id} style={s.meta}>
                            {st.setNumber}. [{st.setType}] {fmt(st.weightKg)} kg × {st.reps}
                            {st.estimated1RM !== null ? ` · 1RM ${fmt(st.estimated1RM)}` : ""}
                            {st.isPR ? " 🏆" : ""}
                          </Text>
                        ))}
                      </View>
                    ))}
                    {w.notes ? <Text style={s.meta}>Ghi chú: {w.notes}</Text> : null}
                    <View style={s.row}>
                      <Pressable accessibilityRole="button" style={s.chip} onPress={() => edit(w)}>
                        <Text style={s.chipText}>Sửa</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        style={[s.chip, confirmDelete === w.id && { backgroundColor: C.coral }]}
                        onPress={() => void remove(w.id)}
                      >
                        <Text style={[s.chipText, confirmDelete === w.id && { color: C.ink }]}>
                          {confirmDelete === w.id ? "Bấm lần nữa để xóa" : "Xóa"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ))}
            {history && history.items.length < history.total && (
              <Pressable
                accessibilityRole="button"
                disabled={loadingList}
                onPress={() => void loadLists(history.page + 1)}
              >
                <Text style={[s.link, { textAlign: "center" }]}>{loadingList ? "Đang tải…" : "Tải thêm"}</Text>
              </Pressable>
            )}
          </>
        )}

        {tab === "records" && (
          <>
            {!records && loadingList && <ActivityIndicator color={C.lime} />}
            {records?.length === 0 && (
              <Text style={s.empty}>Chưa có kỷ lục. Ghi một hiệp R có tạ để tạo mốc cơ sở.</Text>
            )}
            {records?.map((r) => (
              <View key={r.exerciseName} style={[s.record, r.isPR && { borderColor: gold }]}>
                <View style={s.between}>
                  <Text style={s.exerciseName}>{r.exerciseName}</Text>
                  <Text style={r.isPR ? s.prBadge : s.baseBadge}>{r.isPR ? "🏆 PR" : "Mốc cơ sở"}</Text>
                </View>
                <Text style={s.recordValue}>{fmt(r.oneRepMax)} kg</Text>
                <Text style={s.meta}>
                  1RM ước tính từ {fmt(r.weightKg)} kg × {r.reps} · {viDate(r.achievedOn)}
                </Text>
              </View>
            ))}
            <Text style={s.hint}>1RM theo công thức Epley: kg × (1 + reps/30), chỉ tính hiệp R có tạ.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#121215" },
  content: { padding: 16, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center", gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#242429",
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { color: "white", fontSize: 24, fontWeight: "800", flexShrink: 1 },
  h2: { color: "white", fontSize: 17, fontWeight: "800", marginTop: 6 },
  tabs: { flexDirection: "row", backgroundColor: "#1E1E24", borderRadius: 16, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  tabOn: { backgroundColor: C.lime },
  tabText: { color: "#B9B8C3", fontWeight: "700", fontSize: 13 },
  tabTextOn: { color: C.ink },
  banner: { borderRadius: 18, padding: 16, gap: 4 },
  bannerTitle: { color: C.ink, fontWeight: "900", fontSize: 16 },
  bannerSub: { color: C.inkSoft, fontWeight: "600" },
  input: {
    backgroundColor: "#1E1E24",
    borderWidth: 1,
    borderColor: C.strokeDark,
    color: "white",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#26262E",
    borderWidth: 1,
    borderColor: C.strokeDark,
    minHeight: 40,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: C.lime, borderColor: C.lime },
  chipText: { color: "white", fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: C.ink },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  exercise: { backgroundColor: "#1B1B22", borderRadius: 20, padding: 14, gap: 8, borderWidth: 1, borderColor: C.strokeDark },
  exerciseName: { color: "white", fontSize: 17, fontWeight: "800", flexShrink: 1 },
  hint: { color: C.mutedOnDark, fontSize: 12 },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    padding: 6,
    borderRadius: 14,
    backgroundColor: "#22222A",
  },
  setDone: { backgroundColor: "#2B3320" },
  setNo: { color: C.mutedOnDark, fontWeight: "800", width: 14, textAlign: "center" },
  typeGroup: { flexDirection: "row", gap: 3 },
  type: {
    width: 29,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#2E2E38",
    alignItems: "center",
    justifyContent: "center",
  },
  typeOn: { backgroundColor: C.lavender },
  typeText: { color: "#B9B8C3", fontWeight: "800" },
  typeTextOn: { color: C.ink },
  num: {
    width: 54,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#121215",
    color: "white",
    textAlign: "center",
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.strokeDark,
  },
  check: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.strokeDark,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: C.lime, borderColor: C.lime },
  e1rm: { color: C.lime, fontSize: 12, fontWeight: "700", width: "100%", paddingLeft: 24 },
  link: { color: C.lime, fontWeight: "800", paddingVertical: 10 },
  timer: { backgroundColor: C.lavender, borderRadius: 20, padding: 14, gap: 10 },
  timerLabel: { color: C.ink, fontWeight: "800", flexShrink: 1 },
  timerClock: { color: C.ink, fontWeight: "900", fontSize: 32, fontVariant: ["tabular-nums"] },
  error: { color: "#FF9AA6", fontSize: 14 },
  errorDark: { color: "#7C2424", fontSize: 14 },
  primary: {
    backgroundColor: C.lime,
    borderRadius: 16,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: C.ink, fontWeight: "900", fontSize: 16 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { flexGrow: 1, flexBasis: "45%", backgroundColor: C.lilac, borderRadius: 18, padding: 14 },
  statValue: { color: C.ink, fontSize: 24, fontWeight: "900" },
  statLabel: { color: C.inkSoft, fontSize: 12, fontWeight: "600" },
  empty: { color: C.mutedOnDark, textAlign: "center", paddingVertical: 24 },
  historyItem: { backgroundColor: "#1B1B22", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.strokeDark },
  meta: { color: "#B9B8C3", fontSize: 13, marginTop: 2 },
  metaDark: { color: "#3A3550", fontSize: 13 },
  subTitle: { color: "white", fontWeight: "700", marginTop: 4 },
  prBadge: {
    color: C.ink,
    backgroundColor: gold,
    fontWeight: "900",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  baseBadge: {
    color: "white",
    backgroundColor: "#3B3B42",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  record: { backgroundColor: "#1B1B22", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.strokeDark, gap: 4 },
  recordValue: { color: C.lime, fontSize: 30, fontWeight: "900" },
  card: { borderRadius: 25, padding: 20, gap: 10 },
  cardTitle: { color: "#191622", fontWeight: "800", fontSize: 23 },
  big: { color: C.ink, fontSize: 44, fontWeight: "900" },
  bigUnit: { fontSize: 16, fontWeight: "700" },
  darkPill: { backgroundColor: C.ink, borderRadius: 14, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  darkPillText: { color: C.lime, fontWeight: "800" },
});
