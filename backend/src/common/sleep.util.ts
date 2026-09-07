// Pausa simples entre chamadas a webservices externos que têm limite de
// frequência (Sefaz, ADN). Usado especificamente nos loops de sincronização
// de NF-e/NFS-e — ver purchases.service.ts e services.service.ts.
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
