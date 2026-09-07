"""Ponto de entrada do robo: captura NFe (SEFAZ) + NFSe (ADN) para cada
empresa listada em empresas.json, e mostra um resumo. Pensado para ser chamado
direto (`python capturar.py`) ou por uma tarefa agendada do Windows / cron.
"""

import sys
from datetime import datetime

import armazenamento
import config
import nfe_sefaz
import nfse_adn
from certificado import criar_sessao


def _capturar_empresa(empresa: dict) -> None:
    nome = empresa.get("nome", empresa.get("cnpj"))
    cnpj = empresa["cnpj"]
    print(f"\n--- {nome} (CNPJ {cnpj}) ---")
    sessao = criar_sessao(empresa)

    try:
        novas_nfe = nfe_sefaz.capturar_novas(empresa, sessao)
        print(f"NFe: {novas_nfe} nota(s) nova(s). Total no indice: {armazenamento.contar_capturadas(cnpj, 'nfe')}.")
    except Exception as exc:
        print(f"ERRO na captura de NFe de '{nome}': {exc}", file=sys.stderr)

    try:
        novas_nfse = nfse_adn.capturar_novas(empresa, sessao)
        print(f"NFSe: {novas_nfse} nota(s) nova(s). Total no indice: {armazenamento.contar_capturadas(cnpj, 'nfse')}.")
    except Exception as exc:
        print(f"ERRO na captura de NFSe de '{nome}': {exc}", file=sys.stderr)


def main():
    print(f"[{datetime.now().isoformat(timespec='seconds')}] Iniciando captura (ambiente={config.AMBIENTE})")

    try:
        empresas = config.validar_config()
    except RuntimeError as exc:
        print(f"ERRO DE CONFIGURACAO: {exc}", file=sys.stderr)
        sys.exit(1)

    for empresa in empresas:
        _capturar_empresa(empresa)

    print(f"\nXMLs organizados em: {config.PASTA_SAIDA}\\<cnpj>\\<ano>\\<mes>\\<nfe|nfse>")


if __name__ == "__main__":
    main()
