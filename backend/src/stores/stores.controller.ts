import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateStoreDto } from './dto/create-store.dto';
import { StoresService } from './stores.service';

@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoresController {
    constructor(private storesService: StoresService) { }

    @Post()
    async create(@Body() body: CreateStoreDto) {
        return this.storesService.create(body);
    }

    @Get()
    async findAll() {
        return this.storesService.findAll();
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.storesService.remove(id);
    }
}