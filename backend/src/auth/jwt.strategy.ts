import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private usersService: UsersService,
        private prisma: PrismaService,
    ) {
        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
            throw new Error('JWT_SECRET não foi definido no arquivo .env');
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: jwtSecret as string,
            passReqToCallback: true,
        });
    }

    async validate(
        req: Request,
        payload: { sub: string; email: string; role: string },
    ) {
        const user = await this.usersService.findById(payload.sub);

        // Corta o acesso no meio do uso, não só no login — sem isso quem
        // já tinha token aberto continuaria usando o sistema depois de 1h.
        if (
            user.isDemo &&
            user.demoExpiresAt &&
            user.demoExpiresAt < new Date()
        ) {
            throw new UnauthorizedException('Seu teste grátis de 1h expirou.');
        }

        // Admin Master (dono do sistema) continua conseguindo entrar em
        // qualquer loja de qualquer empresa-cliente — mas, pra não ver os
        // cadastros globais (Fornecedores, Categorias, Config de lote,
        // Colaboradores) de todas as empresas misturados, resolve aqui de
        // qual empresa é a loja que ele tem selecionada no seletor do topo
        // (frontend manda em todo request no header x-store-id — ver
        // lib/api.ts). Sem loja ativa selecionada (ex.: painel /admin, que
        // é justamente onde ele PRECISA ver tudo cruzando empresas), esse
        // campo fica undefined e os services caem no comportamento antigo
        // (sem filtro). Usuário comum nunca usa esse campo — ele já é
        // sempre filtrado pelo próprio empresaId.
        const anyUser = user as any;

        if (anyUser.isAdminMaster) {
            const storeId = req.headers['x-store-id'];

            if (typeof storeId === 'string' && storeId) {
                const store = await this.prisma.store.findUnique({
                    where: { id: storeId },
                    select: { empresaId: true },
                });

                anyUser.activeStoreEmpresaId = store?.empresaId;
            }
        }

        return user;
    }
}