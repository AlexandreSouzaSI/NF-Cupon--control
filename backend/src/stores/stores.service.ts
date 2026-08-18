import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UserRole } from '@prisma/client';
import { encryptSecret } from './certificate-crypto.util';
import { runDiagnostics, testCertificateConnection, loadCertificate } from './sefaz-nfse-client';
import { testGoodsConnection } from './sefaz-nfe-client';

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

    async create(dto: CreateStoreDto) {
        return this.prisma.store.create({
            data: {
                name: dto.name,
                cnpj: dto.cnpj,
                address: dto.address,
                phone: dto.phone,
                uf: dto.uf,
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
    private ensureManagedStoreAccess(storeId: string, user: any) {
        if (this.hasGlobalStoreAccess(user)) return;

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
        this.ensureManagedStoreAccess(id, user);

        return this.prisma.store.update({
            where: { id },
            data: {
                name: dto.name,
                cnpj: dto.cnpj,
                address: dto.address,
                phone: dto.phone,
                uf: dto.uf,
            },
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
        this.ensureManagedStoreAccess(storeId, user);

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
        this.ensureManagedStoreAccess(storeId, user);

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
        this.ensureManagedStoreAccess(storeId, user);

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
        this.ensureManagedStoreAccess(storeId, user);

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new NotFoundException(
                'Nenhum certificado cadastrado para essa loja.',
            );
        }

        return testCertificateConnection(certificate.filePath, {
            cipher: certificate.passwordCipher,
            iv: certificate.passwordIv,
            authTag: certificate.passwordAuthTag,
        });
    }

    // Testa a conexão com o webservice de NF-e de mercadoria (produção
    // nacional) — diferente do teste de NFS-e acima, que fala com o ADN.
    // Exige CNPJ e UF cadastrados na loja além do certificado.
    async testGoodsConnection(storeId: string, user: any) {
        const store = await this.ensureStoreExists(storeId);
        this.ensureManagedStoreAccess(storeId, user);

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
        this.ensureManagedStoreAccess(storeId, user);

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
}