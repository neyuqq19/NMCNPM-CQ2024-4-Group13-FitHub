import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EquipmentsController } from "./equipments.controller";
import { EquipmentsService } from "./equipments.service";

@Module({
  imports: [AuthModule],
  controllers: [EquipmentsController],
  providers: [EquipmentsService],
  exports: [EquipmentsService],
})
export class EquipmentsModule {}

