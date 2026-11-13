import test from "node:test";
import assert from "node:assert/strict";
import {
  appointmentReminderTimes,
  appointmentStartFromReminder,
  buildContent,
  expiryReminderAt,
  expiryReminderTimes,
} from "../src/modules/notifications/notifications.rules";

const HOUR = 3600_000;
const now = new Date("2026-11-12T00:00:00Z");

test("BR01: an appointment more than 24h away gets the 24h and the 2h reminder", () => {
  const start = new Date(now.getTime() + 48 * HOUR);
  const times = appointmentReminderTimes(start, now);
  assert.deepEqual(times.map((t) => t.type), ["PT_REMINDER_24H", "PT_REMINDER_2H"]);
  assert.equal(times[0]!.scheduledAt.getTime(), start.getTime() - 24 * HOUR);
  assert.equal(times[1]!.scheduledAt.getTime(), start.getTime() - 2 * HOUR);
});

test("BR01: booked 10h ahead -> only the 2h reminder, never one in the past", () => {
  const times = appointmentReminderTimes(new Date(now.getTime() + 10 * HOUR), now);
  assert.deepEqual(times.map((t) => t.type), ["PT_REMINDER_2H"]);
});

test("BR01: booked less than 2h ahead -> no reminder at all", () => {
  assert.deepEqual(appointmentReminderTimes(new Date(now.getTime() + HOUR), now), []);
});

test("appointment start is recovered from a reminder and its type", () => {
  const start = new Date("2026-11-13T01:00:00Z");
  for (const t of appointmentReminderTimes(start, now))
    assert.equal(appointmentStartFromReminder(t.type, t.scheduledAt).getTime(), start.getTime());
});

test("BR02: package expiry reminders are 7 and 3 days before the end date at 08:00 gym time", () => {
  const ends = new Date("2026-11-30T00:00:00Z");
  assert.equal(expiryReminderAt("PACKAGE_EXPIRY_7D", ends).toISOString(), "2026-11-23T01:00:00.000Z");
  assert.equal(expiryReminderAt("PACKAGE_EXPIRY_3D", ends).toISOString(), "2026-11-27T01:00:00.000Z");
  assert.equal(expiryReminderTimes(ends, now).length, 2);
});

test("BR02: reminders already in the past are not created", () => {
  // Ends in 5 days: the 7-day moment has passed, the 3-day one has not.
  const ends = new Date("2026-11-17T00:00:00Z");
  assert.deepEqual(expiryReminderTimes(ends, now).map((t) => t.type), ["PACKAGE_EXPIRY_3D"]);
  assert.deepEqual(expiryReminderTimes(new Date("2026-11-13T00:00:00Z"), now), []);
});

test("notification content routes to the right screen", () => {
  const start = new Date("2026-11-13T01:00:00Z");
  const pt = buildContent("PT_REMINDER_2H", { startsAt: start });
  assert.equal(pt.type, "PT_REMINDER");
  assert.equal(pt.targetScreen, "PT_APPOINTMENTS");
  const pkg = buildContent("PACKAGE_EXPIRY_7D", {
    endsBefore: new Date("2026-11-30T00:00:00Z"),
    packageName: "Gói 3 tháng",
  });
  assert.equal(pkg.type, "PACKAGE_EXPIRY");
  assert.equal(pkg.targetScreen, "MY_PACKAGE");
  assert.match(pkg.body, /29\/11\/2026/); // endsBefore is exclusive: last day is the 29th
});
