import { Body, Controller, Get, Ip, Param, Post } from '@nestjs/common';

import { LimiteTentativas } from '../common/limite-tentativas';

import { AccountService } from './account.service';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { SendPasswordResetDto } from './dto/send-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

// Controller público de propósito — de jeito nenhum leva JwtAuthGuard ou
// RolesGuard (ninguém está logado ainda nesses fluxos). Mesmo isolamento
// do QuotationsPublicController (ver quotations/quotations-public.controller.ts):
// classe própria, sem herdar guard nenhum por engano.
@Controller('account')
export class AccountController {
    // Sem limite, dava pra testar e-mails/telefones em massa (descobrir quem
    // tem conta) e disparar mensagens de troca de senha sem parar.
    private readonly consultas = new LimiteTentativas(15, 15 * 60_000, 'Muitas tentativas.');
    private readonly envios = new LimiteTentativas(3, 15 * 60_000, 'Já enviamos o link algumas vezes.');
    private readonly tokens = new LimiteTentativas(30, 15 * 60_000, 'Muitas tentativas.');

    constructor(private accountService: AccountService) { }

    @Get('activate/:token')
    getActivationInfo(@Param('token') token: string, @Ip() ip: string) {
        this.tokens.registrar(ip || 'sem-ip');
        return this.accountService.getActivationInfo(token);
    }

    @Post('activate/:token')
    activateAccount(
        @Param('token') token: string,
        @Body() body: ActivateAccountDto,
        @Ip() ip: string,
    ) {
        this.tokens.registrar(ip || 'sem-ip');
        return this.accountService.activateAccount(token, body.password);
    }

    @Post('forgot-password')
    getResetOptions(@Body() body: RequestPasswordResetDto, @Ip() ip: string) {
        this.consultas.registrar(ip || 'sem-ip');
        return this.accountService.getResetOptions(body.identifier);
    }

    @Post('forgot-password/send')
    sendResetLink(@Body() body: SendPasswordResetDto, @Ip() ip: string) {
        this.envios.registrar(`${ip}|${String(body?.identifier ?? '').trim().toLowerCase()}`);
        this.consultas.registrar(ip || 'sem-ip');
        return this.accountService.sendResetLink(body.identifier, body.channel);
    }

    @Get('reset-password/:token')
    getResetInfo(@Param('token') token: string, @Ip() ip: string) {
        this.tokens.registrar(ip || 'sem-ip');
        return this.accountService.getResetInfo(token);
    }

    @Post('reset-password/:token')
    resetPassword(
        @Param('token') token: string,
        @Body() body: ResetPasswordDto,
        @Ip() ip: string,
    ) {
        this.tokens.registrar(ip || 'sem-ip');
        return this.accountService.resetPassword(token, body.password);
    }
}
