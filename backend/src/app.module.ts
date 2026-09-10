import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { LossesModule } from './losses/losses.module';
import { DevolucoesModule } from './devolucoes/devolucoes.module';
import { PushModule } from './push/push.module';
import { OutgoingSalesNfModule } from './outgoing-sales-nf/outgoing-sales-nf.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { BillCategoriesModule } from './bill-categories/bill-categories.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
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
    TasksModule,
    LossesModule,
    DevolucoesModule,
    PushModule,
    OutgoingSalesNfModule,
    WhatsappModule,
    BillCategoriesModule,
    DemoModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
