import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { existsSync, statSync } from 'fs';
import { extname, join, resolve, sep } from 'path';

import { PrismaService } from '../../prisma/prisma.service';

// =============================================================================
// Arquivos enviados (/uploads/...) — antes eram servidos abertos, sem login.
// Agora só com token: o "token de arquivo" (?t=, curto, só serve pra baixar
// arquivo — ver GET /auth/arquivo-token) ou o login normal no header.
// HTML/SVG/JS nunca são exibidos no navegador (sempre download), pra um
// arquivo enviado não conseguir rodar script no domínio do sistema.
// =============================================================================

const RAIZ = resolve(process.cwd(), 'uploads');
const PERIGOSOS = new Set(['.html', '.htm', '.svg', '.js', '.mjs', '.xhtml', '.xht']);

@Controller('uploads')
export class UploadsController {
    constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) { }

    @Get('*caminho')
    async baixar(@Param('caminho') caminho: string | string[], @Query('t') t: string | undefined, @Req() req: Request, @Res() res: Response) {
        const header = req.headers.authorization;
        const token = t || (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
        if (!token) throw new UnauthorizedException('Faça login para abrir este arquivo.');
        let payload: any;
        try {
            payload = await this.jwt.verifyAsync(token);
        } catch {
            throw new UnauthorizedException('Link expirado. Abra o arquivo de novo pelo sistema.');
        }
        const user = await this.prisma.user.findUnique({ where: { id: String(payload?.sub ?? '') }, select: { active: true } });
        if (!user?.active) throw new ForbiddenException('Acesso negado.');

        const relativo = (Array.isArray(caminho) ? caminho.join('/') : String(caminho ?? '')).replace(/\\/g, '/');
        const arquivo = resolve(join(RAIZ, relativo));
        // Nada de "../" pra fora da pasta.
        if (!arquivo.startsWith(RAIZ + sep) || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
            throw new NotFoundException('Arquivo não encontrado.');
        }

        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
        if (PERIGOSOS.has(extname(arquivo).toLowerCase())) {
            res.setHeader('Content-Disposition', 'attachment');
            res.setHeader('Content-Type', 'application/octet-stream');
        }
        res.sendFile(arquivo, { dotfiles: 'deny' });
    }
}
