// Script de diagnóstico — compara os dados fiscais das lojas usados na
// emissão de NF-e (CNPJ, UF, Inscrição Estadual, endereço/IBGE) lado a
// lado, pra achar diferença de cadastro entre Contagem (rejeitada) e
// Anchieta/Raiz (autorizadas).
//
// Como rodar (dentro da pasta backend, com o banco local rodando):
//   node check-lojas-nfe.js
//
// Não altera nada — só lê e imprime.

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// Este projeto usa Prisma 7 com driver adapter (pg) — igual ao
// prisma.service.ts do Nest — então o PrismaClient aqui também
// precisa do adapter, senão dá erro de "PrismaClientOptions".
require('dotenv').config();

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

function marcar(valor, obrigatorio = true) {
    if (valor == null || String(valor).trim() === '') {
        return obrigatorio ? '❌ VAZIO' : '(vazio)';
    }
    return String(valor);
}

async function main() {
    const lojas = await prisma.store.findMany({
        where: { active: true },
        select: {
            id: true,
            name: true,
            cnpj: true,
            uf: true,
            inscricaoEstadual: true,
            logradouro: true,
            numero: true,
            bairro: true,
            municipio: true,
            codigoMunicipioIbge: true,
            cep: true,
            lossNfeSerie: true,
            lossNfeNextNumber: true,
            certificate: {
                select: {
                    fileName: true,
                    nfeBlockedUntil: true,
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    console.log('\n=== Comparativo fiscal das lojas (dados usados na NF-e) ===\n');

    for (const loja of lojas) {
        console.log(`— ${loja.name} (id: ${loja.id})`);
        console.log(`  CNPJ:                 ${marcar(loja.cnpj)}`);
        console.log(`  UF:                   ${marcar(loja.uf)}`);
        console.log(`  Inscrição Estadual:   ${marcar(loja.inscricaoEstadual)}  ${!loja.inscricaoEstadual ? '⚠️  sem IE → sistema manda <IE>ISENTO</IE> no XML' : ''}`);
        console.log(`  Município:            ${marcar(loja.municipio)}`);
        console.log(`  Código IBGE município:${marcar(loja.codigoMunicipioIbge)}`);
        console.log(`  Logradouro/Número:    ${marcar(loja.logradouro, false)}, ${marcar(loja.numero, false)}`);
        console.log(`  Bairro/CEP:           ${marcar(loja.bairro, false)} / ${marcar(loja.cep, false)}`);
        console.log(`  Série/Próx. número (NF Perda): ${loja.lossNfeSerie ?? '(vazio)'} / ${loja.lossNfeNextNumber ?? '(vazio)'}`);
        console.log(`  Certificado digital:  ${loja.certificate ? loja.certificate.fileName : '❌ SEM CERTIFICADO'}`);
        console.log('');
    }

    // Checagem rápida de duplicidade/inconsistência entre lojas.
    const cnpjs = lojas.map((l) => (l.cnpj || '').replace(/\D/g, '')).filter(Boolean);
    const cnpjsUnicos = new Set(cnpjs);
    if (cnpjs.length !== cnpjsUnicos.size) {
        console.log('⚠️  ATENÇÃO: existem lojas com o MESMO CNPJ cadastrado — confira se não é erro de copiar/colar.\n');
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Erro ao consultar o banco:', err.message);
    await prisma.$disconnect();
    process.exit(1);
});
