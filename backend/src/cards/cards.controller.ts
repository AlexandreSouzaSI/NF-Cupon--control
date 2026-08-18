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
import { CurrentUser } from '../auth/current-user.decorator';

import { CardsService } from './cards.service';

import { CreateCardDto } from './dto/create-card.dto';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
    constructor(private cardsService: CardsService) { }

    @Post()
    async create(@Body() body: CreateCardDto, @CurrentUser() user: any) {
        return this.cardsService.create(body, user);
    }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.cardsService.findAll(user);
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.cardsService.remove(id, user);
    }
}