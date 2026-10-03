import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreModule, TipoPessoaStore, UserRole } from '@prisma/client';
import { encryptSecret } from './certificate-crypto.util';
import { runDiagnostics, testCertificateConnection, loadCertificate } from './sefaz-nfse-client';
import { testGoodsConnection } from './sefaz-nfe-client';
import { ALL_STORE_MODULES } from '../common/store-module-labels';

// Fica fora de /uploads de propósito: /uploads é servido publicamente pelo
// Express (app.useStaticAssets) e um certificado digital nunca pode ficar
// acessível por URL.
const certificatesPath = join(
    process.cwd(),
    'storage',
    'certificates',
);

if (!existsSync(certificatesPath)) {
    mkdirSync(certificatesPath, { recursive: true });
}

@Injectable()
export class StoresService {
    constructor(private prisma: PrismaService) { }

    // empresaId vem de quem está criando (Administrativo/Proprietário
    // sempre cria loja dentro da própria empresa) — só o Admin Master, pelo
    // módulo admin/ (fluxo separado, ver admin.service.ts), cria loja pra
    // uma empresa escolhida à parte. Agora que Store.empresaId é
    // obrigatório no schema, essa checagem existe pra dar um erro claro em
    // vez de deixar o Prisma estourar uma constraint NOT NULL genérica —
    // não deveria acontecer na prática (controller sempre manda
    // req.user.empresaId, e toda conta comum tem isso preenchido depois do
    // backfill).
    async create(dto: CreateStoreDto, empresaId?: string | null) {
        if (!empresaId) {
            throw new BadRequestException(
                'Não foi possível identificar a empresa de quem está criando a loja.',
            );
        }

        const tipoPessoa = dto.tipoPessoa ?? TipoPessoaStore.JURIDICA;

        return this.prisma.store.create({
            data: {
                name: dto.name,
                isDemo: dto.isDemo,
                empresaId,
                cnpj: dto.cnpj,
                address: dto.address,
                phone: dto.phone,
                uf: dto.uf,
                logradouro: dto.logradouro,
                numero: dto.numero,
                complemento: dto.complemento,
                bairro: dto.bairro,
                municipio: dto.municipio,
                codigoMunicipioIbge: dto.codigoMunicipioIbge,
                cep: dto.cep,
                inscricaoEstadual: dto.inscricaoEstadual,
                tipoPessoa,
                cpf: dto.cpf,
                telefoneAvisoDiario: dto.telefoneAvisoDiario,
                // Loja Pessoa Física só usa Contas a Pagar — nasce (e fica)
                // restrita, mesmo que alguém tente ligar outro módulo depois
                // (ver updateModules, que também bloqueia isso).
                enabledModules:
                    tipoPessoa === TipoPessoaStore.FISICA
                        ? [StoreModule.CONTAS_A_PAGAR]
                        : undefined,
            },
        });
    }

    private hasGlobalStoreAccess(user: any) {
        return (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        );
    }

