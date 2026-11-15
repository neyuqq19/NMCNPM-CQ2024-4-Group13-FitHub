import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";

/**
 * Webhook/IPN VNPay — công khai (VNPay không có phiên FitHub). Danh tính được
 * bảo đảm hoàn toàn bằng chữ ký HMAC-SHA512, kiểm tra trước mọi thao tác dữ liệu.
 */
@Controller("api/webhooks")
export class PaymentsWebhookController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  private async handle(
    input: Record<string, unknown>,
    res: { status(code: number): unknown },
  ) {
    const { httpStatus, ...body } = await this.payments.handleVNPayCallback(input);
    res.status(httpStatus);
    return body;
  }

  @Get("vnpay")
  async ipnGet(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: { status(code: number): unknown },
  ) {
    return this.handle(query, res);
  }

  @Post("vnpay")
  @HttpCode(200)
  async ipnPost(
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: { status(code: number): unknown },
  ) {
    // Tham số trên URL được ưu tiên; thân yêu cầu dùng khi cổng gửi dạng form/JSON.
    return this.handle(
      Object.keys(query ?? {}).some((k) => k.startsWith("vnp_"))
        ? query
        : (body ?? {}),
      res,
    );
  }
}
