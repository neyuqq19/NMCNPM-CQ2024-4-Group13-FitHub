import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  DEV_VNPAY_SECRET,
  buildVnpPaymentUrl,
  parseVnpCallback,
  signVnpParams,
  toVnpAmount,
  verifyVnpSignature,
  type VnpCallback,
  type VnpConfig,
  type VnpPaymentInput,
} from "./vnpay.crypto";

export type VNPayMode = "SANDBOX" | "SIMULATED";

/**
 * VNPayAdapter (SAD 4.4). Khóa tích hợp chỉ nằm ở backend (SR01).
 *  - VNPAY_MODE=SANDBOX: dùng TMN code/secret thật của sandbox.
 *  - VNPAY_MODE=SIMULATED (mặc định): dùng khóa phát triển để thử luồng IPN khi
 *    chưa có tài khoản sandbox; production bắt buộc khai báo khóa riêng.
 */
@Injectable()
export class VNPayAdapter {
  get mode(): VNPayMode {
    return process.env.VNPAY_MODE === "SANDBOX" ? "SANDBOX" : "SIMULATED";
  }
  get expireMinutes(): number {
    const n = Number(process.env.VNPAY_EXPIRE_MINUTES);
    return Number.isInteger(n) && n >= 5 && n <= 60 ? n : 15;
  }
  /** Chỉ cho phép giả lập IPN ngoài production và ở chế độ SIMULATED. */
  get simulationAllowed(): boolean {
    return this.mode === "SIMULATED" && process.env.NODE_ENV !== "production";
  }
  get config(): VnpConfig {
    const prod = process.env.NODE_ENV === "production";
    const tmnCode = process.env.VNPAY_TMN_CODE || (prod ? "" : "FITHUBSIM");
    const hashSecret =
      process.env.VNPAY_HASH_SECRET || (prod ? "" : DEV_VNPAY_SECRET);
    if (!tmnCode || hashSecret.length < 16)
      throw new ServiceUnavailableException({
        code: "VNPAY_NOT_CONFIGURED",
        message: "Cổng thanh toán VNPay chưa được cấu hình.",
      });
    return {
      tmnCode,
      hashSecret,
      paymentUrl:
        process.env.VNPAY_PAYMENT_URL ||
        "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
      returnUrl: process.env.VNPAY_RETURN_URL || "http://localhost:5173/",
    };
  }
  buildRedirectUrl(input: VnpPaymentInput): string {
    return buildVnpPaymentUrl(this.config, input);
  }
  /** SR01: xác thực vnp_SecureHash (HMAC-SHA512) của callback/IPN. */
  verifySignature(query: Record<string, string>): boolean {
    return verifyVnpSignature(query, this.config.hashSecret);
  }
  parseCallback(query: Record<string, string>): VnpCallback | null {
    return parseVnpCallback(query, this.config.tmnCode);
  }
  /** Dựng IPN đã ký (chỉ dùng để giả lập ở chế độ SIMULATED). */
  buildSimulatedCallback(input: {
    txnRef: string;
    amountVnd: number;
    success: boolean;
    transactionNo: string;
    now: Date;
  }): Record<string, string> {
    const { tmnCode, hashSecret } = this.config;
    const params: Record<string, string> = {
      vnp_TmnCode: tmnCode,
      vnp_Amount: toVnpAmount(input.amountVnd),
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: `Thanh toan ${input.txnRef}`,
      vnp_BankCode: "NCB",
      vnp_TransactionNo: input.transactionNo,
      vnp_ResponseCode: input.success ? "00" : "24",
      vnp_TransactionStatus: input.success ? "00" : "02",
      vnp_PayDate: input.now
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14),
    };
    return { ...params, vnp_SecureHash: signVnpParams(params, hashSecret) };
  }
}
