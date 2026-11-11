export interface WorkingSlotDto {
  id: string;
  trainerId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  status: "OPEN" | "BOOKED" | "UNAVAILABLE";
  unavailableReason: string | null;
  member: { displayName: string; memberCode: string } | null;
}

export interface RegisterAvailabilityRequest {
  date: string;
  startTime: string;
  endTime: string;
}

export interface RegisterAvailabilityResponse {
  slots: WorkingSlotDto[];
  discardedMinutes: number;
}

export interface SetSlotAvailabilityRequest {
  status: "OPEN" | "UNAVAILABLE";
  reason?: string;
}

function minutes(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("INVALID_RANGE");
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function clock(total: number) {
  return [Math.floor(total / 60), total % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function generateWorkingSlots(
  date: string,
  startTime: string,
  endTime: string,
) {
  const day = new Date(date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date
  )
    throw new Error("INVALID_RANGE");
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start < 6 * 60 || end > 22 * 60 || end <= start)
    throw new Error("INVALID_RANGE");
  if (end - start < 60) throw new Error("RANGE_TOO_SHORT");
  const slots = [];
  let lastEnd = start;
  for (let cursor = start; cursor + 60 <= end; cursor += 75) {
    lastEnd = cursor + 60;
    slots.push({ startTime: clock(cursor), endTime: clock(lastEnd) });
  }
  return { slots, discardedMinutes: end - lastEnd };
}
