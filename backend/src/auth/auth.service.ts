import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    async login(identifier: string, password: string) {
        const user = await this.usersService.findByIdentifier(identifier);

        if (!user || !user.active) {
            throw new UnauthorizedException('Usuário ou senha inválidos');
        }

        // Conta convidada por WhatsApp que ainda não criou a senha — a
        // senha gravada é só um placeholder inutilizável, então nem
        // adianta comparar (e a mensagem de erro seria enganosa).
        if (!user.accountActivated) {
            throw new UnauthorizedException(
                'Essa conta ainda não foi ativada. Confira o link de boas-vindas enviado por WhatsApp (ou peça pra reenviar).',
            );
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password,
        );

        if (!passwordMatch) {
            throw new UnauthorizedException('Usuário ou senha inválidos');
        }

        // Conta de teste vencida (isDemo + demoExpiresAt no passado) AINDA
        // entra: o login devolve o token normal e o jwt.strategy.ts limita
        // o acesso às rotas de planos/cobrança, pra pessoa conhecer os
        // planos e pagar. Quem passou da janela de recuperação já está
        // active=false (cron em demo.service.ts) e cai no erro genérico
        // acima.

        const stores = user.userStores
            .map((item) => item.store)
            .filter((store) => store.active)
            .map((store) => ({
                id: store.id,
                name: store.name,
            }));

        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };

        return {
            access_token: await this.jwtService.signAsync(payload),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isAdminMaster: user.isAdminMaster,
                empresaId: user.empresaId,
                canApprovePurchases: user.canApprovePurchases,
                moduleAccess: user.moduleAccess,
                canViewPayrollBills: user.canViewPayrollBills,
                canManagePermissions: user.canManagePermissions,
                isDemo: user.isDemo,
                demoExpiresAt: user.demoExpiresAt,
                stores,
            },
        };
    }
}