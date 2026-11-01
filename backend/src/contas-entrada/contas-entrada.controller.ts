import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { StoreModule, UserRole } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleAccessGuard } from '../auth/module-access.guard';
import { RequiresModule } from '../auth/requires-module.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ConciliacaoExtratoService } from './conciliacao-extrato.service';
import { ContasEnviadasService } from './contas-enviadas.service';
import { EmailBoletosService } from './email-boletos.service';
import { empresaDo, exigirGestor } from './entrada.util';
import { OmieContasService } from './omie-contas.service';
import { PagamentosAvisadosService } from './pagamentos-avisados.service';
import { RecebimentoAutomaticoService } from './recebimento-automatico.service';
import { WhatsappRecebimentoService } from './whatsapp-recebimento.service';

const uploadDocumento = FileInterceptor('file', {
    storage: memoryStorage(),
    // PDF escaneado pelo celular passa fácil de 10 MB.
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /^(image\/|application\/pdf|application\/xml|text\/xml)/.test(file.mimetype) || /\.(pdf|xml)$/i.test(file.originalname || '');
        cb(ok ? null : new Error('Envie PDF, XML ou foto do boleto/nota.'), ok);
    },
});

const uploadComprovante = FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /^(image\/|application\/pdf)/.test(file.mimetype);
        cb(ok ? null : new Error('Envie uma imagem ou PDF.'), ok);
    },
});

const uploadExtratos = FilesInterceptor('files', 2, {
    storage: memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /\.(xls|xlsx|ofx)$/i.test(file.originalname || '');
        cb(ok ? null : new Error('Envie o extrato em OFX ou Excel (.xls/.xlsx).'), ok);
    },
});

function enviarArquivo(res: Response, a: { arquivo?: any; comprovante?: any; nome: string | null; mime: string | null }) {
    res.setHeader('Content-Type', a.mime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome ?? 'documento')}"`);
    res.send(Buffer.from((a.arquivo ?? a.comprovante) as Uint8Array));
}

// Mesmo acesso de Contas a Pagar.
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.FINANCEIRO)
@RequiresModule(StoreModule.CONTAS_A_PAGAR)
@Controller('contas-entrada')
export class ContasEntradaController {
    constructor(
        private readonly contas: ContasEnviadasService,
        private readonly pagamentos: PagamentosAvisadosService,
    ) { }

    // ------------------------------------------------------- Lançar Contas
    @Post('contas')
    @UseInterceptors(uploadDocumento)
    criarConta(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
        return this.contas.criar(user, body ?? {}, file);
    }

    @Get('contas/link')
    linkContas(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.contas.obterLink(user, storeId);
    }

    @Post('contas/link')
    gerarLinkContas(@CurrentUser() user: any, @Body('storeId') storeId: string) {
        exigirGestor(user);
        return this.contas.gerarLink(user, storeId);
    }

    @Delete('contas/link')
    revogarLinkContas(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        exigirGestor(user);
        return this.contas.revogarLink(user, storeId);
    }

    @Get('contas')
    listarContas(@CurrentUser() user: any, @Query('status') status?: string, @Query('storeId') storeId?: string) {
        return this.contas.listar(user, status, storeId);
    }

    @Get('contas/:id/arquivo')
    async arquivoConta(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
        const a = await this.contas.arquivo(user, id);
        enviarArquivo(res, { arquivo: a.arquivo, nome: a.arquivoNome, mime: a.arquivoMime });
    }

    @Get('contas/:id/parecidas')
    parecidas(@CurrentUser() user: any, @Param('id') id: string) {
        return this.contas.parecidas(user, id);
    }

    @Get('contas/:id/nfs')
    nfsDaConta(@CurrentUser() user: any, @Param('id') id: string, @Query('q') q?: string) {
        return this.contas.nfsCandidatas(user, id, q);
    }

    @Patch('contas/:id')
    salvarConta(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
        return this.contas.salvar(user, id, body ?? {});
    }

    @Patch('contas/:id/lancar')
    lancar(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
        return this.contas.lancar(user, id, body ?? {});
    }

    @Patch('contas/:id/descartar')
    descartarConta(@CurrentUser() user: any, @Param('id') id: string, @Body('motivo') motivo?: string) {
        return this.contas.descartar(user, id, motivo);
    }

    // ------------------------------------------------ Registrar Pagamentos
    @Post('pagamentos')
    @UseInterceptors(uploadComprovante)
    criarPagamento(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
        return this.pagamentos.criar(user, body ?? {}, file);
    }

    @Get('pagamentos/link')
    linkPagamentos(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.pagamentos.obterLink(user, storeId);
    }

    @Post('pagamentos/link')
    gerarLinkPagamentos(@CurrentUser() user: any, @Body('storeId') storeId: string) {
        exigirGestor(user);
        return this.pagamentos.gerarLink(user, storeId);
    }

    @Delete('pagamentos/link')
    revogarLinkPagamentos(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        exigirGestor(user);
        return this.pagamentos.revogarLink(user, storeId);
    }

