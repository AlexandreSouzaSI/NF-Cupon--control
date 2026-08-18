import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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
import { BillsModule } from './bills/bills.module';
import { ServicesModule } from './services/services.module';
import { EmployeesModule } from './employees/employees.module';
import { TaxModule } from './tax/tax.module';
import { FreelancersModule } from './freelancers/freelancers.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
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
    StoresModule,
    BillsModule,
    ServicesModule,
    EmployeesModule,
    TaxModule,
    FreelancersModule,
    TasksModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
