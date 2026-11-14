import test from "node:test";
import assert from "node:assert/strict";
import {
  canVerifyNoShow,
  memberCancelOutcome,
  overlaps,
  ptCancelOutcome,
} from "../src/modules/pt-bookings/pt-bookings.rules";

const MIN = 60_000;
const HOUR = 60 * MIN;
const start = new Date("2030-05-15T02:00:00Z"); // 09:00 giờ phòng tập
const at = (msBeforeStart: number) => new Date(start.getTime() - msBeforeStart);

test("BR04 hội viên: đúng 12h00 được hoàn, 11h59 bị trừ buổi", () => {
  assert.equal(memberCancelOutcome(start, at(12 * HOUR)), "REFUND");
  assert.equal(memberCancelOutcome(start, at(12 * HOUR + MIN)), "REFUND");
  assert.equal(memberCancelOutcome(start, at(12 * HOUR - MIN)), "CONSUME");
  assert.equal(memberCancelOutcome(start, at(MIN)), "CONSUME");
});

test("BR04 PT: đúng 6h00 chỉ hoàn, 5h59 hoàn và đền bù thêm 1 buổi", () => {
  assert.equal(ptCancelOutcome(start, at(6 * HOUR)), "REFUND");
  assert.equal(ptCancelOutcome(start, at(24 * HOUR)), "REFUND");
  assert.equal(ptCancelOutcome(start, at(6 * HOUR - MIN)), "REFUND_WITH_COMPENSATION");
  assert.equal(ptCancelOutcome(start, at(MIN)), "REFUND_WITH_COMPENSATION");
});

test("A3: chỉ xác minh NO_SHOW khi now >= endTime", () => {
  const end = new Date(start.getTime() + HOUR);
  assert.equal(canVerifyNoShow(end, new Date(end.getTime() - 1)), false);
  assert.equal(canVerifyNoShow(end, end), true);
  assert.equal(canVerifyNoShow(end, new Date(end.getTime() + MIN)), true);
});

test("hai ca chạm nhau đúng tại giờ kết thúc không bị coi là trùng", () => {
  const a = { startTime: start, endTime: new Date(start.getTime() + HOUR) };
  const next = { startTime: a.endTime, endTime: new Date(a.endTime.getTime() + HOUR) };
  const clash = { startTime: new Date(start.getTime() + 30 * MIN), endTime: new Date(start.getTime() + 90 * MIN) };
  assert.equal(overlaps(a, next), false);
  assert.equal(overlaps(a, clash), true);
});
