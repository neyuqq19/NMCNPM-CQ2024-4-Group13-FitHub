/**
 * Kiểm thử logic thuần của VNPay/hóa đơn (không cần database).
 * Chạy: npx tsx --test backend/test/vnpay.crypto.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVnpPaymentUrl,
  canonicalQuery,
  formatVnpDate,
  fromVnpAmount,
  makeTxnRef,
  parseTxnRef,
  parseVnpCallback,
  signVnpParams,
  toVnpAmount,
  verifyVnpSignature,
  withSignature,
} from "../src/modules/payments/vnpay.crypto";

const SECRET = "test-secret-0123456789abcdef-test";
const cfg = {
  tmnCode: "FITHUBSIM",
  hashSecret: SECRET,
  paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: "http://localhost:5173/return?x=1",
};

test("SAD 4.4: vnp_Amount = số tiền VNĐ × 100", () => {
  assert.equal(toVnpAmount(500000), "50000000");
  assert.equal(toVnpAmount(1350000), "135000000");
  assert.throws(() => toVnpAmount(0));
  assert.throws(() => toVnpAmount(1000.5));
  assert.throws(() => toVnpAmount(-1));
});

test("fromVnpAmount chỉ nhận bội số nguyên của 100", () => {
  assert.equal(fromVnpAmount("50000000"), 500000);
  assert.equal(fromVnpAmount("50000050"), null);
  assert.equal(fromVnpAmount("abc"), null);
  assert.equal(fromVnpAmount("0"), null);
  assert.equal(fromVnpAmount("-100"), null);
});

test("chuỗi ký: khóa sắp xếp, khoảng trắng thành '+', ký tự đặc biệt được mã hóa", () => {
  assert.equal(
    canonicalQuery({ vnp_B: "a b", vnp_A: "x&y=z", vnp_C: "é" }),
    "vnp_A=x%26y%3Dz&vnp_B=a+b&vnp_C=%C3%A9",
  );
});

test("ký HMAC-SHA512 ổn định và đúng độ dài (128 hex)", () => {
  const params = { vnp_Amount: "50000000", vnp_TxnRef: "GD000001A1" };
  const sig = signVnpParams(params, SECRET);
  assert.match(sig, /^[0-9a-f]{128}$/);
  assert.equal(sig, signVnpParams({ ...params }, SECRET));
  assert.notEqual(sig, signVnpParams(params, SECRET + "x"));
});

test("SR01: chữ ký đúng được chấp nhận, sai/thiếu/sửa dữ liệu bị từ chối", () => {
  const signed = withSignature(
    {
      vnp_TmnCode: "FITHUBSIM",
      vnp_Amount: "50000000",
      vnp_TxnRef: "GD000001A1",
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
    },
    SECRET,
  );
  assert.equal(verifyVnpSignature(signed, SECRET), true);
  assert.equal(verifyVnpSignature(signed, SECRET + "x"), false);
  // Sửa số tiền sau khi ký
  assert.equal(verifyVnpSignature({ ...signed, vnp_Amount: "100" }, SECRET), false);
  // Thêm tham số vnp_ mới sau khi ký
  assert.equal(verifyVnpSignature({ ...signed, vnp_Extra: "1" }, SECRET), false);
  // Thiếu hoặc sai định dạng chữ ký
  const { vnp_SecureHash: _drop, ...noHash } = signed;
  void _drop;
  assert.equal(verifyVnpSignature(noHash, SECRET), false);
  assert.equal(verifyVnpSignature({ ...noHash, vnp_SecureHash: "abc" }, SECRET), false);
  // Chữ hoa/thường của hex không làm sai kết quả; tham số ngoài vnp_ bị bỏ qua
  assert.equal(
    verifyVnpSignature({ ...signed, vnp_SecureHash: signed.vnp_SecureHash.toUpperCase(), other: "1" }, SECRET),
    true,
  );
  // vnp_SecureHashType không nằm trong chuỗi ký
  assert.equal(verifyVnpSignature({ ...signed, vnp_SecureHashType: "HmacSHA512" }, SECRET), true);
});

test("URL thanh toán: đủ tham số, vnp_Amount ×100, ký lại được từ chính URL", () => {
  const url = buildVnpPaymentUrl(cfg, {
    txnRef: "GD000012A1",
    amountVnd: 500000,
    orderInfo: "Thanh toan goi tap GD000012",
    ipAddr: "127.0.0.1",
    createdAt: new Date("2026-11-13T03:00:00Z"),
    expiresAt: new Date("2026-11-13T03:15:00Z"),
  });
  assert.ok(url.startsWith(`${cfg.paymentUrl}?`));
  const q = Object.fromEntries(new URL(url).searchParams.entries());
  assert.equal(q.vnp_Amount, "50000000");
  assert.equal(q.vnp_TxnRef, "GD000012A1");
  assert.equal(q.vnp_CurrCode, "VND");
  assert.equal(q.vnp_CreateDate, "20261113100000"); // 03:00 UTC = 10:00 giờ VN
  assert.equal(q.vnp_ExpireDate, "20261113101500");
  assert.equal(q.vnp_ReturnUrl, cfg.returnUrl);
  assert.equal(verifyVnpSignature(q, SECRET), true);
  // Khóa tham số đã sắp xếp theo bảng chữ cái trong URL
  const keys = [...new URL(url).searchParams.keys()].filter((k) => k !== "vnp_SecureHash");
  assert.deepEqual(keys, [...keys].sort());
});

test("formatVnpDate dùng giờ Việt Nam (UTC+7), qua nửa đêm đổi ngày", () => {
  assert.equal(formatVnpDate(new Date("2026-11-13T17:30:05Z")), "20261114003005");
});

test("txnRef: tạo và phân tích, từ chối định dạng sai", () => {
  assert.equal(makeTxnRef("GD000012", 2), "GD000012A2");
  assert.deepEqual(parseTxnRef("GD000012A2"), { code: "GD000012", attempt: 2 });
  assert.equal(parseTxnRef("GD000012"), null);
  assert.equal(parseTxnRef("GD000012A0"), null);
  assert.equal(parseTxnRef("A1"), null);
});

test("parseVnpCallback: thành công cần cả ResponseCode và TransactionStatus = 00", () => {
  const base = {
    vnp_TmnCode: "FITHUBSIM",
    vnp_Amount: "50000000",
    vnp_TxnRef: "GD000001A1",
    vnp_TransactionNo: "14012345",
  };
  const ok = parseVnpCallback({ ...base, vnp_ResponseCode: "00", vnp_TransactionStatus: "00" }, "FITHUBSIM");
  assert.equal(ok?.success, true);
  assert.equal(ok?.amountVnd, 500000);
  assert.equal(ok?.transactionNo, "14012345");
  assert.equal(parseVnpCallback({ ...base, vnp_ResponseCode: "00", vnp_TransactionStatus: "02" }, "FITHUBSIM")?.success, false);
  assert.equal(parseVnpCallback({ ...base, vnp_ResponseCode: "24", vnp_TransactionStatus: "02" }, "FITHUBSIM")?.success, false);
  assert.equal(parseVnpCallback({ ...base, vnp_ResponseCode: "00" }, "FITHUBSIM")?.success, false);
  // Sai TMN code, thiếu mã tham chiếu, số tiền không hợp lệ → từ chối
  assert.equal(parseVnpCallback({ ...base, vnp_TmnCode: "OTHER", vnp_ResponseCode: "00", vnp_TransactionStatus: "00" }, "FITHUBSIM"), null);
  assert.equal(parseVnpCallback({ ...base, vnp_TxnRef: "", vnp_ResponseCode: "00" }, "FITHUBSIM"), null);
  assert.equal(parseVnpCallback({ ...base, vnp_Amount: "123", vnp_ResponseCode: "00" }, "FITHUBSIM"), null);
});
