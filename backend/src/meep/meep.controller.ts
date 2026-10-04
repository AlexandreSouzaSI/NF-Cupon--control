import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ensureStoreAccessScoped } from '../common/store-scope.util';
import { businessDayStartUtc, businessDayEndUtc } from '../common/business-day.util';

import { MeepQueryService } from './meep-query.service';
import { MeepSyncService } from './meep-sync.service';
import { MeepProductSalesSyncService } from './meep-product-sales-sync.service';
import { UpsertCashExtraDto } from './dto/upsert-cash-extra.dto';

// Telas de Vendas Meep (itens/dia, impostos/CFOP, conciliação de caixa) —
// mesmo espírito de acesso dos outros módulos financeiros/fiscais.
@Controller('meep')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiresModule(StoreModule.MEEP)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
export class MeepController {
    constructor(
        private meepQueryService: MeepQueryService,
        private meepSyncService: MeepSyncService,
        private meepProductSalesSync: MeepProductSalesSyncService,
        private prisma: PrismaService,
    ) { }

    @Get('itens-por-dia')
    async itemsPerDay(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        return this.meepQueryService.itemsPerDay(storeId, user, dateFrom, dateTo);
    }

    @Get('vendas-impostos')
    async salesWithTax(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        return this.meepQueryService.salesWithTax(storeId, user, dateFrom, dateTo);
    }

    @Get('conciliacao-caixa')
    async cashConciliation(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        return this.meepQueryService.cashConciliation(storeId, user, dateFrom, dateTo);
    }

    // Lançamento manual da grade de Conciliação de Caixa (Freelancer/
    // Descontos/Outros/Vale/Observação) — a Meep não manda isso em
    // nenhuma API, então o usuário preenche na tela e salva aqui, por
    // dia comercial.
    @Put('cash-extra')
    async upsertCashExtra(@CurrentUser() user: any, @Body() dto: UpsertCashExtraDto) {
        return this.meepQueryService.upsertCashExtra(dto.storeId, user, dto);
    }

