import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StoreModule } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { MODULE_LABELS } from '../common/store-module-labels';
import { REQUIRES_MODULE_KEY } from './requires-module.decorator';

@Injectable()
export class ModuleAccessGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredModuleMeta = this.reflector.getAllAndOverride<
            StoreModule | StoreModule[]
        >(REQUIRES_MODULE_KEY, [context.getHandler(), context.getClass()]);

        if (!requiredModuleMeta) return true;

        // Normaliza pra lista — quando vem mais de um módulo, libera se a
        // loja tiver QUALQUER um deles (ver comentário em
        // requires-module.decorator.ts).
        const requiredModules = Array.isArray(requiredModuleMeta)
            ? requiredModuleMeta
            : [requiredModuleMeta];

        const request = context.switchToHttp().getRequest();

        // A loja pode vir no corpo (criação) ou na query (listagem/filtro).
        // Rotas que só recebem o id do registro (não da loja) não dá pra
        // checar aqui — nesses casos a visibilidade já é garantida pelo
        // próprio menu, que some a tela inteira quando o módulo tá
        // desligado; não vale bloquear ação em cima de dado que já existe.
        const storeId: string | undefined =
            request.body?.storeId ||
            request.query?.storeId ||
            request.params?.storeId;

        if (!storeId) return true;

        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
            select: { enabledModules: true },
        });

        // Loja não encontrada não é problema desse guard — deixa passar e
        // o service correspondente devolve o NotFoundException certo.
        if (!store) return true;

        const hasAnyModule = requiredModules.some((module) =>
            store.enabledModules.includes(module),
        );

        if (!hasAnyModule) {
            const labels = requiredModules
                .map((module) => MODULE_LABELS[module])
                .join(' ou ');

            throw new ForbiddenException(
                `O módulo "${labels}" não está habilitado para esta loja.`,
            );
        }

        return true;
    }
}
