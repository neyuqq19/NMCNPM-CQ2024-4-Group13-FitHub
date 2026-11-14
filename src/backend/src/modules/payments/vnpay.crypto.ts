/**
 * VNPay — các hàm thuần (không phụ thuộc NestJS/Prisma) để tạo URL thanh toán,
 * ký HMAC-SHA512 và xác thực chữ ký. SAD 4.4: vnp_Amount = số tiền VNĐ × 100.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const VNP_VERSION = "2.1.0";
export const VNP_SUCCESS_CODE = "00";
/** Khóa phát triển cho chế độ SIMULATED; production bắt buộc khai báo khóa riêng. */
export const DEV_VNPAY_SECRET = "fithub-vnpay-simulated-secret-dev-only";

/** Mã hóa như mẫu chính thức của VNPay: encodeURIComponent, khoảng trắng thành "+". */
export function vnpEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/** Chuỗi truy vấn chuẩn: khóa sắp xếp theo bảng chữ cái, giá trị đã mã hóa. */
export function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${vnpEncode(key)}=${vnpEncode(params[key])}`)
    .join("&");
}

export function signVnpParams(
  params: Record<string, string>,
  secret: string,
): string {
  return createHmac("sha512", secret)
    .update(Buffer.from(canonicalQuery(params), "utf-8"))
    .digest("hex");
}

/** Thêm vnp_SecureHash vào bộ tham số (không sửa đối tượng gốc). */
export function withSignature(
  params: Record<string, string>,
  secret: string,
): Record<string, string> {
  return { ...params, vnp_SecureHash: signVnpParams(params, secret) };
}

function signedFields(query: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(query))
    if (
      key.startsWith("vnp_") &&
      key !== "vnp_SecureHash" &&
      key !== "vnp_SecureHashType"
    )
      fields[key] = value;
  return fields;
}

/** SR01: kiểm tra vnp_SecureHash, so sánh thời gian không đổi. */
export function verifyVnpSignature(
  query: Record<string, string>,
  secret: string,
): boolean {
  const given = query.vnp_SecureHash;
  if (typeof given !== "string" || !/^[0-9a-fA-F]{128}$/.test(given))
    return false;
  const expected = Buffer.from(
    signVnpParams(signedFields(query), secret),
    "hex",
  );
  const actual = Buffer.from(given, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** vnp_Amount gửi sang VNPay = amountVND * 100 (ví dụ 500.000đ → "50000000"). */
export function toVnpAmount(amountVnd: number): string {
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0)
    throw new RangeError("Số tiền VNĐ phải là số nguyên dương.");
  const scaled = amountVnd * 100;
  if (!Number.isSafeInteger(scaled))
    throw new RangeError("Số tiền VNĐ vượt giới hạn.");
  return String(scaled);
}

/** Đổi ngược vnp_Amount về VNĐ; null nếu không phải bội số nguyên của 100. */
export function fromVnpAmount(raw: string): number | null {
  if (!/^\d{3,15}$/.test(raw)) return null;
  const n = Number(raw);
  return n % 100 === 0 && n > 0 ? n / 100 : null;
}

/** yyyyMMddHHmmss theo giờ Việt Nam (UTC+7, không có giờ mùa hè). */
export function formatVnpDate(date: Date): string {
  return new Date(date.getTime() + 7 * 3600 * 1000)
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
}

/** Tham chiếu giao dịch: <mã GD>A<lần thử>, ví dụ GD000012A2. */
export function makeTxnRef(paymentCode: string, attempt: number): string {
  return `${paymentCode}A${attempt}`;
}
export function parseTxnRef(
  ref: string,
): { code: string; attempt: number } | null {
  const m = /^(.+)A(\d{1,6})$/.exec(ref);
  return m && Number(m[2]) >= 1
    ? { code: m[1], attempt: Number(m[2]) }
    : null;
}

export interface VnpConfig {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
}

export interface VnpPaymentInput {
  txnRef: string;
  amountVnd: number;
  orderInfo: string;
  ipAddr: string;
  createdAt: Date;
  expiresAt: Date;
}

/** buildRedirectUrl: URL chuyển hướng sang cổng VNPay, đã ký HMAC-SHA512. */
export function buildVnpPaymentUrl(
  config: VnpConfig,
  input: VnpPaymentInput,
): string {
  const params: Record<string, string> = {
    vnp_Version: VNP_VERSION,
    vnp_Command: "pay",
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: toVnpAmount(input.amountVnd),
    vnp_CurrCode: "VND",
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: input.orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: input.ipAddr,
    vnp_CreateDate: formatVnpDate(input.createdAt),
    vnp_ExpireDate: formatVnpDate(input.expiresAt),
  };
  const signed = withSignature(params, config.hashSecret);
  const { vnp_SecureHash, ...rest } = signed;
  return `${config.paymentUrl}?${canonicalQuery(rest)}&vnp_SecureHash=${vnp_SecureHash}`;
}

export interface VnpCallback {
  txnRef: string;
  amountVnd: number;
  responseCode: string;
  transactionStatus: string;
  transactionNo: string | null;
  /** Thành công khi vnp_ResponseCode và vnp_TransactionStatus đều là "00". */
  success: boolean;
}

/** Đọc các trường của IPN sau khi chữ ký đã được xác thực. */
export function parseVnpCallback(
  query: Record<string, string>,
  expectedTmnCode?: string,
): VnpCallback | null {
  const txnRef = query.vnp_TxnRef;
  const amountVnd = fromVnpAmount(query.vnp_Amount ?? "");
  if (!txnRef || txnRef.length > 100 || amountVnd === null) return null;
  if (expectedTmnCode && query.vnp_TmnCode !== expectedTmnCode) return null;
  const responseCode = query.vnp_ResponseCode ?? "";
  const transactionStatus = query.vnp_TransactionStatus ?? "";
  return {
    txnRef,
    amountVnd,
    responseCode,
    transactionStatus,
    transactionNo: query.vnp_TransactionNo?.slice(0, 40) || null,
    success:
      responseCode === VNP_SUCCESS_CODE &&
      transactionStatus === VNP_SUCCESS_CODE,
  };
}
