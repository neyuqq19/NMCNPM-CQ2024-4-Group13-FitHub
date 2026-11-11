import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TrainersController } from "./trainers.controller";
import { TrainersService } from "./trainers.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TrainersController],
  providers: [TrainersService],
})
export class TrainersModule {}
