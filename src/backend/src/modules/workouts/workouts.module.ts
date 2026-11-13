import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { WorkoutsController } from "./workouts.controller";
import { WorkoutsService } from "./workouts.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}
