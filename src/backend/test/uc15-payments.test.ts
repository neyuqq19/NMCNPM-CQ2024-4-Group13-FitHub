/**
 * UC15 — kiểm thử tích hợp qua HTTP với database test.
 *
 * Chuẩn bị (ví dụ): DATABASE_URL/DIRECT_URL trỏ tới database `fithub_test`, đã migrate + seed;
 * chạy API với cùng database và VNPAY_MODE=SIMULATED (khóa dev mặc định), rồi:
 *   API_URL=http://127.0.0.1:3101 npx tsx --test backend/test/uc15-payments.test.ts
 * Fixture hội viên được tạo trực tiếp bằng Prisma; test từ chối chạy nếu database không phải `fithub_test`.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  DEV_VNPAY_SECRET,
  verifyVnpSignature,
  withSignature,
} from "../src/modules/payments/vnpay.crypto";

const API = process.env.API_URL || "http://127.0.0.1:3101";
const SECRET = process.env.VNPAY_HASH_SECRET || DEV_VNPAY_SECRET;
const TMN = process.env.VNPAY_TMN_CODE || "FITHUBSIM";
const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (new URL(url.replace(/^postgres(ql)?:/, "http:")).pathname !== "/fithub_test")
  throw new Error("UC15 test chỉ chạy trên database local fithub_test.");
const db = new PrismaClient({ datasources: { db: { url } } });
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date());

let adminToken = "";
let pack: { id: string; price: number };

async function call<T = any>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(init.token === null ? {} : { Authorization: `Bearer ${init.token ?? adminToken}` }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
const get = async (id: string) => (await call(`/api/payments/${id}`)).body;

/** Hội viên ACTIVE đã xác minh, chưa có gói, tạo trực tiếp trong DB test. */
async function newMember(status: "ACTIVE" | "LOCKED" = "ACTIVE") {
  const tag = randomUUID().slice(0, 8);
  const user = await db.user.create({
    data: {
      email: `uc15-${tag}@example.com`,
      displayName: `UC15 ${tag}`,
      passwordHash: `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`,
      role: "MEMBER",
      status,
      verifiedAt: new Date(),
    },
  });
  const profile = await db.memberProfile.create({
    data: { userId: user.id, memberCode: `UC15-${tag}` },
  });
  return { user, profile };
}
/** Đăng ký gói cho hội viên mới và trả về khoản chờ thanh toán. */
async function order() {
  const m = await newMember();
  const r = await call(`/api/members/${m.profile.id}/memberships`, {
    body: { requestId: randomUUID(), packageId: pack.id, startsOn: today, expectedPrice: pack.price },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { ...m, payment: r.body as { id: string; code: string; amount: number } };
}
async function startOnline(paymentId: string) {
  const r = await call(`/api/payments/${paymentId}/vnpay-url`, { body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { paymentUrl: string; txnRef: string; amount: number; mode: string };
}
function ipn(txnRef: string, amountVnd: number, ok = true, tamper?: (q: Record<string, string>) => void) {
  const q: Record<string, string> = {
    vnp_TmnCode: TMN,
    vnp_Amount: String(amountVnd * 100),
    vnp_TxnRef: txnRef,
    vnp_BankCode: "NCB",
    vnp_TransactionNo: String(Date.now()).slice(-9),
    vnp_ResponseCode: ok ? "00" : "24",
    vnp_TransactionStatus: ok ? "00" : "02",
    vnp_PayDate: "20261113100000",
  };
  const signed = withSignature(q, SECRET);
  tamper?.(signed);
  return call(`/api/webhooks/vnpay?${new URLSearchParams(signed)}`, { token: null });
}
async function eventually<T>(fn: () => Promise<T | undefined | false>, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("Hết thời gian chờ điều kiện.");
    await new Promise((r) => setTimeout(r, 150));
  }
}
const confirmBody = (amount: number, extra: object = {}) => ({ idempotencyKey: randomUUID(), amount, ...extra });

before(async () => {
  const login = await call("/api/auth/login", {
    token: null,
    body: {
      identifier: "admin@fithub.vn",
      password: process.env.SEED_PASSWORD || "FitHubDemo!2026",
      platform: "WEB",
      deviceId: randomUUID(),
      requestId: randomUUID(),
    },
  });
  assert.equal(login.status, 200, "Không đăng nhập được Admin seed.");
  adminToken = login.body.accessToken;
  const packs = (await call("/api/packages")).body as { id: string; price: number; grantsGymAccess: boolean }[];
  const p = packs.find((x) => x.grantsGymAccess);
  assert.ok(p, "Cần ít nhất một gói có quyền vào gym trong seed.");
  pack = p;
});

describe("PAY-01/02 — thu tại quầy", () => {
  it("CASH: xác nhận, cấp gói, phát hành hóa đơn; gửi lại cùng khóa trả kết quả cũ", async () => {
    const o = await order();
    const body = confirmBody(o.payment.amount);
    const a = await call(`/api/payments/${o.payment.id}/confirm`, { body });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.status, "CONFIRMED");
    assert.equal(a.body.method, "CASH");
    assert.equal(a.body.membership.status, "ACTIVE");
    assert.equal(a.body.benefitStatus, "GRANTED");
    assert.equal(a.body.invoice?.status, "ISSUED");
    assert.match(a.body.invoice.code, /^INV-\d{8}-\d{4,}$/);
    const again = await call(`/api/payments/${o.payment.id}/confirm`, { body });
    assert.equal(again.status, 200);
    assert.equal(again.body.confirmedAt, a.body.confirmedAt);
    assert.equal(again.body.invoice.code, a.body.invoice.code);
  });
  it("khóa khác hoặc đơn đã hủy → 409 PAYMENT_ALREADY_PROCESSED; sai số tiền → AMOUNT_MISMATCH", async () => {
    const o = await order();
    const wrong = await call(`/api/payments/${o.payment.id}/confirm`, { body: confirmBody(o.payment.amount + 1) });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.code, "AMOUNT_MISMATCH");
    await call(`/api/payments/${o.payment.id}/confirm`, { body: confirmBody(o.payment.amount) });
    const other = await call(`/api/payments/${o.payment.id}/confirm`, { body: confirmBody(o.payment.amount) });
    assert.equal(other.status, 409);
    assert.equal(other.body.code, "PAYMENT_ALREADY_PROCESSED");
    const c = await order();
    await call(`/api/payments/${c.payment.id}/cancel`, { body: {} });
    const cancelled = await call(`/api/payments/${c.payment.id}/confirm`, { body: confirmBody(c.payment.amount) });
    assert.equal(cancelled.body.code, "PAYMENT_ALREADY_PROCESSED");
  });
  it("BANK_TRANSFER lưu hình thức và tham chiếu", async () => {
    const o = await order();
    const r = await call(`/api/payments/${o.payment.id}/confirm`, {
      body: confirmBody(o.payment.amount, { method: "BANK_TRANSFER", reference: "FT26111300123" }),
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.method, "BANK_TRANSFER");
    assert.equal(r.body.transferReference, "FT26111300123");
    assert.equal(r.body.confirmedBy !== null, true);
  });
  it("hình thức không hợp lệ bị từ chối", async () => {
    const o = await order();
    const r = await call(`/api/payments/${o.payment.id}/confirm`, {
      body: confirmBody(o.payment.amount, { method: "VNPAY" }),
    });
    assert.equal(r.status, 400);
  });
});

describe("PAY-03 — VNPay", () => {
  it("URL đã ký đúng: vnp_Amount = số tiền × 100; bấm lại khi còn hạn dùng lại cùng txnRef", async () => {
    const o = await order();
    const a = await startOnline(o.payment.id);
    const q = Object.fromEntries(new URL(a.paymentUrl).searchParams.entries());
    assert.equal(q.vnp_Amount, String(o.payment.amount * 100));
    assert.equal(q.vnp_TxnRef, a.txnRef);
    assert.equal(verifyVnpSignature(q, SECRET), true);
    const b = await startOnline(o.payment.id);
    assert.equal(b.txnRef, a.txnRef);
  });
  it("IPN thành công: đã thu qua VNPay, gói ACTIVE, không có người thu; gửi lại IPN không cấp lần hai", async () => {
    const o = await order();
    const a = await startOnline(o.payment.id);
    const r = await ipn(a.txnRef, o.payment.amount);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.RspCode, "00");
    const p = await get(o.payment.id);
    assert.equal(p.status, "CONFIRMED");
    assert.equal(p.method, "VNPAY");
    assert.equal(p.confirmedBy, null);
    assert.equal(p.membership.status, "ACTIVE");
    assert.equal(p.benefitStatus, "GRANTED");
    const inv = await eventually(async () => (await get(o.payment.id)).invoice?.status === "ISSUED" && (await get(o.payment.id)).invoice);
    assert.match(inv.code, /^INV-/);
    const dup = await ipn(a.txnRef, o.payment.amount);
    assert.equal(dup.status, 200);
    assert.equal(dup.body.code, "ALREADY_PROCESSED");
    const p2 = await get(o.payment.id);
    assert.equal(p2.confirmedAt, p.confirmedAt);
    assert.equal(p2.reconciliationStatus, "NONE");
  });
  it("sai chữ ký → 400 INVALID_SIGNATURE, không đổi dữ liệu; sai số tiền → 400 AMOUNT_MISMATCH", async () => {
    const o = await order();
    const a = await startOnline(o.payment.id);
    const bad = await ipn(a.txnRef, o.payment.amount, true, (q) => {
      q.vnp_SecureHash = (q.vnp_SecureHash[0] === "0" ? "1" : "0") + q.vnp_SecureHash.slice(1);
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, "INVALID_SIGNATURE");
    const edited = await ipn(a.txnRef, o.payment.amount, true, (q) => (q.vnp_Amount = "100"));
    assert.equal(edited.body.code, "INVALID_SIGNATURE");
    const wrongAmount = await ipn(a.txnRef, o.payment.amount - 1);
    assert.equal(wrongAmount.status, 400);
    assert.equal(wrongAmount.body.code, "AMOUNT_MISMATCH");
    assert.equal((await get(o.payment.id)).status, "PENDING");
    const unknown = await ipn("GD999999A1", 1000);
    assert.equal(unknown.status, 404);
  });
  it("thất bại → FAILED (gói vẫn chờ); thử lại tạo txnRef mới và thanh toán được", async () => {
    const o = await order();
    const a = await startOnline(o.payment.id);
    assert.equal((await ipn(a.txnRef, o.payment.amount, false)).status, 200);
    const failed = await get(o.payment.id);
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.membership.status, "PENDING_PAYMENT");
    const retry = await startOnline(o.payment.id);
    assert.notEqual(retry.txnRef, a.txnRef);
    assert.equal((await get(o.payment.id)).status, "PENDING");
    assert.equal((await ipn(retry.txnRef, o.payment.amount)).status, 200);
    assert.equal((await get(o.payment.id)).status, "CONFIRMED");
    // IPN thất bại đến muộn không hoàn tác khoản đã thu
    await ipn(a.txnRef, o.payment.amount, false);
    assert.equal((await get(o.payment.id)).status, "CONFIRMED");
  });
  it("thu quầy khi VNPay còn hạn → 409 ONLINE_PAYMENT_IN_PROGRESS", async () => {
    const o = await order();
    await startOnline(o.payment.id);
    const r = await call(`/api/payments/${o.payment.id}/confirm`, { body: confirmBody(o.payment.amount) });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "ONLINE_PAYMENT_IN_PROGRESS");
  });
  it("hai lần thử cùng thành công → khoản thu thừa được đánh dấu cần đối soát, không cấp gói hai lần", async () => {
    const o = await order();
    const a1 = await startOnline(o.payment.id);
    await ipn(a1.txnRef, o.payment.amount, false);
    const a2 = await startOnline(o.payment.id);
    assert.equal((await ipn(a1.txnRef, o.payment.amount)).status, 200); // lần thử cũ vẫn được ghi nhận
    assert.equal((await get(o.payment.id)).status, "CONFIRMED");
    const dup = await ipn(a2.txnRef, o.payment.amount);
    assert.equal(dup.status, 200);
    const p = await get(o.payment.id);
    assert.equal(p.reconciliationStatus, "MISMATCHED");
    assert.equal(p.benefitStatus, "GRANTED");
    assert.equal(p.membership.status, "ACTIVE");
    const noNote = await call(`/api/payments/${o.payment.id}/reconcile`, { body: { action: "DISMISS" } });
    assert.equal(noNote.status, 400);
    const done = await call(`/api/payments/${o.payment.id}/reconcile`, { body: { action: "DISMISS", note: "Đã hoàn tiền lần thanh toán thừa" } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.reconciliationStatus, "RECONCILED");
    assert.equal(done.body.membership.status, "ACTIVE");
  });
});

describe("PAY-05 / E3 — đã thu tiền nhưng chưa cấp được quyền lợi", () => {
  it("hội viên không đủ điều kiện lúc IPN → NEEDS_REVIEW; sau khi đủ điều kiện, Admin cấp lại gói", async () => {
    const o = await order();
    const a = await startOnline(o.payment.id);
    await db.user.update({ where: { id: o.user.id }, data: { status: "LOCKED" } });
    assert.equal((await ipn(a.txnRef, o.payment.amount)).status, 200);
    const p = await get(o.payment.id);
    assert.equal(p.status, "CONFIRMED"); // tiền đã vào luôn được ghi nhận
    assert.equal(p.benefitStatus, "NEEDS_REVIEW");
    assert.equal(p.reconciliationStatus, "MISMATCHED");
    assert.equal(p.membership.status, "PENDING_PAYMENT");
    const blocked = await call(`/api/payments/${o.payment.id}/reconcile`, { body: { action: "GRANT" } });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, "MEMBER_NOT_ELIGIBLE");
    await db.user.update({ where: { id: o.user.id }, data: { status: "ACTIVE" } });
    const ok = await call(`/api/payments/${o.payment.id}/reconcile`, { body: { action: "GRANT" } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.benefitStatus, "GRANTED");
    assert.equal(ok.body.reconciliationStatus, "RECONCILED");
    assert.equal(ok.body.membership.status, "ACTIVE");
    const nothing = await call(`/api/payments/${o.payment.id}/reconcile`, { body: { action: "GRANT" } });
    assert.equal(nothing.body.code, "NOTHING_TO_RECONCILE");
  });
  it("IPN thành công đến sau khi đơn bị hủy → ghi nhận khoản thu, cần đối soát, không tự cấp gói", async () => {
    const o = await order();
    const a = await startOnline(o.payment.id);
    assert.equal((await call(`/api/payments/${o.payment.id}/cancel`, { body: {} })).status, 200);
    assert.equal((await ipn(a.txnRef, o.payment.amount)).status, 200);
    const p = await get(o.payment.id);
    assert.equal(p.status, "CONFIRMED");
    assert.equal(p.benefitStatus, "NEEDS_REVIEW");
    assert.equal(p.membership.status, "CANCELLED");
    const list = await call("/api/payments?status=NEEDS_REVIEW");
    assert.ok(list.body.items.some((x: { id: string }) => x.id === o.payment.id));
    const done = await call(`/api/payments/${o.payment.id}/reconcile`, { body: { action: "DISMISS", note: "Hoàn tiền cho hội viên" } });
    assert.equal(done.body.benefitStatus, "NONE");
    assert.equal(done.body.reconciliationStatus, "RECONCILED");
  });
});

describe("PAY-04 — hóa đơn", () => {
  it("không phát hành hóa đơn cho khoản chưa thu; phát hành lại hóa đơn đã có là idempotent", async () => {
    const o = await order();
    const early = await call(`/api/payments/${o.payment.id}/retry-invoice`, { body: {} });
    assert.equal(early.status, 409);
    await call(`/api/payments/${o.payment.id}/confirm`, { body: confirmBody(o.payment.amount) });
    const before = (await get(o.payment.id)).invoice;
    const r = await call(`/api/payments/${o.payment.id}/retry-invoice`, { body: {} });
    assert.equal(r.status, 200);
    assert.equal(r.body.invoice.code, before.code);
    const inv = await call(`/api/payments/${o.payment.id}/invoice`);
    assert.equal(inv.status, 200);
    assert.ok(inv.body.receipt);
    assert.equal(inv.body.receipt.amount, o.payment.amount);
  });
  it("chưa đăng nhập → 401", async () => {
    const o = await order();
    assert.equal((await call(`/api/payments/${o.payment.id}/invoice`, { token: "x" })).status, 401);
    assert.equal((await call(`/api/payments/${o.payment.id}/vnpay-url`, { token: "x", body: {} })).status, 401);
  });
});
