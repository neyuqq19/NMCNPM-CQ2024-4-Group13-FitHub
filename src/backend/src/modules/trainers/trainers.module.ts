import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TrainersController } from "./trainers.controller";
import { TrainersService } from "./trainers.service";
import { WorkingSlotsService } from "./working-slots.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TrainersController],
  providers: [TrainersService, WorkingSlotsService],
})
export class TrainersModule {}
