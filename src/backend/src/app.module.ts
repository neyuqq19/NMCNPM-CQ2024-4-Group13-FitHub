import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { MembersModule } from './modules/members/members.module';
import { PackagesModule } from './modules/packages/packages.module';
import { CheckInsModule } from './modules/check-ins/check-ins.module';
import { SalesModule } from './modules/sales/sales.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [DatabaseModule, AuthModule, MembersModule, PackagesModule, CheckInsModule, SalesModule, NotificationsModule],
  controllers: [AppController],
})
export class AppModule {}
