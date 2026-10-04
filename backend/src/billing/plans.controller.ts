import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';

import { AdminMasterGuard } from '../auth/admin-master.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { PlansService } from './plans.service';

// Vitrine PÚBLICA (sem guard de propósito): a landing e a página /planos
// precisam mostrar preços pra quem ainda nem tem conta. Só devolve planos
// ativos — nada sensível aqui.
@Controller('plans')
export class PlansController {
    constructor(private plansService: PlansService) { }

    @Get()
    listPublic() {
        return this.plansService.listPublic();
    }
}

// Gestão dos planos — só Admin Master.
@Controller('admin/plans')
@UseGuards(JwtAuthGuard, AdminMasterGuard)
export class AdminPlansController {
    constructor(private plansService: PlansService) { }

    @Get()
    listAll() {
        return this.plansService.listAll();
    }

    @Post()
    create(@Body() body: CreatePlanDto) {
        return this.plansService.create(body);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: UpdatePlanDto) {
        return this.plansService.update(id, body);
    }
}
