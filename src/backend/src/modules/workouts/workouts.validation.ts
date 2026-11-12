import { BadRequestException } from "@nestjs/common";
import {
  WORKOUT_LIMITS as L,
  WORKOUT_SET_TYPES,
  type WorkoutSetType,
} from "@fithub/contracts";

export interface ParsedSet {
  setNumber: number;
  setType: WorkoutSetType;
  reps: number;
  weightKg: number;
}
export interface ParsedExercise {
  exerciseName: string;
  exerciseKey: string;
  orderIndex: number;
  sets: ParsedSet[];
}
export interface ParsedWorkout {
  title: string;
  performedOn: string;
  durationMinutes: number | null;
  notes: string | null;
  exercises: ParsedExercise[];
}

function invalid(fieldErrors: Record<string, string>): never {
  throw new BadRequestException({
    code: "VALIDATION_ERROR",
    message: "Vui lòng kiểm tra các trường được đánh dấu.",
    fieldErrors,
  });
}
function empty(message: string): never {
  throw new BadRequestException({ code: "EMPTY_WORKOUT_SESSION", message });
}

export const collapse = (value: string) => value.trim().replace(/\s+/g, " ");
export const exerciseKey = (name: string) => collapse(name).toLowerCase();

export function todayInGym(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const hasAtMostTwoDecimals = (n: number) =>
  Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** Validates and normalises a create/update body. Throws 400 on any problem. */
export function parseWorkoutInput(body: unknown, now = new Date()): ParsedWorkout {
  if (!isRecord(body)) invalid({ form: "Dữ liệu không hợp lệ." });
  const b = body;
  const errors: Record<string, string> = {};
  const allowed = ["title", "performedOn", "durationMinutes", "notes", "exercises"];
  for (const key of Object.keys(b))
    if (!allowed.includes(key)) errors[key] = "Trường này không được hỗ trợ.";

  const title = typeof b.title === "string" ? collapse(b.title) : "";
  if (!title || title.length > L.titleMax)
    errors.title = `Tiêu đề buổi tập cần từ 1 đến ${L.titleMax} ký tự.`;

  const performedOn = typeof b.performedOn === "string" ? b.performedOn : "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(performedOn) ||
    !Number.isFinite(Date.parse(`${performedOn}T00:00:00Z`)) ||
    new Date(`${performedOn}T00:00:00Z`).toISOString().slice(0, 10) !== performedOn
  )
    errors.performedOn = "Ngày tập không hợp lệ (định dạng YYYY-MM-DD).";
  else if (performedOn > todayInGym(now))
    errors.performedOn = "Ngày tập không được nằm trong tương lai.";

  let durationMinutes: number | null = null;
  if (b.durationMinutes !== undefined && b.durationMinutes !== null) {
    const d = b.durationMinutes;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > L.durationMinutesMax)
      errors.durationMinutes = `Thời lượng là số phút nguyên từ 1 đến ${L.durationMinutesMax}.`;
    else durationMinutes = d;
  }

  let notes: string | null = null;
  if (b.notes !== undefined && b.notes !== null) {
    if (typeof b.notes !== "string" || b.notes.length > L.notesMax)
      errors.notes = `Ghi chú tối đa ${L.notesMax} ký tự.`;
    else notes = b.notes.trim() || null;
  }

  if (Object.keys(errors).length) invalid(errors);

  if (!Array.isArray(b.exercises) || b.exercises.length === 0)
    empty("Buổi tập cần ít nhất 1 bài tập và 1 hiệp tập hợp lệ.");
  if (b.exercises.length > L.exercisesMax)
    invalid({ exercises: `Tối đa ${L.exercisesMax} bài tập trong một buổi.` });

  const seen = new Set<string>();
  const exercises: ParsedExercise[] = b.exercises.map((raw, i) => {
    const path = `exercises[${i}]`;
    if (!isRecord(raw)) invalid({ [path]: "Bài tập không hợp lệ." });
    const name = typeof raw.exerciseName === "string" ? collapse(raw.exerciseName) : "";
    if (!name || name.length > L.exerciseNameMax)
      invalid({ [`${path}.exerciseName`]: `Tên bài tập cần từ 1 đến ${L.exerciseNameMax} ký tự.` });
    const key = exerciseKey(name);
    if (seen.has(key))
      invalid({ [`${path}.exerciseName`]: `Bài "${name}" bị lặp; hãy gộp các hiệp vào một bài.` });
    seen.add(key);
    if (!Array.isArray(raw.sets) || raw.sets.length === 0)
      empty(`Bài "${name}" chưa có hiệp tập nào.`);
    if (raw.sets.length > L.setsPerExerciseMax)
      invalid({ [`${path}.sets`]: `Tối đa ${L.setsPerExerciseMax} hiệp cho một bài.` });
    const sets: ParsedSet[] = raw.sets.map((s, j) => {
      const sp = `${path}.sets[${j}]`;
      if (!isRecord(s)) invalid({ [sp]: "Hiệp tập không hợp lệ." });
      const setErrors: Record<string, string> = {};
      if (!WORKOUT_SET_TYPES.includes(s.setType as WorkoutSetType))
        setErrors[`${sp}.setType`] = "Loại hiệp chỉ nhận W, R, D hoặc F.";
      if (typeof s.reps !== "number" || !Number.isInteger(s.reps) || s.reps < 1 || s.reps > L.repsMax)
        setErrors[`${sp}.reps`] = `Số lần lặp là số nguyên từ 1 đến ${L.repsMax}.`;
      if (
        typeof s.weightKg !== "number" ||
        !Number.isFinite(s.weightKg) ||
        s.weightKg < 0 ||
        s.weightKg > L.weightKgMax ||
        !hasAtMostTwoDecimals(s.weightKg)
      )
        setErrors[`${sp}.weightKg`] =
          `Mức tạ từ 0 đến ${L.weightKgMax} kg, tối đa 2 chữ số thập phân.`;
      if (Object.keys(setErrors).length) invalid(setErrors);
      return {
        setNumber: j + 1,
        setType: s.setType as WorkoutSetType,
        reps: s.reps as number,
        weightKg: Math.round((s.weightKg as number) * 100) / 100,
      };
    });
    return { exerciseName: name, exerciseKey: key, orderIndex: i, sets };
  });

  return { title, performedOn, durationMinutes, notes, exercises };
}
