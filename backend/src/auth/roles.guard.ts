import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Usuário não autenticado.');
        }

        // Conta de teste (autocadastro em /demo) passa por qualquer
        // @Roles — o papel dela continua sendo Gerente, então o filtro
        // por loja de cada módulo (ensureStoreAccess/getAllowedStoreIds,
        // que só libera tudo pra Administrativo/Proprietário) continua
        // isolando os dados dela na própria loja de teste. Isso só abre
        // quais telas ela alcança, não muda o que ela enxerga nelas.
        if (user.isDemo) {
            return true;
        }

        if (!requiredRoles.includes(user.role)) {
            throw new ForbiddenException('Você não tem permissão para acessar este recurso.');
        }

        return true;
    }
}