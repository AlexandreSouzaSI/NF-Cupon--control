import { Body, Controller, Get, Param, Post } from '@nestjs/common';

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
    constructor(private accountService: AccountService) { }

    @Get('activate/:token')
    getActivationInfo(@Param('token') token: string) {
        return this.accountService.getActivationInfo(token);
    }

    @Post('activate/:token')
    activateAccount(
        @Param('token') token: string,
        @Body() body: ActivateAccountDto,
    ) {
        return this.accountService.activateAccount(token, body.password);
    }

    @Post('forgot-password')
    getResetOptions(@Body() body: RequestPasswordResetDto) {
        return this.accountService.getResetOptions(body.identifier);
    }

    @Post('forgot-password/send')
    sendResetLink(@Body() body: SendPasswordResetDto) {
        return this.accountService.sendResetLink(body.identifier, body.channel);
    }

    @Get('reset-password/:token')
    getResetInfo(@Param('token') token: string) {
        return this.accountService.getResetInfo(token);
    }

    @Post('reset-password/:token')
    resetPassword(
        @Param('token') token: string,
        @Body() body: ResetPasswordDto,
    ) {
        return this.accountService.resetPassword(token, body.password);
    }
}