    // Relatório Diário/Semanal da Conciliação de Caixa em PDF — mesmo
    // intervalo de datas da tela (um dia só = relatório "diário", vários
    // dias = "semanal", não tem rota separada pra cada um).
    @Get('conciliacao-caixa/report')
    async cashConciliationReport(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Res() res: Response,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        const buffer = await this.meepQueryService.cashConciliationReportPdf(
            storeId,
            user,
            dateFrom,
            dateTo,
        );
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="conciliacao-caixa.pdf"`,
        });
        res.send(buffer);
    }

    // Conferência Meep x Venda/Lista de um dia comercial: compara o que o
    // "Itens por Dia" mostra (MeepOrderItem) com o que o Venda/Lista lê
    // (ProductSalesEntry) e devolve a diferença. Só leitura. Restrito a
    // Proprietário/Admin Master (o guard já deixa o Admin Master passar por
    // qualquer @Roles). Ex:
    //   GET /meep/product-sales-check?storeId=<id>&date=2026-10-02
    @Get('product-sales-check')
    @Roles(UserRole.PROPRIETARIO)
    async productSalesCheck(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('date') date?: string,
    ) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new BadRequestException('Informe date no formato AAAA-MM-DD.');
        }

        return this.meepProductSalesSync.checkBusinessDay(storeId, date);
    }

    @Get('sync-logs')
    async syncLogs(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.meepQueryService.syncLogs(storeId, user);
    }

    // Botão "Buscar agora" — dispara as 3 rotinas na hora, sem esperar o
    // cron. Útil pra testar depois de configurar a credencial e pra
    // preencher o histórico inicial sem ficar esperando a próxima hora.
    @Post(':storeId/sync-now')
    async syncNow(@Param('storeId') storeId: string, @CurrentUser() user: any) {
        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });

        if (!credential) {
            return { success: false, message: 'Nenhuma credencial Meep cadastrada para essa loja.' };
        }

        await this.meepSyncService.syncSimpleSales(storeId, credential.id, credential.lastSalesSyncedUntil);
        await this.meepSyncService.syncConciliation(storeId, credential.id, credential.lastConciliationSyncedUntil);

        // O clique manual sempre tenta o CFOP/NCM (GetSales), mesmo fora
        // da janela 4h-14h que o cron respeita — é a Meep que decide se
        // aceita ou não fora desse horário (se rejeitar, o erro aparece
        // no histórico de sincronização normalmente). Sem isso, quem
        // clica em "Buscar agora" à noite (justamente quando o bar tá
        // funcionando) nunca vê CFOP/NCM aparecer.
        await this.meepSyncService.syncSales(storeId, credential.id, null);

        // O GetSales acima regrava os itens dos últimos 3 dias — sem isso o
        // Venda/Lista só acompanharia no próximo sync horário. Reconcilia
        // agora, e devolve os erros (se houver) pro botão mostrar.
        const rebuild = await this.meepProductSalesSync.rebuildRange(
            storeId,
            new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            new Date(),
        );

        return { success: true, rebuildErros: rebuild.erros };
    }

    // Reconstrói o Venda/Lista (ProductSalesImport origem=MEEP) a partir
    // dos pedidos Meep já salvos no banco (MeepOrder/MeepOrderItem) — útil
    // pra "backfill" uma única vez quando a ponte Meep->Venda/Lista foi
    // ligada depois de dias que já tinham sido sincronizados pelo cron
    // normal: o cron só recalcula a janela que ACABOU de buscar, então
    // pedidos antigos (já cobertos pelo cursor lastSalesSyncedUntil) nunca
    // passariam por aqui sem esse empurrão manual. Sem parâmetros, cobre
    // desde a criação da credencial até agora.
    @Post(':storeId/rebuild-product-sales')
    async rebuildProductSales(
        @Param('storeId') storeId: string,
        @CurrentUser() user: any,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });

        if (!credential) {
            return { success: false, message: 'Nenhuma credencial Meep cadastrada para essa loja.' };
        }

        // Com data informada, usa a janela do DIA COMERCIAL (08h-04h do dia
        // seguinte) — a mesma que o Itens por Dia e o Venda/Lista usam —
        // em vez de 00h-23h59 de calendário, que no fuso do servidor podia
        // pegar/perder o começo e o fim do dia.
        const to = dateTo ? businessDayEndUtc(dateTo) : new Date();
        // Não usa credential.createdAt como piso: se a credencial foi
        // editada/resalva depois dos primeiros pedidos sincronizados
        // (comum — foi o caso real), createdAt fica DEPOIS desses
        // pedidos e o backfill nunca os alcançaria. 90 dias cobre
        // qualquer backfill razoável sem depender desse campo.
        const from = dateFrom
            ? businessDayStartUtc(dateFrom)
            : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

        // force: é um pedido manual — reescreve mesmo se o rebuild achar
        // que "nada mudou" (garante sair de um estado estranho).
        const resultado = await this.meepProductSalesSync.rebuildRange(storeId, from, to, {
            force: true,
        });

        return { success: true, ...resultado };
    }

    // Re-sincronização forçada de vendas (pedidos + pagamento detalhado)
    // pra um dia comercial específico — é esse o dado que alimenta a
    // grade de Conciliação de Caixa (Credito/Debito/PIX/Dinheiro vêm do
    // MeepOrderPayment, o mesmo pagamento por pedido que já aparece em
    // Vendas e Impostos). Botão "Rebuscar este dia" da tela, pra quando o
    // usuário filtra um dia e ainda não vê os valores (ex: sync horário
    // ainda não rodou, ou falhou uma vez). Difere do force-resync
    // genérico (que usa dia de calendário 00h-23h59): aqui a janela
    // respeita o dia comercial (08h até 04h do dia seguinte).
    @Post(':storeId/force-resync-sales')
    async forceResyncSales(
        @Param('storeId') storeId: string,
        @CurrentUser() user: any,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });

        if (!credential) {
            return { success: false, message: 'Nenhuma credencial Meep cadastrada para essa loja.' };
        }

        const to = dateTo ? businessDayEndUtc(dateTo) : new Date();
        const from = dateFrom
            ? businessDayStartUtc(dateFrom)
            : new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);

        const resultado = await this.meepSyncService.forceResync(storeId, credential.id, from, to);

        return { success: true, ...resultado };
    }

    // Re-sincronização forçada só da conciliação de cartão (crédito/
    // débito/pix) pra um dia ou período específico — a liquidação pode
    // atrasar mais do que o reforço automático de alguns dias que o sync
    // normal já faz sozinho (ver CONCILIATION_LOOKBACK_DAYS em
    // meep-sync.service.ts). Mantido como reforço complementar pra loja
    // que de fato processa cartão direto pela Meep — a maioria das lojas
    // deve usar o force-resync-sales acima, que é a fonte real da grade.
    @Post(':storeId/force-resync-conciliation')
    async forceResyncConciliation(
        @Param('storeId') storeId: string,
        @CurrentUser() user: any,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });

        if (!credential) {
            return { success: false, message: 'Nenhuma credencial Meep cadastrada para essa loja.' };
        }

        const to = dateTo ? businessDayEndUtc(dateTo) : new Date();
        const from = dateFrom
            ? businessDayStartUtc(dateFrom)
            : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

        const resultado = await this.meepSyncService.forceResyncConciliation(storeId, credential.id, from, to);

        return { success: true, ...resultado };
    }

    // Re-sincronização forçada: diferente do rebuild acima (que só
    // recalcula o Venda/Lista do que JÁ está salvo), este endpoint volta a
    // CONSULTAR A MEEP de novo pro período informado — criado pra corrigir
    // dias que foram sincronizados antes do deploy da defesa contra
    // truncamento silencioso (ver comentário em forceResync no
    // meep-sync.service.ts). Sem parâmetros, cobre os últimos 10 dias.
    @Post(':storeId/force-resync')
    async forceResync(
        @Param('storeId') storeId: string,
        @CurrentUser() user: any,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });

        if (!credential) {
            return { success: false, message: 'Nenhuma credencial Meep cadastrada para essa loja.' };
        }

        const to = dateTo ? new Date(`${dateTo}T23:59:59`) : new Date();
        const from = dateFrom
            ? new Date(`${dateFrom}T00:00:00`)
            : new Date(to.getTime() - 10 * 24 * 60 * 60 * 1000);

        const resultado = await this.meepSyncService.forceResync(storeId, credential.id, from, to);

        return { success: true, ...resultado };
    }
}
