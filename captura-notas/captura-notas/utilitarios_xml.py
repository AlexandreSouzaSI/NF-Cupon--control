"""Funcoes compartilhadas para lidar com o formato de resposta dos ambientes
nacionais (ADN/NFSe e SEFAZ/NFe): os documentos vem compactados (GZip) e
codificados em Base64 dentro de uma estrutura JSON ou XML/SOAP.

Por que a extracao e "genérica" (varre a arvore em vez de usar nomes de campo
fixos): a documentacao publica do ADN (manual oficial de fev/2026) descreve os
metodos e a regra de compactacao, mas nao publica o schema JSON campo-a-campo.
Em vez de arriscar nomes de campo adivinhados contra producao, procuramos por
qualquer valor que, decodificado de Base64 e descompactado com GZip, resulte em
XML valido - isso e robusto ao nome exato do campo E serve como validacao (um
valor que nao for um GZip valido nunca vira "documento" por engano).

IMPORTANTE: antes de rodar contra producao de verdade, rode primeiro contra o
ambiente de homologacao/producao restrita (AMBIENTE=homologacao no .env) e
confira o arquivo de log gerado em dados/_estado/ultima_resposta_*.json - se um
dia o layout da resposta mudar, a extracao aqui e o primeiro lugar a revisar.
"""

import base64
import gzip
import hashlib
import json
from pathlib import Path

from lxml import etree

import config

_TAGS_CHAVE = ("chNFe", "chNFSe", "chaveAcesso", "chDFe")
_ATRIBUTOS_ID_EM = ("infNFe", "infNFSe", "NFSe", "infDPS")

_CANDIDATOS_NSU = ("nsu", "NSU", "numeroNsu", "nroNsu", "sequencial")


def descompactar_se_for_xml(valor: str) -> bytes | None:
    """Tenta tratar `valor` como Base64(GZip(xml)). Devolve os bytes do XML se
    der certo, ou None se `valor` nao for isso (string comum, outro campo etc.)."""
    if not isinstance(valor, str) or len(valor) < 20:
        return None
    try:
        bruto = base64.b64decode(valor, validate=True)
    except Exception:
        return None
    try:
        xml_bytes = gzip.decompress(bruto)
    except Exception:
        # alguns retornos podem vir so em Base64, sem GZip - aceita se parecer XML.
        xml_bytes = bruto
    amostra = xml_bytes.lstrip()[:80].lower()
    if amostra.startswith(b"<?xml") or amostra.startswith(b"<"):
        return xml_bytes
    return None


def _extrair_nsu_proximo(obj, chave_pai: str | None = None):
    if isinstance(obj, dict):
        for candidato in _CANDIDATOS_NSU:
            if candidato in obj and isinstance(obj[candidato], (str, int)):
                return str(obj[candidato])
        for v in obj.values():
            achado = _extrair_nsu_proximo(v)
            if achado:
                return achado
    elif isinstance(obj, list):
        for item in obj:
            achado = _extrair_nsu_proximo(item)
            if achado:
                return achado
    return None


def extrair_documentos_da_resposta(resposta_json) -> list[tuple[str | None, bytes]]:
    """Varre recursivamente o JSON de resposta do ADN procurando documentos
    (XML compactado). Devolve lista de (nsu_do_documento, xml_bytes).

    O NSU de cada documento e procurado no MESMO dict que contem o campo com o
    XML (irmao dele), para associar corretamente nsu <-> documento quando a
    resposta trouxer varios."""
    encontrados = []

    def _varrer(obj):
        if isinstance(obj, dict):
            nsu_deste_nivel = None
            for candidato in _CANDIDATOS_NSU:
                if candidato in obj and isinstance(obj[candidato], (str, int)):
                    nsu_deste_nivel = str(obj[candidato])
                    break
            for v in obj.values():
                if isinstance(v, str):
                    xml_bytes = descompactar_se_for_xml(v)
                    if xml_bytes is not None:
                        encontrados.append((nsu_deste_nivel, xml_bytes))
                else:
                    _varrer(v)
        elif isinstance(obj, list):
            for item in obj:
                _varrer(item)

    _varrer(resposta_json)
    return encontrados


def extrair_chave_acesso(xml_bytes: bytes) -> str:
    """Extrai a chave de acesso do XML (NFe: 44 digitos; NFSe nacional: formato
    proprio). Procura primeiro por tags conhecidas (<chNFe>/<chNFSe>/...) e
    depois pelo atributo Id do elemento raiz de identificacao (padrao usado
    tanto pela NFe quanto pela NFS-e nacional: Id="NFe44digitos" ou similar).

    Se nada for encontrado (layout inesperado), usa um hash do conteudo como
    identificador - o arquivo ainda e salvo (nunca descartamos uma nota so
    porque nao achamos a chave), mas com um prefixo que sinaliza revisao manual."""
    try:
        raiz = etree.fromstring(xml_bytes)
    except Exception:
        return f"SEMCHAVE-{hashlib.sha1(xml_bytes).hexdigest()}"

    for tag in _TAGS_CHAVE:
        elementos = raiz.xpath(f"//*[local-name()='{tag}']")
        if elementos and elementos[0].text:
            return elementos[0].text.strip()

    for nome_elemento in _ATRIBUTOS_ID_EM:
        elementos = raiz.xpath(f"//*[local-name()='{nome_elemento}']")
        for el in elementos:
            id_attr = el.get("Id") or el.get("id")
            if id_attr:
                id_attr = id_attr.strip()
                # remove prefixo comum tipo "NFe"/"NFSe" antes da chave em si.
                for prefixo in ("NFSe", "NFe"):
                    if id_attr.startswith(prefixo):
                        return id_attr[len(prefixo):]
                return id_attr

    return f"SEMCHAVE-{hashlib.sha1(xml_bytes).hexdigest()}"


_TAGS_DATA_EMISSAO = ("dhEmi", "dEmi", "dhProc", "dCompet", "dhCompet", "DataEmissao")


def extrair_data_emissao(xml_bytes: bytes):
    """Tenta achar a data de emissao no XML (formatos ISO 8601, ex.:
    2026-08-27T10:00:00-03:00 ou 2026-08-27). Devolve None se nao encontrar -
    quem chamar deve tratar isso caindo na data de hoje."""
    from datetime import date

    try:
        raiz = etree.fromstring(xml_bytes)
    except Exception:
        return None

    for tag in _TAGS_DATA_EMISSAO:
        elementos = raiz.xpath(f"//*[local-name()='{tag}']")
        if elementos and elementos[0].text:
            texto = elementos[0].text.strip()[:10]
            try:
                return date.fromisoformat(texto)
            except ValueError:
                continue
    return None


def registrar_resposta_para_depuracao(nome_arquivo: str, conteudo) -> None:
    """Salva a ultima resposta bruta recebida (JSON) em disco, para permitir
    conferir/ajustar a extracao acima caso o layout real divirja do esperado."""
    config.PASTA_ESTADO.mkdir(parents=True, exist_ok=True)
    caminho = config.PASTA_ESTADO / nome_arquivo
    try:
        if isinstance(conteudo, (dict, list)):
            caminho.write_text(json.dumps(conteudo, ensure_ascii=False, indent=2), encoding="utf-8")
        else:
            caminho.write_text(str(conteudo), encoding="utf-8")
    except Exception:
        pass
