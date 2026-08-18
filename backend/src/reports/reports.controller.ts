import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
    constructor(private reportsService: ReportsService) { }

    @Get('suppliers')
    async suppliers(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.reportsService.suppliers(user, storeId);
    }

    @Get('stores')
    async stores(
        @CurrentUser() user: any,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.reportsService.stores(user, {
            startDate,
            endDate,
        });
    }

    @Get('cards')
    async cards(
        @CurrentUser() user: any,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.reportsService.cards(user, {
            startDate,
            endDate,
        });
    }
}