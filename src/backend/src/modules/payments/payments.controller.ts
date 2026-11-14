import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ValidationPipe,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { PaymentsService } from "./payments.service";

class ReconcileDto {
  @IsIn(["GRANT", "DISMISS"]) action!: "GRANT" | "DISMISS";
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class SimulateDto {
  @IsIn(["SUCCESS", "FAILED", "BAD_SIGNATURE"])
  result!: "SUCCESS" | "FAILED" | "BAD_SIGNATURE";
}
const pipe = (type: new () => object) =>
  new ValidationPipe({ expectedType: type, whitelist: true, transform: true });

/**
 * UC15 — các endpoint mới của thanh toán. GET /api/payments, GET /api/payments/:id,
 * POST /api/payments/:id/confirm và /cancel nằm ở SalesController (đã có từ UC05).
 */
@Controller("api")
export class PaymentsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  /** MEMBER (chủ đơn) hoặc ADMIN tạo URL thanh toán VNPay. */
  @Post("payments/:id/vnpay-url")
  @HttpCode(200)
  async vnpayUrl(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: { ip?: string },
    @Headers("authorization") h?: string,
  ) {
    const user = await this.auth.validateSession(h);
    return this.payments.createVNPayUrl(user, id, req.ip);
  }

  /** Chỉ SIMULATED + ngoài production: giả lập IPN đã ký đi qua đúng đường xử lý thật. */
  @Post("payments/:id/vnpay-simulate")
  @HttpCode(200)
  async vnpaySimulate(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(pipe(SimulateDto)) body: SimulateDto,
    @Headers("authorization") h?: string,
  ) {
    const user = await this.auth.validateSession(h);
    return this.payments.simulateVNPay(user, id, body.result);
  }

  @Get("payments/:id/invoice")
  async invoice(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") h?: string,
  ) {
    const user = await this.auth.validateSession(h);
    return this.payments.getInvoice(user, id);
  }

  @Post("payments/:id/retry-invoice")
  @HttpCode(200)
  async retryInvoice(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") h?: string,
  ) {
    const user = await this.auth.validateSession(h);
    return this.payments.retryInvoice(user, id);
  }

  @Post("payments/:id/reconcile")
  @HttpCode(200)
  async reconcile(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(pipe(ReconcileDto)) body: ReconcileDto,
    @Headers("authorization") h?: string,
  ) {
    const user = await this.auth.validateSession(h);
    return this.payments.reconcile(user, id, body);
  }

  /** Khoản thanh toán của chính hội viên (không dùng /payments/my vì trùng /payments/:id). */
  @Get("my/payments")
  async mine(@Headers("authorization") h?: string) {
    const user = await this.auth.validateSession(h);
    return this.payments.myPayments(user);
  }
}
