"""Captura de NFSe via ADN (Ambiente de Dados Nacional) - Sistema Nacional NFS-e.

Fonte oficial: "Manual dos Contribuintes - Sistema Nacional NFS-e - Guia para
utilizacao das APIs do ADN" (gov.br/nfse, v1.0, fev/2026):
  GET /DFe/{NSU} - retorna o(s) documento(s) fiscal(is) de servico a partir do
  NSU informado (Numero Sequencial Unico), autenticado por certificado digital
  e-CNPJ (mTLS) cujo CNPJ (ou CNPJ raiz) seja o mesmo do contribuinte consultado.

O NSU e sequencial e cumulativo POR CNPJ: comecando do "0" (ou do ultimo NSU
salvo para aquele CNPJ), cada chamada avanca para o proximo lote ate a resposta
vir vazia (sem novos documentos) - nesse ponto ja capturamos tudo que existia
ate agora para aquela empresa.
"""

import time

import armazenamento
import config
import utilitarios_xml
from certificado import criar_sessao

TIPO = "nfse"
MAX_ITERACOES = 5000  # trava de seguranca (mesmo espirito do MAX_PAGINAS do conector Sankhya)


def _url_base() -> str:
    return config.URLS_ADN_NFSE[config.AMBIENTE]


def capturar_novas(empresa: dict, sessao=None) -> int:
    """Busca todos os DF-e novos (NSU maior que o ultimo salvo) da `empresa` e
    grava cada um como XML organizado por cnpj/ano/mes. Devolve quantas notas
    novas foram salvas."""
    cnpj = empresa["cnpj"]
    sessao = sessao or criar_sessao(empresa)
    nsu_atual = armazenamento.ultimo_nsu(cnpj, TIPO)
    total_salvas = 0

    for _ in range(MAX_ITERACOES):
        url = f"{_url_base()}/DFe/{nsu_atual}"
        resp = sessao.get(url, headers={"Accept": "application/json"}, timeout=60)

        if resp.status_code == 403:
            raise RuntimeError(
                f"ADN recusou a conexao (403) para '{empresa.get('nome')}'. Causas mais "
                "comuns: certificado invalido/expirado, CNPJ do certificado nao "
                "corresponde ao cnpj configurado em empresas.json, ou cadeia de "
                f"certificacao incompleta. Resposta: {resp.text[:500]}"
            )
        resp.raise_for_status()

        corpo = resp.json() if resp.content else {}
        utilitarios_xml.registrar_resposta_para_depuracao(
            f"ultima_resposta_nfse_{cnpj}_nsu_{nsu_atual}.json", corpo
        )

        documentos = utilitarios_xml.extrair_documentos_da_resposta(corpo)
        if not documentos:
            break

        proximo_nsu = utilitarios_xml._extrair_nsu_proximo(corpo) or nsu_atual
        for nsu_doc, xml_bytes in documentos:
            chave = utilitarios_xml.extrair_chave_acesso(xml_bytes)
            if armazenamento.ja_capturada(cnpj, TIPO, chave):
                continue
            data_emissao = utilitarios_xml.extrair_data_emissao(xml_bytes)
            armazenamento.salvar_xml(cnpj, TIPO, chave, xml_bytes, data_emissao, nsu_doc or nsu_atual)
            total_salvas += 1

        if proximo_nsu == nsu_atual:
            # resposta trouxe documentos mas nao avancou o NSU - evita loop infinito.
            break

        nsu_atual = proximo_nsu
        armazenamento.salvar_ultimo_nsu(cnpj, TIPO, nsu_atual)
        time.sleep(0.2)  # nao martelar o webservice nacional
    else:
        raise RuntimeError(
            f"Captura de NFSe de '{empresa.get('nome')}' atingiu o limite de "
            f"seguranca de {MAX_ITERACOES} iteracoes sem terminar. Rode de novo "
            "(o progresso ja foi salvo)."
        )

    return total_salvas
