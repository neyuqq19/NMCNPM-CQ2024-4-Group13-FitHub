/**
 * BR04 — personal records, as a pure function so it can be unit tested.
 *
 * Records are rebuilt by replaying every session of one exercise in
 * chronological order. Doing it this way (instead of only comparing a new
 * session with the stored record) keeps PersonalRecord and every set's isPR
 * flag correct after an edit, a delete, or a session logged with a past date.
 */
export interface ReplaySet {
  id: string;
  setNumber: number;
  estimated1RM: number | null;
}
export interface ReplaySession {
  id: string;
  performedOn: string; // YYYY-MM-DD
  createdAt: Date;
  sets: ReplaySet[];
}
export interface ReplayResult {
  /** Sets that set a new record when they were performed (isPR = true). */
  prSetIds: Set<string>;
  /** Current best, or null when no valid R set remains. */
  record: {
    sessionId: string;
    setId: string;
    oneRepMax: number;
    /** True while the first session's best has never been beaten. */
    isBaseline: boolean;
  } | null;
}

export function replayPersonalRecords(sessions: ReplaySession[]): ReplayResult {
  const ordered = [...sessions].sort(
    (a, b) =>
      a.performedOn.localeCompare(b.performedOn) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  const prSetIds = new Set<string>();
  let record: ReplayResult["record"] = null;
  for (const session of ordered) {
    // Best valid set of this session; the earliest set wins a tie.
    let best: ReplaySet | null = null;
    for (const set of [...session.sets].sort((a, b) => a.setNumber - b.setNumber))
      if (set.estimated1RM !== null && (!best || set.estimated1RM > best.estimated1RM!))
        best = set;
    if (!best) continue;
    if (!record) {
      // First time this exercise is trained: baseline, never a PR.
      record = { sessionId: session.id, setId: best.id, oneRepMax: best.estimated1RM!, isBaseline: true };
    } else if (best.estimated1RM! > record.oneRepMax) {
      // Strictly greater only; matching the record is not a new PR.
      prSetIds.add(best.id);
      record = { sessionId: session.id, setId: best.id, oneRepMax: best.estimated1RM!, isBaseline: false };
    }
  }
  return { prSetIds, record };
}

/** BR01 — total volume in kg, rounded to 2 decimals. */
export function totalVolume(sets: { reps: number; weightKg: number }[]) {
  return Math.round(sets.reduce((n, s) => n + s.reps * s.weightKg * 100, 0)) / 100;
}

/** Consecutive training days ending today, or yesterday if today has none. */
export function currentStreak(days: Set<string>, today: string) {
  const step = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  };
  let cursor = days.has(today) ? today : step(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = step(cursor);
  }
  return streak;
}
