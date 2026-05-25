import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';
import { PurchasesModule } from './purchases/purchases.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ReportsModule } from './reports/reports.module';
import { CardsModule } from './cards/cards.module';
import { ApprovalRulesModule } from './approval-rules/approval-rules.module';
import { AlertsModule } from './alerts/alerts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StoresModule } from './stores/stores.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PurchasesModule,
    DashboardModule,
    SuppliersModule,
    ReportsModule,
    CardsModule,
    ApprovalRulesModule,
    AlertsModule,
    NotificationsModule,
    StoresModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
