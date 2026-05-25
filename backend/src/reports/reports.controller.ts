import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
    constructor(private reportsService: ReportsService) { }

    @Get('suppliers')
    async suppliers() {
        return this.reportsService.suppliers();
    }

    @Get('stores')
    async stores(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.reportsService.stores({
            startDate,
            endDate,
        });
    }

    @Get('cards')
    async cards(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.reportsService.cards({
            startDate,
            endDate,
        });
    }
}