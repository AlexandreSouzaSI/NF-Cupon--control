import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { StoresModule } from '../stores/stores.module';

@Module({
    imports: [UsersModule, StoresModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
