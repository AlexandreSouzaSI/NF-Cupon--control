import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from 'crypto';

// A senha do certificado digital nunca é gravada em texto puro. Usamos
// AES-256-GCM com uma chave fixa vinda do .env (CERT_ENCRYPTION_KEY) — o
// mesmo padrão de "segredo no .env" já usado pro JWT_SECRET nesse projeto.
function getKey(): Buffer {
    const raw = process.env.CERT_ENCRYPTION_KEY;

    if (!raw) {
        throw new Error(
            'CERT_ENCRYPTION_KEY não foi definida no arquivo .env. ' +
            'Gere uma chave com "openssl rand -hex 32" e adicione ao .env.',
        );
    }

    const key = Buffer.from(raw, 'hex');

    if (key.length !== 32) {
        throw new Error(
            'CERT_ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres em hexadecimal).',
        );
    }

    return key;
}

export type EncryptedSecret = {
    cipher: string;
    iv: string;
    authTag: string;
};

export function encryptSecret(plainText: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv);

    const encrypted = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final(),
    ]);

    return {
        cipher: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
    };
}

export function decryptSecret(secret: EncryptedSecret): string {
    const decipher = createDecipheriv(
        'aes-256-gcm',
        getKey(),
        Buffer.from(secret.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(secret.cipher, 'base64')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}
