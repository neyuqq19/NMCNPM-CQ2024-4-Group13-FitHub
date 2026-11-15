import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  Inject,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ValidationPipe,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { PaymentsModule } from "../payments/payments.module";
import { SalesService } from "./sales.service";
class RegisterDto {
  @IsUUID() requestId!: string;
  @IsUUID() packageId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn!: string;
  @IsInt() @Min(1) expectedPrice!: number;
}
class ConfirmDto {
  @IsUUID() idempotencyKey!: string;
  @IsInt() @Min(1) amount!: number;
  // UC15: Admin chọn hình thức thu tại quầy; mặc định CASH.
  @IsOptional() @IsIn(["CASH", "BANK_TRANSFER"]) method?: "CASH" | "BANK_TRANSFER";
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
@Controller("api")
class SalesController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(SalesService) private sales: SalesService,
  ) {}
  @Get("members/:id/purchase-options") options(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") h?: string,
  ) {
    return this.auth.validateSession(h).then((u) => this.sales.options(u, id));
  }
  @Post("members/:id/memberships") register(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        expectedType: RegisterDto,
        whitelist: true,
        transform: true,
      }),
    )
    b: RegisterDto,
    @Headers("authorization") h?: string,
  ) {
    return this.auth
      .validateSession(h)
      .then((u) => this.sales.register(u, id, b));
  }
  @Get("payments") list(
    @Query() q: Record<string, string>,
    @Headers("authorization") h?: string,
  ) {
    return this.auth.validateSession(h).then((u) => this.sales.list(u, q));
  }
  @Get("payments/:id") get(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") h?: string,
  ) {
    return this.auth.validateSession(h).then((u) => this.sales.get(u, id));
  }
  @Post("payments/:id/confirm") @HttpCode(200) confirm(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        expectedType: ConfirmDto,
        whitelist: true,
        transform: true,
      }),
    )
    b: ConfirmDto,
    @Headers("authorization") h?: string,
  ) {
    return this.auth
      .validateSession(h)
      .then((u) => this.sales.decide(u, id, b));
  }
  @Post("payments/:id/cancel") @HttpCode(200) cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") h?: string,
  ) {
    return this.auth
      .validateSession(h)
      .then((u) => this.sales.decide(u, id, null));
  }
  @Get("dashboard")
  @Header("Cache-Control", "no-store")
  dashboard(
    @Query() q: Record<string, string>,
    @Headers("authorization") h?: string,
  ) {
    return this.auth.validateSession(h).then((u) => this.sales.dashboard(u, q));
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, PaymentsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
