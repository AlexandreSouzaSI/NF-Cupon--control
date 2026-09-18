// Script de diagnóstico — abre o certificado .pfx de cada loja e
// confere se o CNPJ dentro do certificado (o que a Sefaz realmente usa
// pra saber "quem está assinando") é o MESMO CNPJ cadastrado na loja
// (Store.cnpj). Confere também a validade (vencido ou não).
//
// Isso ajuda a descartar/confirmar uma causa clássica da rejeição 781
// "Emissor não habilitado para emissão da NF-e": o certificado usado
// pra assinar o XML pertence a uma empresa diferente da que está no
// <emit><CNPJ> do XML (a Sefaz então reconhece o CNPJ do XML como "não
// habilitado" porque quem assinou não é ela).
//
// Como rodar (dentro da pasta backend, com o banco local rodando):
//   node check-certificados-nfe.js
//
// Só lê — não altera nada. Não imprime a senha do certificado.

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { readFileSync, existsSync } = require('fs');
const { createDecipheriv } = require('crypto');
const forge = require('node-forge');

require('dotenv').config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function decryptSecret({ cipher, iv, authTag }) {
    const rawKey = process.env.CERT_ENCRYPTION_KEY;
    if (!rawKey) {
        throw new Error('CERT_ENCRYPTION_KEY não está no .env — não dá pra descriptografar a senha do certificado.');
    }

    const key = Buffer.from(rawKey, 'hex');
    if (key.length !== 32) {
        throw new Error(`CERT_ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres hex) — tem ${key.length}.`);
    }

    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(cipher, 'base64')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

// No padrão ICP-Brasil, o CN de um e-CNPJ vem como "RAZAO SOCIAL:CNPJ"
// (14 dígitos no final, depois dos dois-pontos).
function extrairCnpjDoCn(cn) {
    if (!cn) return null;
    const partes = cn.split(':');
    const ultima = partes[partes.length - 1].replace(/\D/g, '');
    return ultima.length === 14 ? ultima : null;
}

function formatCnpj(digits) {
    if (!digits) return null;
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

async function main() {
    const lojas = await prisma.store.findMany({
        where: { active: true },
        select: {
            id: true,
            name: true,
            cnpj: true,
            certificate: {
                select: {
                    filePath: true,
                    fileName: true,
                    passwordCipher: true,
                    passwordIv: true,
                    passwordAuthTag: true,
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    console.log('\n=== Comparativo: certificado .pfx vs CNPJ cadastrado na loja ===\n');

    for (const loja of lojas) {
        console.log(`— ${loja.name}`);
        console.log(`  CNPJ cadastrado na loja: ${formatCnpj((loja.cnpj || '').replace(/\D/g, '')) || '❌ vazio'}`);

        if (!loja.certificate) {
            console.log('  ❌ SEM certificado digital cadastrado.\n');
            continue;
        }

        const { filePath, fileName, passwordCipher, passwordIv, passwordAuthTag } = loja.certificate;

        if (!existsSync(filePath)) {
            console.log(`  ❌ Arquivo do certificado não encontrado no disco: ${filePath}\n`);
            continue;
        }

        try {
            const passphrase = decryptSecret({
                cipher: passwordCipher,
                iv: passwordIv,
                authTag: passwordAuthTag,
            });

            const pfxBuffer = readFileSync(filePath);
            const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);

            const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
            const bags = certBags[forge.pki.oids.certBag] || [];

            if (bags.length === 0) {
                console.log('  ❌ Não achei nenhum certificado dentro do .pfx (senha errada ou arquivo corrompido?)\n');
                continue;
            }

            // Pega o certificado "folha" (não-CA) — geralmente o primeiro,
            // mas se tiver cadeia completa, pega o que tem chave privada
            // associada (isKey) ou simplesmente o primeiro da lista.
            const certBag = bags[0];
            const cert = certBag.cert;

            const cnAttr = cert.subject.getField('CN');
            const cn = cnAttr ? cnAttr.value : null;
            const cnpjDoCertificado = extrairCnpjDoCn(cn);

            const cnpjLoja = (loja.cnpj || '').replace(/\D/g, '');
            const bate = cnpjDoCertificado && cnpjLoja && cnpjDoCertificado === cnpjLoja;

            console.log(`  Arquivo:                 ${fileName}`);
            console.log(`  CN do certificado:        ${cn || '(não achei CN)'}`);
            console.log(`  CNPJ extraído do cert.:   ${formatCnpj(cnpjDoCertificado) || '❌ não consegui extrair'}`);
            console.log(`  Confere com a loja?       ${bate ? '✅ SIM' : '❌ NÃO — CERTIFICADO É DE OUTRA EMPRESA/FILIAL'}`);
            console.log(`  Válido de:                ${cert.validity.notBefore.toLocaleDateString('pt-BR')}`);
            console.log(`  Válido até:               ${cert.validity.notAfter.toLocaleDateString('pt-BR')}`);

            const hoje = new Date();
            if (cert.validity.notAfter < hoje) {
                console.log('  ⚠️  CERTIFICADO VENCIDO!');
            } else if (cert.validity.notAfter.getTime() - hoje.getTime() < 30 * 24 * 60 * 60 * 1000) {
                console.log('  ⚠️  Vence em menos de 30 dias.');
            }

            console.log('');
        } catch (err) {
            console.log(`  ❌ Erro ao abrir/decifrar o certificado: ${err.message}\n`);
        }
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Erro:', err.message);
    await prisma.$disconnect();
    process.exit(1);
});
