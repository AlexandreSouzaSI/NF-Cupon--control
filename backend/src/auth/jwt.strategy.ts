import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private usersService: UsersService) {
        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
            throw new Error('JWT_SECRET não foi definido no arquivo .env');
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: jwtSecret as string,
        });
    }

    async validate(payload: { sub: string; email: string; role: string }) {
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

        return user;
    }
}