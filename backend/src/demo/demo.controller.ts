import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { DemoService } from './demo.service';
import { DemoSignupDto } from './dto/demo-signup.dto';

// Sem @UseGuards de propósito — é a única rota pública de cadastro do
// sistema (todo o resto exige alguém já logado criando a conta). Só serve
// pra criar contas de teste, presas à loja isDemo=true (ver demo.service.ts
// e users/CLAUDE.md — "não existe autocadastro" continua valendo pro resto
// do sistema).
@Controller('demo')
export class DemoController {
    constructor(private demoService: DemoService) { }

    @Post('signup')
    async signup(@Body() body: DemoSignupDto, @Req() req: Request) {
        const ip = req.ip || '';

        return this.demoService.signup(body, ip);
    }
}