    // Gerente só administra (editar dados, certificado) as lojas às quais
    // já está vinculado — diferente de Administrativo/Proprietário, que têm
    // acesso global. Criar loja nova, excluir loja e vincular/desvincular
    // usuário continuam restritos a Administrativo/Proprietário no
    // controller (@Roles), então essa checagem só entra em cena pra
    // update/certificado.
    //
    // Multi-tenant: "acesso global" (Administrativo/Proprietário) é global
    // DENTRO da própria empresa, nunca entre empresas — sem essa checagem,
    // um Administrativo/Proprietário de QUALQUER empresa-cliente que
    // soubesse (ou adivinhasse) o storeId de outra empresa conseguia editar
    // os dados da loja, ou pior, mexer no certificado digital dela (testar
    // conexão/diagnóstico usa o certificado e-CNPJ de terceiro pra
    // autenticar na Sefaz). Corrigido aqui buscando a loja e comparando a
    // empresa dona dela com a empresa de quem está agindo (ou a empresa da
    // loja ativa, se for Admin Master — ver activeStoreEmpresaId no
    // jwt.strategy.ts). Admin Master sem loja ativa (painel /admin)
    // continua escapando de propósito.
    private async ensureManagedStoreAccess(storeId: string, user: any) {
        if (user?.isAdminMaster && !user.activeStoreEmpresaId) return;

        if (this.hasGlobalStoreAccess(user) || user?.isAdminMaster) {
            const empresaId = user.isAdminMaster
                ? user.activeStoreEmpresaId
                : user.empresaId;

            const store = await this.prisma.store.findUnique({
                where: { id: storeId },
                select: { empresaId: true },
            });

            if (!store || store.empresaId !== empresaId) {
                throw new ForbiddenException(
                    'Você só pode gerenciar as lojas da sua empresa.',
                );
            }

            return;
        }

        const allowedStoreIds =
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || [];

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException(
                'Você só pode gerenciar as lojas vinculadas a você.',
            );
        }
    }

    async findAll(user: any) {
        if (this.hasGlobalStoreAccess(user)) {
            return this.prisma.store.findMany({
                where: {
                    active: true,
                    // Loja de teste (isDemo, criada em /demo/signup) nunca
                    // aparece em Cadastros → Lojas pra Administrativo/
                    // Proprietário — mesmo efeito de ter uma tabela
                    // separada só pra isso, sem precisar duplicar nada.
                    isDemo: false,
                    // Multi-tenant: "acesso global" é global DENTRO da
                    // própria empresa, não entre empresas — sem isso o
                    // Proprietário da empresa A veria as lojas da empresa B
                    // aqui. Admin Master usa a empresa da loja ativa
                    // (activeStoreEmpresaId, resolvido no jwt.strategy.ts a
                    // partir do header x-store-id) — dentro de uma loja da
                    // empresa X ele só vê/gerencia lojas da empresa X aqui.
                    // Sem loja ativa nenhuma (ex.: painel /admin puro,
                    // fora do fluxo normal de Cadastros) cai sem filtro de
                    // propósito, mas essa tela normalmente só é acessada já
                    // com uma loja selecionada.
                    ...(user.isAdminMaster
                        ? user.activeStoreEmpresaId
                            ? { empresaId: user.activeStoreEmpresaId }
                            : {}
                        : { empresaId: user.empresaId }),
                },
                orderBy: {
                    name: 'asc',
                },
                include: {
                    cards: {
                        where: {
                            active: true,
                        },
                    },
                },
            });
        }

        return this.prisma.store.findMany({
            where: {
                active: true,
                userStores: {
                    some: {
                        userId: user.id,
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
            include: {
                cards: {
                    where: {
                        active: true,
                    },
                },
            },
        });
    }

    // Lista usada só pelo seletor de loja do topo (e na tela de "escolha
    // a loja" logo após o login) — diferente de findAll() acima, que
    // agora é escopado pela empresa da loja ativa. Aqui o Admin Master
    // precisa continuar vendo TODAS as lojas de TODAS as empresas-cliente
    // (é o único jeito de trocar de empresa), então devolve também o nome
    // da empresa dona de cada loja pra o frontend poder agrupar em cards.
    // Qualquer outro perfil recebe exatamente a mesma lista de sempre
    // (findAll), sem nenhuma mudança de comportamento.
    async findAllForSwitcher(user: any) {
        if (user?.isAdminMaster) {
            const stores = await this.prisma.store.findMany({
                where: {
                    active: true,
                    isDemo: false,
                },
                orderBy: [{ empresa: { name: 'asc' } }, { name: 'asc' }],
                include: {
                    empresa: {
                        select: { id: true, name: true },
                    },
                },
            });

            return stores.map((store) => ({
                ...store,
                empresaId: store.empresa?.id ?? null,
                empresaName: store.empresa?.name ?? null,
            }));
        }

        return this.findAll(user);
    }

    async ensureStoreExists(id: string) {
        const store = await this.prisma.store.findUnique({
            where: { id },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada');
        }

        return store;
    }

    async findOne(id: string, user?: any) {
        const where: any = {
            id,
        };

        if (user && !this.hasGlobalStoreAccess(user)) {
            where.userStores = {
                some: {
                    userId: user.id,
                },
            };
        }

        // Multi-tenant: mesmo com acesso global, nunca abre loja de outra
        // empresa por id direto (IDOR) — Admin Master é a única exceção,
        // ele de propósito enxerga qualquer loja.
        if (user && !user.isAdminMaster) {
            where.empresaId = user.empresaId;
        }

        const store = await this.prisma.store.findFirst({
            where,
            include: {
                cards: true,
                userStores: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                role: true,
                                active: true,
                            },
                        },
                    },
                },
            },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada ou sem permissão.');
        }

        return store;
    }

    async update(id: string, dto: UpdateStoreDto, user: any) {
        await this.ensureStoreExists(id);
        await this.ensureManagedStoreAccess(id, user);

        return this.prisma.store.update({
            where: { id },
            data: {
                name: dto.name,
                isDemo: dto.isDemo,
                cnpj: dto.cnpj,
                address: dto.address,
                phone: dto.phone,
                uf: dto.uf,
                logradouro: dto.logradouro,
                numero: dto.numero,
                complemento: dto.complemento,
                bairro: dto.bairro,
                municipio: dto.municipio,
                codigoMunicipioIbge: dto.codigoMunicipioIbge,
                cep: dto.cep,
                inscricaoEstadual: dto.inscricaoEstadual,
                tipoPessoa: dto.tipoPessoa,
                cpf: dto.cpf,
                telefoneAvisoDiario: dto.telefoneAvisoDiario,
                // Se virou (ou continua) Física, trava de volta nos módulos
                // dela — mesma regra do create(), pra não dar de ligar um
                // módulo de negócio numa loja pessoal por engano.
                enabledModules:
                    dto.tipoPessoa === TipoPessoaStore.FISICA
                        ? [StoreModule.CONTAS_A_PAGAR]
                        : undefined,
            },
        });
    }

    // Painel de módulos (isAdminMaster) — controller já garante o guard,
    // aqui só valida a lista recebida e persiste. Não passa por
    // ensureManagedStoreAccess de propósito: quem edita isso é você, dono
    // do SaaS, não o Proprietário/Gerente da loja.
    async updateModules(id: string, enabledModules: StoreModule[]) {
        await this.ensureStoreExists(id);

        const invalid = enabledModules.filter(
            (module) => !ALL_STORE_MODULES.includes(module),
        );

        if (invalid.length > 0) {
            throw new BadRequestException(
                `Módulo inválido: ${invalid.join(', ')}.`,
            );
        }

        return this.prisma.store.update({
            where: { id },
            data: { enabledModules },
        });
    }

    async remove(id: string) {
        await this.ensureStoreExists(id);

        return this.prisma.store.update({
            where: { id },
            data: {
                active: false,
            },
        });
    }

    // Exclusão de verdade da loja — restrita ao dono do sistema
    // (AdminMasterGuard no controller). MUITO destrutivo: várias tabelas
    // têm onDelete: Cascade pra Store (ex.: StockItem/StockMovement), então
    // apagar a loja pode arrastar histórico de estoque, compras, NFs e
    // contas junto. Não existe confirmação extra aqui de propósito — a UI
    // é quem deve pedir confirmação forte (digitar o nome da loja) antes
    // de chamar essa rota.
    async removeDefinitivo(id: string) {
        await this.ensureStoreExists(id);

        try {
            await this.prisma.store.delete({ where: { id } });
        } catch (error: any) {
            if (error?.code === 'P2003') {
                throw new ConflictException(
                    'Essa loja tem dados vinculados que impedem a exclusão definitiva.',
                );
            }
            throw error;
        }

        return { ok: true };
    }

    async linkUser(storeId: string, userId: string) {
        await this.ensureStoreExists(storeId);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('Usuário não encontrado');
        }

        return this.prisma.userStore.upsert({
            where: {
                userId_storeId: {
                    userId,
                    storeId,
                },
            },
            update: {},
            create: {
                userId,
                storeId,
            },
        });
    }

    async unlinkUser(storeId: string, userId: string) {
        await this.ensureStoreExists(storeId);

        const userStore = await this.prisma.userStore.findUnique({
            where: {
                userId_storeId: {
                    userId,
                    storeId,
                },
            },
        });

        if (!userStore) {
            throw new NotFoundException('Usuário não está vinculado a essa loja');
        }

        return this.prisma.userStore.delete({
            where: {
                userId_storeId: {
                    userId,
                    storeId,
                },
            },
        });
    }

    async getCertificateStatus(storeId: string, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
            select: {
                fileName: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return {
            hasCertificate: !!certificate,
            fileName: certificate?.fileName || null,
            uploadedAt: certificate?.updatedAt || null,
        };
    }

    async saveCertificate(
        storeId: string,
        file: Express.Multer.File,
        password: string,
        user: any,
    ) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        if (!file) {
            throw new BadRequestException(
                'Envie o arquivo do certificado (.pfx ou .p12).',
            );
        }

        if (!password || !password.trim()) {
            throw new BadRequestException(
                'Informe a senha do certificado.',
            );
        }

        const filePath = join(certificatesPath, `${storeId}.pfx`);

        writeFileSync(filePath, file.buffer);

        const encrypted = encryptSecret(password);

        await this.prisma.storeCertificate.upsert({
            where: { storeId },
            update: {
                fileName: file.originalname,
                filePath,
                passwordCipher: encrypted.cipher,
                passwordIv: encrypted.iv,
                passwordAuthTag: encrypted.authTag,
                uploadedById: user.id,
            },
            create: {
                storeId,
                fileName: file.originalname,
                filePath,
                passwordCipher: encrypted.cipher,
                passwordIv: encrypted.iv,
                passwordAuthTag: encrypted.authTag,
                uploadedById: user.id,
            },
        });

        return this.getCertificateStatus(storeId, user);
    }

    async removeCertificate(storeId: string, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new NotFoundException(
                'Nenhum certificado cadastrado para essa loja.',
            );
        }

        if (existsSync(certificate.filePath)) {
            unlinkSync(certificate.filePath);
        }

        await this.prisma.storeCertificate.delete({
            where: { storeId },
        });

        return { success: true };
    }

    async testCertificateConnection(storeId: string, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new NotFoundException(
                'Nenhum certificado cadastrado para essa loja.',
            );
        }

        // Sempre parte do NSU salvo, nunca de 0 — mesmo raciocínio do teste
        // de NF-e de mercadoria abaixo: repetir NSU=0 em cliques seguidos é
        // o que a Sefaz/ADN pune como "consumo indevido".
        return testCertificateConnection(
            certificate.filePath,
            {
                cipher: certificate.passwordCipher,
                iv: certificate.passwordIv,
                authTag: certificate.passwordAuthTag,
            },
            'PRODUCAO',
            certificate.lastNsu,
        );
    }

    // Testa a conexão com o webservice de NF-e de mercadoria (produção
    // nacional) — diferente do teste de NFS-e acima, que fala com o ADN.
    // Exige CNPJ e UF cadastrados na loja além do certificado.
    async testGoodsConnection(storeId: string, user: any) {
        const store = await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        if (!store.cnpj) {
            throw new BadRequestException(
                'Cadastre o CNPJ da loja antes de testar a busca de NF-e.',
            );
        }

        if (!store.uf) {
            throw new BadRequestException(
                'Cadastre a UF da loja antes de testar a busca de NF-e.',
            );
        }

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new NotFoundException(
                'Nenhum certificado cadastrado para essa loja.',
            );
        }

        const cert = loadCertificate(certificate.filePath, {
            cipher: certificate.passwordCipher,
            iv: certificate.passwordIv,
            authTag: certificate.passwordAuthTag,
        });

        // Sempre parte do NSU salvo, nunca de 0 — repetir NSU=0 em
        // cliques seguidos é o que faz a Sefaz bloquear por "consumo
        // indevido".
        const result = await testGoodsConnection(
            cert,
            store.cnpj,
            store.uf,
            certificate.lastNsuNfe,
        );

        // Mesmo sendo só um "teste", já aproveitamos o NSU que a Sefaz
        // devolveu — assim o próximo clique (ou a sincronização de
        // verdade) não repete a mesma consulta.
        if (result.success && result.ultNSU) {
            await this.prisma.storeCertificate.update({
                where: { storeId },
                data: { lastNsuNfe: BigInt(result.ultNSU) },
            });
        }

        return result;
    }

    // Ferramenta temporária de diagnóstico: usa o certificado (que já
    // autentica, como confirmado pelo testCertificateConnection) pra
    // sondar alguns caminhos possíveis da API da Sefaz e trazer de volta
    // o que cada um responde, já que a documentação oficial também exige
    // certificado pra ser vista.
    async runCertificateDiagnostics(storeId: string, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new NotFoundException(
                'Nenhum certificado cadastrado para essa loja.',
            );
        }

        return runDiagnostics(certificate.filePath, {
            cipher: certificate.passwordCipher,
            iv: certificate.passwordIv,
            authTag: certificate.passwordAuthTag,
        });
    }

    // Últimas tentativas de busca (manual ou automática) de NF-e/NFS-e na
    // Sefaz/ADN dessa loja — sucesso e erro, mais recente primeiro.
    async getSefazSyncLogs(storeId: string, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        return this.prisma.sefazSyncLog.findMany({
            where: { storeId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
    }

    // ------------------------------------------------------------------
    // Credencial Meep (Cadastros → Lojas → aba Meep). Segue exatamente o
    // mesmo padrão do certificado digital acima: senha/subscription key
    // nunca ficam em texto puro (AES-256-GCM via certificate-crypto.util),
    // e status/CRUD são escopados pela mesma ensureManagedStoreAccess.
    // ------------------------------------------------------------------

    async getMeepCredentialStatus(storeId: string, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
            select: {
                meepStoreId: true,
                username: true,
                active: true,
                lastSalesSyncedUntil: true,
                lastConciliationSyncedUntil: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return {
            hasCredential: !!credential,
            meepStoreId: credential?.meepStoreId || null,
            username: credential?.username || null,
            active: credential?.active ?? false,
            lastSalesSyncedUntil: credential?.lastSalesSyncedUntil || null,
            lastConciliationSyncedUntil:
                credential?.lastConciliationSyncedUntil || null,
            updatedAt: credential?.updatedAt || null,
        };
    }

    async saveMeepCredential(
        storeId: string,
        data: {
            subscriptionKey: string;
            username: string;
            password: string;
            meepStoreId: string;
        },
        user: any,
    ) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        if (!data.subscriptionKey || !data.subscriptionKey.trim()) {
            throw new BadRequestException('Informe a subscription key da Meep.');
        }
        if (!data.username || !data.username.trim()) {
            throw new BadRequestException('Informe o login (portal.meep-app.com) da Meep.');
        }
        if (!data.password || !data.password.trim()) {
            throw new BadRequestException('Informe a senha da Meep.');
        }
        if (!data.meepStoreId || !data.meepStoreId.trim()) {
            throw new BadRequestException('Informe o StoreId da Meep dessa loja.');
        }

        const subscriptionKeyEncrypted = encryptSecret(data.subscriptionKey.trim());
        const passwordEncrypted = encryptSecret(data.password.trim());

        await this.prisma.meepCredential.upsert({
            where: { storeId },
            update: {
                subscriptionKeyCipher: subscriptionKeyEncrypted.cipher,
                subscriptionKeyIv: subscriptionKeyEncrypted.iv,
                subscriptionKeyAuthTag: subscriptionKeyEncrypted.authTag,
                username: data.username.trim(),
                passwordCipher: passwordEncrypted.cipher,
                passwordIv: passwordEncrypted.iv,
                passwordAuthTag: passwordEncrypted.authTag,
                meepStoreId: data.meepStoreId.trim(),
                active: true,
            },
            create: {
                storeId,
                subscriptionKeyCipher: subscriptionKeyEncrypted.cipher,
                subscriptionKeyIv: subscriptionKeyEncrypted.iv,
                subscriptionKeyAuthTag: subscriptionKeyEncrypted.authTag,
                username: data.username.trim(),
                passwordCipher: passwordEncrypted.cipher,
                passwordIv: passwordEncrypted.iv,
                passwordAuthTag: passwordEncrypted.authTag,
                meepStoreId: data.meepStoreId.trim(),
            },
        });

        return this.getMeepCredentialStatus(storeId, user);
    }

    async removeMeepCredential(storeId: string, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });
        if (!credential) {
            throw new NotFoundException('Nenhuma credencial Meep cadastrada para essa loja.');
        }

        await this.prisma.meepCredential.delete({ where: { storeId } });
        return { success: true };
    }

    async setMeepCredentialActive(storeId: string, active: boolean, user: any) {
        await this.ensureStoreExists(storeId);
        await this.ensureManagedStoreAccess(storeId, user);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });
        if (!credential) {
            throw new NotFoundException('Nenhuma credencial Meep cadastrada para essa loja.');
        }

        await this.prisma.meepCredential.update({
            where: { storeId },
            data: { active },
        });

        return this.getMeepCredentialStatus(storeId, user);
    }
}