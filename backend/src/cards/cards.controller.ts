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

import { CardsService } from './cards.service';

import { CreateCardDto } from './dto/create-card.dto';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
    constructor(private cardsService: CardsService) { }

    @Post()
    async create(@Body() body: CreateCardDto) {
        return this.cardsService.create(body);
    }

    @Get()
    async findAll() {
        return this.cardsService.findAll();
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.cardsService.remove(id);
    }
}