    @Get('pagamentos')
    listarPagamentos(@CurrentUser() user: any, @Query('status') status?: string, @Query('storeId') storeId?: string) {
        return this.pagamentos.listar(user, status, storeId);
    }

    @Get('pagamentos/:id/comprovante')
    async comprovante(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
        const c = await this.pagamentos.comprovante(user, id);
        enviarArquivo(res, { comprovante: c.comprovante, nome: c.comprovanteNome, mime: c.comprovanteMime });
    }

    @Get('pagamentos/:id/sugestoes')
    sugestoes(@CurrentUser() user: any, @Param('id') id: string) {
        return this.pagamentos.sugestoes(user, id);
    }

    @Patch('pagamentos/:id/conciliar')
    conciliar(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
        return this.pagamentos.conciliar(user, id, body ?? {});
    }

    @Patch('pagamentos/:id/descartar')
    descartarPagamento(@CurrentUser() user: any, @Param('id') id: string) {
        return this.pagamentos.descartar(user, id);
    }
}

@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.FINANCEIRO)
@RequiresModule(StoreModule.CONTAS_A_PAGAR)
@Controller('conciliacao-extrato')
export class ConciliacaoExtratoController {
    constructor(private readonly service: ConciliacaoExtratoService) { }

    @Get()
    listar(@CurrentUser() user: any, @Query('storeId') storeId?: string) {
        return this.service.listar(user, storeId);
    }

    @Post('importar')
    @UseInterceptors(uploadExtratos)
    importar(@CurrentUser() user: any, @Query('storeId') storeId: string, @UploadedFiles() files: Express.Multer.File[]) {
        return this.service.importar(user, storeId, files);
    }

    @Get('vinculos/lista')
    vinculos(@CurrentUser() user: any) {
        return this.service.listarVinculos(user);
    }

    @Post('vinculos')
    salvarVinculo(@CurrentUser() user: any, @Body() body: any) {
        return this.service.salvarVinculo(user, body ?? {});
    }

    @Post('vinculos/lote')
    salvarVinculosLote(@CurrentUser() user: any, @Body('texto') texto?: string) {
        return this.service.salvarVinculosLote(user, texto ?? '');
    }

    @Delete('vinculos/:vid')
    excluirVinculo(@CurrentUser() user: any, @Param('vid') vid: string) {
        return this.service.excluirVinculo(user, vid);
    }

    @Get(':id')
    obter(@CurrentUser() user: any, @Param('id') id: string) {
        return this.service.obter(user, id);
    }

    @Patch(':id/itens')
    salvar(@CurrentUser() user: any, @Param('id') id: string, @Body('itens') itens?: any[]) {
        return this.service.salvarInterno(user, id, itens ?? []);
    }

    @Post(':id/reclassificar')
    reclassificar(@CurrentUser() user: any, @Param('id') id: string) {
        return this.service.reclassificar(user, id);
    }

    @Post(':id/link')
    gerarLink(@CurrentUser() user: any, @Param('id') id: string) {
        return this.service.gerarLink(user, id);
    }

    @Delete(':id/link')
    revogarLink(@CurrentUser() user: any, @Param('id') id: string) {
        return this.service.revogarLink(user, id);
    }

    @Post(':id/aplicar')
    aplicar(@CurrentUser() user: any, @Param('id') id: string) {
        return this.service.aplicar(user, id);
    }

    @Post(':id/desfazer')
    desfazer(@CurrentUser() user: any, @Param('id') id: string) {
        return this.service.desfazer(user, id);
    }

    @Delete(':id')
    excluir(@CurrentUser() user: any, @Param('id') id: string) {
        return this.service.excluir(user, id);
    }
}

@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.FINANCEIRO)
@RequiresModule(StoreModule.CONTAS_A_PAGAR)
@Controller('recebimento-automatico')
export class RecebimentoAutomaticoController {
    constructor(
        private readonly recebimento: RecebimentoAutomaticoService,
        private readonly whatsapp: WhatsappRecebimentoService,
        private readonly email: EmailBoletosService,
    ) { }

    @Get()
    async status(@CurrentUser() user: any) {
        const empresaId = empresaDo(user);
        const [conexoes, email, ultimas] = await Promise.all([
            this.whatsapp.listar(empresaId),
            this.email.status(empresaId),
            this.recebimento.ultimas(empresaId),
        ]);
        return { whatsappConfigurado: this.whatsapp.configurado, conexoes, email, ultimas };
    }

    @Post('whatsapp')
    criarWhatsapp(@CurrentUser() user: any, @Body() body: any) {
        exigirGestor(user);
        return this.whatsapp.criar(empresaDo(user), body ?? {});
    }

    @Patch('whatsapp/:id')
    editarWhatsapp(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
        exigirGestor(user);
        return this.whatsapp.editar(empresaDo(user), id, body ?? {});
    }

    @Post('whatsapp/:id/conectar')
    conectar(@CurrentUser() user: any, @Param('id') id: string) {
        exigirGestor(user);
        return this.whatsapp.conectar(empresaDo(user), id);
    }

