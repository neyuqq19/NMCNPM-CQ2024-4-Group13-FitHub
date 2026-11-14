import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { InvoiceAdapter } from "./invoice.adapter";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaymentsWebhookController } from "./payments.webhook.controller";
import { VNPayAdapter } from "./vnpay.adapter";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, VNPayAdapter, InvoiceAdapter],
  // SalesModule dùng InvoiceAdapter để phát hành hóa đơn sau khi thu tiền tại quầy.
  exports: [InvoiceAdapter, VNPayAdapter],
})
export class PaymentsModule {}
