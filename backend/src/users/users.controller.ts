import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Post()
    async create(@Body() body: CreateUserDto, @CurrentUser() user: any) {
        return this.usersService.create(body, user);
    }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.usersService.findAll(user);
    }

    @Get(':id')
    async findById(@Param('id') id: string, @CurrentUser() user: any) {
        return this.usersService.findOne(id, user);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateUserDto,
        @CurrentUser() user: any,
    ) {
        return this.usersService.update(id, body, user);
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.usersService.remove(id, user);
    }
}