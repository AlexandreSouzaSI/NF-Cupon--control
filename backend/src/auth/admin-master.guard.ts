import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

// Restringe uma rota a quem tem isAdminMaster=true — hoje só o dono do
// SaaS (você). Diferente de @Roles/RolesGuard, que filtra por perfil
// dentro de uma loja/cliente; isso aqui é uma camada acima, pra telas que
// nenhum cliente (nem Proprietário) deveria alcançar, como o painel de
// módulos contratados por loja.
@Injectable()
export class AdminMasterGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user?.isAdminMaster) {
            throw new ForbiddenException(
                'Acesso restrito ao administrador do sistema.',
            );
        }

        return true;
    }
}
