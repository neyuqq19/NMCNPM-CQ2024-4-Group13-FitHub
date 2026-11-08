import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  ValidationPipe,
} from "@nestjs/common";
import { IsString, IsUUID, Length, Matches } from "class-validator";
import { DatabaseModule } from "../../database/database.module";
import { CheckInsService } from "./check-ins.service";
class ScannerDto {
  @IsUUID() deviceId!: string;
  @IsString() @Length(1, 80) @Matches(/\S/) label!: string;
}
class ScanDto {
  @IsUUID() scannerId!: string;
  @IsUUID() requestId!: string;
  @IsString() @Length(1, 512) payload!: string;
}
@Controller("api/check-ins")
class CheckInsController {
  constructor(@Inject(CheckInsService) private service: CheckInsService) {}
  @Post("qr")
  @Header("Cache-Control", "no-store")
  @HttpCode(200)
  issue(@Headers("authorization") header?: string) {
    return this.service.issue(header);
  }
  @Get("qr/:id/status")
  @Header("Cache-Control", "no-store")
  status(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") header?: string,
  ) {
    return this.service.status(header, id);
  }
  @Post("scanners")
  @HttpCode(200)
  register(
    @Body(
      new ValidationPipe({
        expectedType: ScannerDto,
        whitelist: true,
        transform: true,
      }),
    )
    body: ScannerDto,
    @Headers("authorization") header?: string,
  ) {
    return this.service.register(header, body);
  }
  @Post("scan")
  @HttpCode(200)
  scan(
    @Body(
      new ValidationPipe({
        expectedType: ScanDto,
        whitelist: true,
        transform: true,
      }),
    )
    body: ScanDto,
    @Headers("authorization") header?: string,
  ) {
    return this.service.scan(header, body);
  }
  @Get("transactions/:id")
  @Header("Cache-Control", "no-store")
  transaction(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") header?: string,
  ) {
    return this.service.transaction(header, id);
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [CheckInsController],
  providers: [CheckInsService],
  exports: [CheckInsService],
})
export class CheckInsModule {}
