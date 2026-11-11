import test from "node:test";
import assert from "node:assert/strict";
import { generateWorkingSlots } from "@fithub/contracts";

test("UC07 standard slots have 60 minutes of work, 15 minutes of rest and no partial last slot", () => {
  const date = "2030-05-15";
  assert.deepEqual(generateWorkingSlots(date, "08:00", "12:00"), {
    slots: [
      { startTime: "08:00", endTime: "09:00" },
      { startTime: "09:15", endTime: "10:15" },
      { startTime: "10:30", endTime: "11:30" },
    ],
    discardedMinutes: 30,
  });
  assert.deepEqual(generateWorkingSlots(date, "14:00", "16:15"), {
    slots: [
      { startTime: "14:00", endTime: "15:00" },
      { startTime: "15:15", endTime: "16:15" },
    ],
    discardedMinutes: 0,
  });
  assert.throws(
    () => generateWorkingSlots(date, "08:00", "08:45"),
    /RANGE_TOO_SHORT/,
  );
});
