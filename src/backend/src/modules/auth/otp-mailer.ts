import { Injectable, ServiceUnavailableException } from "@nestjs/common";
@Injectable()
export class OtpMailer {
  assertConfigured() {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)
      throw new ServiceUnavailableException({
        code: "EMAIL_NOT_CONFIGURED",
        message:
          "Dịch vụ gửi email chưa sẵn sàng. Vui lòng liên hệ quản trị viên.",
      });
  }
  async send(email: string, code: string, deliveryKey: string) {
    this.assertConfigured();
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": deliveryKey,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM,
          to: [email],
          subject: "Mã xác minh tài khoản FitHub",
          text: `Mã xác minh FitHub của bạn là ${code}. Mã có hiệu lực 5 phút. Không chia sẻ mã này. Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Provider rejected delivery");
      const body = (await response.json()) as { id?: string };
      if (!body.id) throw new Error("No delivery receipt");
    } catch {
      throw new ServiceUnavailableException({
        code: "EMAIL_DELIVERY_FAILED",
        message:
          "Chưa thể gửi mã đến email này. Vui lòng kiểm tra địa chỉ và thử lại sau, hoặc liên hệ lễ tân.",
      });
    }
  }
}
