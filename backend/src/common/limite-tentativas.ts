import { HttpException, HttpStatus } from '@nestjs/common';

// =============================================================================
// Limite de tentativas em memória (login, "esqueci minha senha", ativação).
// Cada chave guarda os horários das últimas tentativas; passou do limite na
// janela, devolve 429. Simples de propósito: um processo só (o backend roda
// em uma instância). Se um dia tiver várias, trocar por Redis.
// =============================================================================
export class LimiteTentativas {
    private readonly mapa = new Map<string, number[]>();

    constructor(private readonly maximo: number, private readonly janelaMs: number, private readonly mensagem: string) { }

    registrar(chave: string) {
        const agora = Date.now();
        const recentes = (this.mapa.get(chave) ?? []).filter((t) => agora - t < this.janelaMs);
        if (recentes.length >= this.maximo) {
            const espera = Math.ceil((this.janelaMs - (agora - recentes[0])) / 60_000);
            throw new HttpException(`${this.mensagem} Tente de novo em ${espera} min.`, HttpStatus.TOO_MANY_REQUESTS);
        }
        recentes.push(agora);
        this.mapa.set(chave, recentes);
        if (this.mapa.size > 50_000) this.limpar();
    }

    // Login certo zera as tentativas daquele usuário.
    zerar(chave: string) {
        this.mapa.delete(chave);
    }

    private limpar() {
        const agora = Date.now();
        for (const [k, v] of this.mapa) if (!v.some((t) => agora - t < this.janelaMs)) this.mapa.delete(k);
    }
}
