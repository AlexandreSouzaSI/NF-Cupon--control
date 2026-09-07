"""Configuracao central do robo de captura de XML (NFe + NFSe).

Suporta multiplas empresas (CNPJs) na mesma execucao - cada uma pode ter seu
proprio certificado digital (o normal, ja que um certificado e-CNPJ e emitido
para UM CNPJ especifico). A lista de empresas fica em `empresas.json` (fora do
Git - contem caminho e senha de certificado), nao no `.env`.
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PASTA_PROJETO = Path(__file__).resolve().parent

AMBIENTE = (os.getenv("AMBIENTE") or "homologacao").strip().lower()
PASTA_SAIDA = Path(os.getenv("PASTA_SAIDA") or (PASTA_PROJETO / "dados")).resolve()
PASTA_ESTADO = PASTA_SAIDA / "_estado"
CAMINHO_INDICE = PASTA_SAIDA / "_estado" / "indice.sqlite3"

CAMINHO_EMPRESAS_JSON = Path(os.getenv("EMPRESAS_JSON_PATH") or (PASTA_PROJETO / "empresas.json"))

SANKHYA_BASE_URL = os.getenv("SANKHYA_BASE_URL", "https://api.sankhya.com.br")
SANKHYA_CLIENT_ID = os.getenv("SANKHYA_CLIENT_ID")
SANKHYA_CLIENT_SECRET = os.getenv("SANKHYA_CLIENT_SECRET")
SANKHYA_TOKEN = os.getenv("SANKHYA_TOKEN")

# --- Endpoints oficiais (fonte: manual "Manual dos Contribuintes - Sistema
# Nacional NFS-e - Guia para utilizacao das APIs do ADN", v1.0, e Portal
# Nacional da NFe) ---

URLS_ADN_NFSE = {
    "producao": "https://adn.nfse.gov.br/contribuintes",
    "homologacao": "https://adn.producaorestrita.nfse.gov.br/contribuintes",
}

# Distribuicao DFe da NFe (SEFAZ / Ambiente Nacional). Endpoint nacional unico,
# nao depende da UF (a UF entra so como parametro cUFAutor dentro do XML).
URLS_SEFAZ_NFE_DISTRIBUICAO = {
    "producao": "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    "homologacao": "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
}

_CAMPOS_OBRIGATORIOS_EMPRESA = (
    "nome",
    "cnpj",
    "uf_codigo",
    "certificado_pfx_path",
    "certificado_pfx_senha",
)


def carregar_empresas() -> list[dict]:
    """Le `empresas.json` (lista de empresas/CNPJs a capturar). Erro claro se
    o arquivo nao existir ainda ou estiver mal formado - antes de tentar
    conectar em qualquer webservice."""
    if not CAMINHO_EMPRESAS_JSON.is_file():
        raise RuntimeError(
            f"Arquivo de empresas nao encontrado: {CAMINHO_EMPRESAS_JSON}\n"
            "Copie 'empresas.example.json' para 'empresas.json' e preencha os "
            "dados reais de cada CNPJ/certificado."
        )
    try:
        dados = json.loads(CAMINHO_EMPRESAS_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"'{CAMINHO_EMPRESAS_JSON}' nao e um JSON valido: {exc}") from exc

    if not isinstance(dados, list) or not dados:
        raise RuntimeError(f"'{CAMINHO_EMPRESAS_JSON}' deve conter uma lista com pelo menos 1 empresa.")

    return dados


def validar_empresa(empresa: dict) -> list[str]:
    """Devolve a lista de problemas encontrados numa empresa (lista vazia = ok)."""
    problemas = []
    nome = empresa.get("nome") or "(sem nome)"

    for campo in _CAMPOS_OBRIGATORIOS_EMPRESA:
        if not empresa.get(campo):
            problemas.append(f"[{nome}] campo '{campo}' ausente/vazio")

    cnpj = empresa.get("cnpj") or ""
    if cnpj and (len(cnpj) != 14 or not cnpj.isdigit()):
        problemas.append(f"[{nome}] cnpj deve ter 14 digitos, so numeros (recebido: '{cnpj}')")

    caminho_cert = empresa.get("certificado_pfx_path")
    if caminho_cert and not Path(caminho_cert).is_file():
        problemas.append(f"[{nome}] certificado_pfx_path nao encontrado: {caminho_cert}")

    return problemas


def validar_config():
    """Confere .env + empresas.json. Levanta erro claro (com todos os
    problemas de uma vez) em vez de falhar aos poucos no meio da captura."""
    problemas = []
    if AMBIENTE not in ("producao", "homologacao"):
        problemas.append('AMBIENTE (deve ser "producao" ou "homologacao")')

    empresas = carregar_empresas()
    cnpjs_vistos = set()
    for empresa in empresas:
        problemas.extend(validar_empresa(empresa))
        cnpj = empresa.get("cnpj")
        if cnpj and cnpj in cnpjs_vistos:
            problemas.append(f"CNPJ {cnpj} aparece mais de uma vez em empresas.json")
        cnpjs_vistos.add(cnpj)

    if problemas:
        raise RuntimeError(
            "Configuracao incompleta. Corrija antes de continuar:\n- " + "\n- ".join(problemas)
        )

    return empresas
