// UC13 — pure rules (no database): Epley 1RM, volume, PR replay, streak.
import test from "node:test";
import assert from "node:assert/strict";
import { calculateEpley1RM } from "@fithub/contracts";
import {
  currentStreak,
  replayPersonalRecords,
  totalVolume,
} from "../src/modules/workouts/workouts.rules";
import { parseWorkoutInput } from "../src/modules/workouts/workouts.validation";

test("UC13-BR02/BR03: Epley 1RM only for R sets with external load", () => {
  assert.equal(calculateEpley1RM("R", 100, 5), 116.67);
  assert.equal(calculateEpley1RM("R", 105, 5), 122.5);
  assert.equal(calculateEpley1RM("R", 80, 5), 93.33);
  assert.equal(calculateEpley1RM("R", 120, 1), 120);
  for (const t of ["W", "D", "F"] as const)
    assert.equal(calculateEpley1RM(t, 100, 5), null);
  assert.equal(calculateEpley1RM("R", 0, 15), null);
});

test("UC13-BR01: total volume is the sum of reps x weight", () => {
  assert.equal(totalVolume([{ reps: 10, weightKg: 60 }, { reps: 5, weightKg: 100 }]), 1100);
  assert.equal(totalVolume([{ reps: 3, weightKg: 0.1 }]), 0.3);
  assert.equal(totalVolume([]), 0);
});

const at = (s: string) => new Date(`${s}T10:00:00Z`);
test("UC13-BR04: first session is a baseline, only a strictly higher 1RM is a PR", () => {
  const first = { id: "s1", performedOn: "2026-11-01", createdAt: at("2026-11-01"), sets: [
    { id: "a", setNumber: 1, estimated1RM: null },
    { id: "b", setNumber: 2, estimated1RM: 116.67 },
  ] };
  let r = replayPersonalRecords([first]);
  assert.deepEqual([...r.prSetIds], []);
  assert.deepEqual(r.record, { sessionId: "s1", setId: "b", oneRepMax: 116.67, isBaseline: true });

  const equal = { id: "s2", performedOn: "2026-11-02", createdAt: at("2026-11-02"), sets: [
    { id: "c", setNumber: 1, estimated1RM: 116.67 },
  ] };
  const better = { id: "s3", performedOn: "2026-11-03", createdAt: at("2026-11-03"), sets: [
    { id: "d", setNumber: 1, estimated1RM: 120 },
    { id: "e", setNumber: 2, estimated1RM: 122.5 },
  ] };
  r = replayPersonalRecords([better, equal, first]);
  assert.deepEqual([...r.prSetIds], ["e"]);
  assert.deepEqual(r.record, { sessionId: "s3", setId: "e", oneRepMax: 122.5, isBaseline: false });

  // Deleting the baseline session promotes the next one to baseline.
  r = replayPersonalRecords([better, equal]);
  assert.deepEqual([...r.prSetIds], ["e"]);
  assert.equal(r.record?.isBaseline, false);
  r = replayPersonalRecords([better]);
  assert.deepEqual([...r.prSetIds], []);
  assert.equal(r.record?.isBaseline, true);
  assert.equal(replayPersonalRecords([]).record, null);
});

test("UC13: streak counts consecutive days ending today or yesterday", () => {
  const days = new Set(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-08"]);
  assert.equal(currentStreak(days, "2026-11-12"), 3);
  assert.equal(currentStreak(days, "2026-11-13"), 3);
  assert.equal(currentStreak(days, "2026-11-14"), 0);
});

test("UC13: input validation rejects bad sets and empty sessions", () => {
  const now = new Date("2026-11-12T05:00:00Z");
  const ok = {
    title: "  Leg   Day ",
    performedOn: "2026-11-12",
    exercises: [{ exerciseName: " Back  Squat ", sets: [{ setType: "R", reps: 5, weightKg: 100 }] }],
  };
  const parsed = parseWorkoutInput(ok, now);
  assert.equal(parsed.title, "Leg Day");
  assert.equal(parsed.exercises[0].exerciseKey, "back squat");
  const code = (body: unknown) => {
    try {
      parseWorkoutInput(body, now);
      return "OK";
    } catch (e: any) {
      return e.getResponse().code;
    }
  };
  const withSet = (set: object) => ({ ...ok, exercises: [{ exerciseName: "X", sets: [set] }] });
  assert.equal(code({ ...ok, exercises: [] }), "EMPTY_WORKOUT_SESSION");
  assert.equal(code({ ...ok, exercises: [{ exerciseName: "X", sets: [] }] }), "EMPTY_WORKOUT_SESSION");
  assert.equal(code(withSet({ setType: "X", reps: 5, weightKg: 10 })), "VALIDATION_ERROR");
  assert.equal(code(withSet({ setType: "R", reps: 0, weightKg: 10 })), "VALIDATION_ERROR");
  assert.equal(code(withSet({ setType: "R", reps: 501, weightKg: 10 })), "VALIDATION_ERROR");
  assert.equal(code(withSet({ setType: "R", reps: 2.5, weightKg: 10 })), "VALIDATION_ERROR");
  assert.equal(code(withSet({ setType: "R", reps: 5, weightKg: -1 })), "VALIDATION_ERROR");
  assert.equal(code(withSet({ setType: "R", reps: 5, weightKg: 1000.01 })), "VALIDATION_ERROR");
  assert.equal(code(withSet({ setType: "R", reps: 500, weightKg: 1000 })), "OK");
  assert.equal(code(withSet({ setType: "W", reps: 1, weightKg: 0 })), "OK");
  assert.equal(code({ ...ok, performedOn: "2026-11-13" }), "VALIDATION_ERROR");
  assert.equal(code({ ...ok, performedOn: "2026-02-30" }), "VALIDATION_ERROR");
  assert.equal(
    code({ ...ok, exercises: [ok.exercises[0], { exerciseName: "back squat", sets: ok.exercises[0].sets }] }),
    "VALIDATION_ERROR",
  );
});
