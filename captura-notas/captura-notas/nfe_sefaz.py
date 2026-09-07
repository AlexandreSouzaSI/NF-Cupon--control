"""Captura de NFe (mercadorias/produtos) via webservice nacional de
Distribuicao DFe da SEFAZ - o mesmo mecanismo usado por qualquer sistema de
manifestacao do destinatario. E um SOAP 1.2, autenticado por certificado
digital e-CNPJ (mTLS), documentado ha varios anos e estavel (schema distDFeInt/
retDistDFeInt, versao 1.35).

Por que usar isto em vez de reaproveitar o Sankhya: confirmamos ao vivo que o
Sankhya guarda a chave de acesso de cada nota (entidade CabecalhoNota, campo
CHAVENFE - ver sankhya_consulta.py), mas a API publica do Sankhya nao documenta
um jeito confiavel de baixar o XML bruto por ela (o unico caminho encontrado,
ImpressaoNotasSP.imprimeDocumentos, e para impressao/DANFE, nao para o XML
autorizado). A Distribuicao DFe e a fonte oficial e ja usa o MESMO certificado
que a captura de NFSe, entao capturamos aqui direto da SEFAZ - e usamos o
Sankhya (sankhya_consulta.py) so como conferencia cruzada (ver README).
"""

import time

from lxml import etree

import armazenamento
import config
import utilitarios_xml
from certificado import criar_sessao

TIPO = "nfe"
MAX_ITERACOES = 5000
_NS_DIST = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"
_NS_NFE = "http://www.portalfiscal.inf.br/nfe"


def _url_base() -> str:
    return config.URLS_SEFAZ_NFE_DISTRIBUICAO[config.AMBIENTE]


def _tp_amb() -> str:
    return "1" if config.AMBIENTE == "producao" else "2"


def _montar_envelope(empresa: dict, ultimo_nsu: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="{_NS_DIST}">
      <cUF>{empresa["uf_codigo"]}</cUF>
      <versaoDados>1.35</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="{_NS_DIST}">
      <nfeDadosMsg>
        <distDFeInt versao="1.35" xmlns="{_NS_NFE}">
          <tpAmb>{_tp_amb()}</tpAmb>
          <cUFAutor>{empresa["uf_codigo"]}</cUFAutor>
          <CNPJ>{empresa["cnpj"]}</CNPJ>
          <distNSU><ultNSU>{int(ultimo_nsu):015d}</ultNSU></distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>"""


def _texto_unico(raiz, tag: str):
    elementos = raiz.xpath(f"//*[local-name()='{tag}']")
    return elementos[0].text.strip() if elementos and elementos[0].text else None


def _extrair_lote(corpo_resposta: bytes):
    """Devolve (ultNSU, maxNSU, [(nsu_doc, xml_bytes), ...]) a partir do envelope
    SOAP de resposta da Distribuicao DFe."""
    raiz = etree.fromstring(corpo_resposta)

    codigo_status = _texto_unico(raiz, "cStat")
    if codigo_status and codigo_status not in ("137", "138"):
        # 137 = nenhum documento localizado; 138 = documento(s) localizado(s).
        # Qualquer outro codigo indica erro/rejeicao - ver motivo (xMotivo).
        motivo = _texto_unico(raiz, "xMotivo") or "sem motivo informado"
        raise RuntimeError(f"SEFAZ rejeitou a consulta (cStat={codigo_status}): {motivo}")

    ult_nsu = _texto_unico(raiz, "ultNSU")
    max_nsu = _texto_unico(raiz, "maxNSU")

    documentos = []
    for doc_zip in raiz.xpath("//*[local-name()='docZip']"):
        nsu_doc = doc_zip.get("NSU")
        if not doc_zip.text:
            continue
        xml_bytes = utilitarios_xml.descompactar_se_for_xml(doc_zip.text.strip())
        if xml_bytes:
            documentos.append((nsu_doc, xml_bytes))

    return ult_nsu, max_nsu, documentos


def capturar_novas(empresa: dict, sessao=None) -> int:
    """Consulta a Distribuicao DFe a partir do ultimo NSU salvo da `empresa`,
    avancando ate alcancar o maxNSU informado pela SEFAZ. Devolve quantas notas
    novas foram salvas (o docZip pode trazer NFe emitida por terceiros contra o
    nosso CNPJ, resumos de eventos, etc. - so gravamos o XML da propria
    NFe/procNFe; outros tipos de documento sao ignorados silenciosamente aqui)."""
    cnpj = empresa["cnpj"]
    sessao = sessao or criar_sessao(empresa)
    nsu_atual = armazenamento.ultimo_nsu(cnpj, TIPO)
    total_salvas = 0
    headers = {"Content-Type": "application/soap+xml; charset=utf-8"}

    for _ in range(MAX_ITERACOES):
        envelope = _montar_envelope(empresa, nsu_atual)
        resp = sessao.post(_url_base(), data=envelope.encode("utf-8"), headers=headers, timeout=60)

        if resp.status_code == 403:
            raise RuntimeError(
                f"SEFAZ recusou a conexao (403) na Distribuicao DFe para "
                f"'{empresa.get('nome')}'. Confira se o certificado e valido para "
                f"o CNPJ {cnpj} e se uf_codigo ({empresa['uf_codigo']}) esta correto."
            )
        resp.raise_for_status()

        utilitarios_xml.registrar_resposta_para_depuracao(
            f"ultima_resposta_nfe_{cnpj}_nsu_{nsu_atual}.xml", resp.text
        )

        ult_nsu, max_nsu, documentos = _extrair_lote(resp.content)

        for nsu_doc, xml_bytes in documentos:
            chave = utilitarios_xml.extrair_chave_acesso(xml_bytes)
            if armazenamento.ja_capturada(cnpj, TIPO, chave):
                continue
            data_emissao = utilitarios_xml.extrair_data_emissao(xml_bytes)
            armazenamento.salvar_xml(cnpj, TIPO, chave, xml_bytes, data_emissao, nsu_doc or nsu_atual)
            total_salvas += 1

        if not ult_nsu or ult_nsu == nsu_atual:
            break

        nsu_atual = ult_nsu
        armazenamento.salvar_ultimo_nsu(cnpj, TIPO, nsu_atual)

        if max_nsu and int(ult_nsu) >= int(max_nsu):
            break

        time.sleep(0.5)  # a SEFAZ limita a frequencia de consultas por certificado
    else:
        raise RuntimeError(
            f"Captura de NFe de '{empresa.get('nome')}' atingiu o limite de "
            f"seguranca de {MAX_ITERACOES} iteracoes sem terminar. Rode de novo "
            "(o progresso ja foi salvo)."
        )

    return total_salvas
