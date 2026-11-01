import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { LimiteTentativas } from '../common/limite-tentativas';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
    // Tentativa de senha: 8 por usuário a cada 15 min, 40 por IP a cada 15 min.
    private readonly porUsuario = new LimiteTentativas(8, 15 * 60_000, 'Muitas tentativas de login para este usuário.');
    private readonly porIp = new LimiteTentativas(40, 15 * 60_000, 'Muitas tentativas de login.');

    constructor(
        private authService: AuthService,
        private jwtService: JwtService,
    ) { }

    @Post('login')
    async login(@Body() body: LoginDto, @Ip() ip: string) {
        const chave = String(body?.identifier ?? '').trim().toLowerCase();
        this.porIp.registrar(ip || 'sem-ip');
        this.porUsuario.registrar(chave);
        const r = await this.authService.login(
            body.identifier,
            body.password,
        );
        this.porUsuario.zerar(chave);
        return r;
    }

    // Token curto (12 h) que só serve pra abrir arquivos (/uploads/...?t=).
    @Get('arquivo-token')
    @UseGuards(JwtAuthGuard)
    arquivoToken(@CurrentUser() user: any) {
        return { token: this.jwtService.sign({ sub: user.id, scope: 'arquivo' }, { expiresIn: '12h' }), validadeHoras: 12 };
    }
}