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

    async login(email: string, password: string) {
        const user = await this.usersService.findByEmail(email);

        if (!user || !user.active) {
            throw new UnauthorizedException('Usuário ou senha inválidos');
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password,
        );

        if (!passwordMatch) {
            throw new UnauthorizedException('Usuário ou senha inválidos');
        }

        // Conta de teste (autocadastro em /demo/signup) — depois de 1h a
        // partir do cadastro, nem relogando dá pra continuar usando.
        if (user.isDemo && user.demoExpiresAt && user.demoExpiresAt < new Date()) {
            throw new UnauthorizedException(
                'Seu teste grátis de 1h expirou. Cadastre um novo teste pra continuar explorando.',
            );
        }

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
                isDemo: user.isDemo,
                demoExpiresAt: user.demoExpiresAt,
                stores,
            },
        };
    }
}