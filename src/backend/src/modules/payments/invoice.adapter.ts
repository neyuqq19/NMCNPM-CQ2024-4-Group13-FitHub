import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, type Invoice } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { gymClock } from "../check-ins/eligibility";

/** INV-YYYYMMDD-NNNN (NNNN là số thứ tự trong ngày, mở rộng khi quá 9999). */
export function formatInvoiceCode(day: string, seq: number | bigint): string {
  return `INV-${day.replace(/-/g, "")}-${String(seq).padStart(4, "0")}`;
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * InvoiceAdapter — chế độ SIMULATED (BR03): không gọi nhà cung cấp thật, chỉ sinh
 * mã hóa đơn và lưu trạng thái. Không bao giờ ném lỗi ra ngoài: lỗi phát hành
 * (E2) chỉ đánh dấu hóa đơn FAILED, không ảnh hưởng khoản thu và gói tập.
 * Cột Invoice.code bắt buộc nên mã được dành sẵn ngay lần thử đầu; hóa đơn
 * FAILED giữ nguyên mã đó và chuyển ISSUED khi phát hành lại.
 * Đặt INVOICE_SIMULATE_FAILURE=true (ngoài production) để thử nhánh lỗi.
 */
@Injectable()
export class InvoiceAdapter {
  private readonly log = new Logger(InvoiceAdapter.name);
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  private simulateOutage() {
    if (
      process.env.INVOICE_SIMULATE_FAILURE === "true" &&
      process.env.NODE_ENV !== "production"
    )
      throw new Error("Dịch vụ hóa đơn mô phỏng tạm thời không phản hồi.");
  }

  /**
   * Tạo dòng hóa đơn mới với mã kế tiếp trong ngày. Số thứ tự lấy từ số hóa đơn
   * đã có và được UNIQUE(code) bảo vệ: trùng mã khi đồng thời thì thử số kế tiếp.
   */
  private async createRow(
    paymentId: string,
    status: "ISSUED" | "FAILED",
    errorMessage: string | null,
  ): Promise<void> {
    const day = gymClock(new Date()).day;
    const prefix = `INV-${day.replace(/-/g, "")}-`;
    const base = await this.db.invoice.count({
      where: { code: { startsWith: prefix } },
    });
    for (let i = 0; i < 10; i++) {
      try {
        await this.db.invoice.create({
          data: {
            paymentId,
            status,
            errorMessage,
            code: formatInvoiceCode(day, base + 1 + i),
          },
        });
        return;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Cùng paymentId đã có dòng (tiến trình khác vừa tạo) thì dừng; còn lại là trùng mã.
        if (await this.db.invoice.findUnique({ where: { paymentId } })) return;
      }
    }
    throw new Error("Không cấp được mã hóa đơn duy nhất.");
  }

  /** Phát hành (hoặc phát hành lại) hóa đơn của khoản thu đã xác nhận; idempotent. */
  async issueForPayment(paymentId: string): Promise<Invoice | null> {
    try {
      const payment = await this.db.payment.findUnique({
        where: { id: paymentId },
        select: { status: true },
      });
      if (payment?.status !== "CONFIRMED") return null;
      const existing = await this.db.invoice.findUnique({
        where: { paymentId },
      });
      if (existing?.status === "ISSUED") return existing;
      try {
        this.simulateOutage();
        if (existing)
          // Chỉ chuyển FAILED → ISSUED; không bao giờ đổi hóa đơn đã phát hành.
          await this.db.invoice.updateMany({
            where: { id: existing.id, status: "FAILED" },
            data: { status: "ISSUED", issuedAt: new Date(), errorMessage: null },
          });
        else await this.createRow(paymentId, "ISSUED", null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Lỗi không xác định";
        this.log.warn(`Phát hành hóa đơn lỗi (${paymentId}): ${message}`);
        const errorMessage = message.slice(0, 300);
        if (existing)
          await this.db.invoice.updateMany({
            where: { id: existing.id, status: "FAILED" },
            data: { errorMessage },
          });
        else
          await this.createRow(paymentId, "FAILED", errorMessage).catch(
            () => undefined,
          );
      }
      return this.db.invoice.findUnique({ where: { paymentId } });
    } catch (error) {
      this.log.error(
        `InvoiceAdapter không đọc/ghi được dữ liệu (${paymentId}): ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }
}
