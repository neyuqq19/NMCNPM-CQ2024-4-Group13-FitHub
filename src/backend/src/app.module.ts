import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { MembersModule } from './modules/members/members.module';
import { PackagesModule } from './modules/packages/packages.module';
import { CheckInsModule } from './modules/check-ins/check-ins.module';
import { SalesModule } from './modules/sales/sales.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { EquipmentsModule } from './modules/equipments/equipments.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MembersModule,
    PackagesModule,
    CheckInsModule,
    SalesModule,
    MembershipsModule,
    EquipmentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