    @Post('whatsapp/:id/desconectar')
    desconectar(@CurrentUser() user: any, @Param('id') id: string) {
        exigirGestor(user);
        return this.whatsapp.desconectar(empresaDo(user), id);
    }

    @Delete('whatsapp/:id')
    excluirWhatsapp(@CurrentUser() user: any, @Param('id') id: string) {
        exigirGestor(user);
        return this.whatsapp.excluir(empresaDo(user), id);
    }

    @Put('email')
    salvarEmail(@CurrentUser() user: any, @Body() body: any) {
        exigirGestor(user);
        return this.email.salvar(empresaDo(user), body ?? {});
    }

    @Delete('email')
    removerEmail(@CurrentUser() user: any) {
        exigirGestor(user);
        return this.email.remover(empresaDo(user));
    }

    @Post('email/verificar')
    verificarEmail(@CurrentUser() user: any) {
        return this.email.verificar(empresaDo(user));
    }
}

// ----------------------------------------------------------------------------
// Rotas SEM login — protegidas só pelo token secreto do link.
// ----------------------------------------------------------------------------
@Controller('publico')
export class ContasEntradaPublicController {
    constructor(
        private readonly contas: ContasEnviadasService,
        private readonly pagamentos: PagamentosAvisadosService,
        private readonly conciliacao: ConciliacaoExtratoService,
    ) { }

    @Get('enviar-conta/:token')
    async validarEnvio(@Param('token') token: string) {
        const loja = await this.contas.lojaDoToken(token);
        return { loja: loja.name, ...(await this.contas.opcoesPublicas(loja.empresaId)) };
    }

    @Post('enviar-conta/:token')
    @UseInterceptors(uploadDocumento)
    async enviarConta(@Param('token') token: string, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
        const loja = await this.contas.lojaDoToken(token, true);
        const r = await this.contas.registrar(loja.empresaId, file, {
            enviadoPor: String(body?.nome ?? '').trim().slice(0, 80) || 'Link de envio',
            origem: 'LINK',
            storePadrao: loja.id,
            categoryId: body?.categoryId,
            observacao: body?.observacao,
        });
        return { ok: true, fornecedor: r.fornecedor, valor: r.valor, vencimento: r.vencimento, tipoDocumento: r.tipoDocumento, total: r.total };
    }

    @Get('avisar/:token')
    async validarAviso(@Param('token') token: string) {
        const loja = await this.pagamentos.lojaDoToken(token);
        return { loja: loja.name, ...(await this.contas.opcoesPublicas(loja.empresaId)) };
    }

    @Post('avisar/:token')
    @UseInterceptors(uploadComprovante)
    async avisar(@Param('token') token: string, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
        const loja = await this.pagamentos.lojaDoToken(token, true);
        const aviso = await this.pagamentos.registrar(loja.empresaId, file, body ?? {}, {
            avisadoPor: String(body?.nome ?? '').trim().slice(0, 80) || 'Link de aviso',
            storePadrao: loja.id,
        });
        return { ok: true, valor: aviso.valor, fornecedor: aviso.fornecedor };
    }

    @Get('conciliar-extrato/:token')
    obterConciliacao(@Param('token') token: string) {
        return this.conciliacao.obterPublico(token);
    }

    @Put('conciliar-extrato/:token')
    salvarConciliacao(@Param('token') token: string, @Body() body: any) {
        return this.conciliacao.salvarPublico(token, body ?? {});
    }
}

// Webhook do Evolution (sem login; protegido pelo segredo na URL).
@Controller('integracoes/whatsapp-recebimento')
export class WhatsappRecebimentoWebhookController {
    constructor(private readonly whatsapp: WhatsappRecebimentoService) { }

    @Post('webhook/:segredo')
    @HttpCode(200)
    webhook(@Param('segredo') segredo: string, @Body() body: any) {
        return this.whatsapp.webhook(segredo, body);
    }

    // Alguns envios do Evolution acrescentam o nome do evento no fim da URL.
    @Post('webhook/:segredo/:evento')
    @HttpCode(200)
    webhookEvento(@Param('segredo') segredo: string, @Body() body: any) {
        return this.whatsapp.webhook(segredo, body);
    }
}

@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO)
@RequiresModule(StoreModule.CONTAS_A_PAGAR)
@Controller('integracoes/omie')
export class OmieContasController {
    constructor(private readonly omie: OmieContasService) { }

    @Get()
    listar(@CurrentUser() user: any) {
        return this.omie.listar(user);
    }

    @Put(':storeId')
    salvar(@CurrentUser() user: any, @Param('storeId') storeId: string, @Body() body: any) {
        return this.omie.salvar(user, storeId, body ?? {});
    }

    @Delete(':storeId')
    remover(@CurrentUser() user: any, @Param('storeId') storeId: string) {
        return this.omie.remover(user, storeId);
    }

    @Post(':storeId/sincronizar')
    @HttpCode(202)
    sincronizar(@CurrentUser() user: any, @Param('storeId') storeId: string, @Body() body: any) {
        return this.omie.sincronizar(user, storeId, body ?? {});
    }
}
