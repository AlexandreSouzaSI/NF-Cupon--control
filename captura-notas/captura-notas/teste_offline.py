"""Teste de fumaca 100% offline: nao chama SEFAZ nem ADN, nao precisa de
certificado nem de .env/empresas.json preenchidos. Simula as respostas (SOAP
da SEFAZ e JSON do ADN) para DUAS empresas e verifica que:

  1. a extracao de XML (GZip+Base64), chave de acesso e data de emissao
     funcionam corretamente;
  2. o loop de avanco por NSU avanca, para na hora certa e e idempotente
     (rodar duas vezes nao duplica nem repete trabalho);
  3. os arquivos acabam organizados em dados/<cnpj>/<ano>/<mes>/<tipo>/<chave>.xml
     e registrados no indice;
  4. duas empresas diferentes nao se misturam (cada uma tem seu proprio NSU e
     sua propria pasta, mesmo compartilhando o mesmo indice SQLite).

Rode com: python teste_offline.py
"""

import base64
import gzip
import shutil
import tempfile
from pathlib import Path

import config

# --- isola este teste da pasta "dados" de verdade: redireciona a config para
# uma pasta temporaria ANTES de importar os modulos que a usam em runtime. ---
_PASTA_TEMP = Path(tempfile.mkdtemp(prefix="teste_captura_notas_"))
config.PASTA_SAIDA = _PASTA_TEMP
config.PASTA_ESTADO = _PASTA_TEMP / "_estado"
config.CAMINHO_INDICE = _PASTA_TEMP / "_estado" / "indice.sqlite3"
config.AMBIENTE = "homologacao"

import armazenamento  # noqa: E402  (import depois do monkeypatch de config, de proposito)
import nfe_sefaz  # noqa: E402
import nfse_adn  # noqa: E402
import utilitarios_xml  # noqa: E402

EMPRESA_A = {"nome": "Empresa A", "cnpj": "11111111000191", "uf_codigo": "31"}
EMPRESA_B = {"nome": "Empresa B", "cnpj": "22222222000272", "uf_codigo": "35"}

_falhas = []


def checar(descricao, condicao):
    if condicao:
        print(f"  OK - {descricao}")
    else:
        print(f"  FALHOU - {descricao}")
        _falhas.append(descricao)


def _gzip_b64(texto: str) -> str:
    return base64.b64encode(gzip.compress(texto.encode("utf-8"))).decode()


def _nfe_xml_fake(chave: str, data_emissao: str) -> str:
    return (
        f'<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">'
        f'<NFe><infNFe Id="NFe{chave}"><ide><dhEmi>{data_emissao}T10:00:00-03:00</dhEmi></ide></infNFe></NFe>'
        f"</nfeProc>"
    )


def _nfse_xml_fake(chave: str, data_emissao: str) -> str:
    return (
        f'<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">'
        f"<infNFSe><chNFSe>{chave}</chNFSe><dhEmi>{data_emissao}T09:30:00-03:00</dhEmi></infNFSe>"
        f"</NFSe>"
    )


class FakeResponse:
    def __init__(self, *, status_code=200, json_body=None, text_body=""):
        self.status_code = status_code
        self._json_body = json_body
        self.text = text_body
        self.content = text_body.encode("utf-8") if text_body else (b"{}" if json_body is not None else b"")

    def json(self):
        return self._json_body

    def raise_for_status(self):
        pass


class FakeSessaoADN:
    """Simula o GET /DFe/{NSU} do ADN: primeiro NSU tem 1 documento e aponta
    para o proximo NSU; a partir dali, vem vazio (fim da fila)."""

    def __init__(self, respostas_por_nsu):
        self._respostas = respostas_por_nsu
        self.chamadas = []

    def get(self, url, headers=None, timeout=None):
        nsu_pedido = url.rsplit("/", 1)[-1]
        self.chamadas.append(nsu_pedido)
        corpo = self._respostas.get(nsu_pedido, {"nsu": nsu_pedido, "documentos": []})
        return FakeResponse(json_body=corpo)


class FakeSessaoSEFAZ:
    """Simula o POST da Distribuicao DFe: le o <ultNSU> do envelope enviado
    para decidir qual resposta canonica devolver."""

    def __init__(self, respostas_por_nsu):
        self._respostas = respostas_por_nsu
        self.chamadas = []

    def post(self, url, data=None, headers=None, timeout=None):
        envelope = data.decode("utf-8") if isinstance(data, bytes) else data
        ult_nsu_pedido = envelope.split("<ultNSU>")[1].split("</ultNSU>")[0]
        self.chamadas.append(ult_nsu_pedido)
        return FakeResponse(text_body=self._respostas[ult_nsu_pedido])


def _soap_resposta(cstat, xmotivo, ult_nsu, max_nsu, doc_zip_nsu=None, xml_doc=None):
    doc_zip_xml = ""
    if doc_zip_nsu is not None:
        doc_zip_xml = f'<docZip NSU="{doc_zip_nsu}" schema="procNFe_v4.00.xsd">{_gzip_b64(xml_doc)}</docZip>'
    return f"""<?xml version="1.0"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDistDFeInteresseResult>
        <retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.35">
          <cStat>{cstat}</cStat>
          <xMotivo>{xmotivo}</xMotivo>
          <ultNSU>{ult_nsu}</ultNSU>
          <maxNSU>{max_nsu}</maxNSU>
          <loteDistDFeInt>{doc_zip_xml}</loteDistDFeInt>
        </retDistDFeInt>
      </nfeDistDFeInteresseResult>
    </nfeDistDFeInteresseResponse>
  </soap12:Body>
</soap12:Envelope>"""


print("1) Extracao de GZip+Base64, chave de acesso e data de emissao")
chave_nfe_a = "35260811111111000191550010000000011234567890"
xml_nfe_a = _nfe_xml_fake(chave_nfe_a, "2026-08-15")
xml_bytes_a = xml_nfe_a.encode("utf-8")
checar("descompactar_se_for_xml decodifica corretamente", utilitarios_xml.descompactar_se_for_xml(_gzip_b64(xml_nfe_a)) == xml_bytes_a)
checar("descompactar_se_for_xml rejeita lixo (nao e base64/gzip/xml)", utilitarios_xml.descompactar_se_for_xml("isso nao e nada disso") is None)
checar("extrair_chave_acesso encontra a chave via atributo Id", utilitarios_xml.extrair_chave_acesso(xml_bytes_a) == chave_nfe_a)
checar("extrair_data_emissao encontra dhEmi", str(utilitarios_xml.extrair_data_emissao(xml_bytes_a)) == "2026-08-15")

chave_nfse_a = "SP31260811111100019100000000000000001"
xml_nfse_bytes_a = _nfse_xml_fake(chave_nfse_a, "2026-08-20").encode("utf-8")
checar("extrair_chave_acesso encontra a chave via tag <chNFSe>", utilitarios_xml.extrair_chave_acesso(xml_nfse_bytes_a) == chave_nfse_a)

print("\n2) Captura de NFSe (ADN) simulada de ponta a ponta - Empresa A")
resp_nsu_0_a = {"nsu": "5", "documentos": [{"arquivo": _gzip_b64(_nfse_xml_fake(chave_nfse_a, "2026-08-20"))}]}
sessao_adn_a = FakeSessaoADN({"0": resp_nsu_0_a})
novas = nfse_adn.capturar_novas(EMPRESA_A, sessao_adn_a)
checar("primeira rodada capturou exatamente 1 NFSe nova", novas == 1)
checar("chamou a API comecando do NSU salvo (0) e avancou para o NSU novo (5)", sessao_adn_a.chamadas == ["0", "5"])
checar("ultimo_nsu da empresa A foi atualizado para 5", armazenamento.ultimo_nsu(EMPRESA_A["cnpj"], "nfse") == "5")

sessao_adn_a2 = FakeSessaoADN({"0": resp_nsu_0_a})  # mesmos dados, mas agora deve continuar do 5, nao do 0
novas_repeticao = nfse_adn.capturar_novas(EMPRESA_A, sessao_adn_a2)
checar("segunda rodada e idempotente (0 notas novas, nao duplica)", novas_repeticao == 0)
checar("na segunda rodada comecou do NSU 5 salvo, nao do 0", sessao_adn_a2.chamadas == ["5"])

print("\n3) Captura de NFe (SEFAZ) simulada de ponta a ponta - Empresa A")
respostas_sefaz_a = {
    "000000000000000": _soap_resposta(
        "138", "Documento(s) localizado(s)", "000000000000007", "000000000000007",
        doc_zip_nsu="000000000000007", xml_doc=xml_nfe_a,
    ),
    "000000000000007": _soap_resposta("137", "Nenhum documento localizado", "000000000000007", "000000000000007"),
}
sessao_sefaz_a = FakeSessaoSEFAZ(respostas_sefaz_a)
novas_nfe = nfe_sefaz.capturar_novas(EMPRESA_A, sessao_sefaz_a)
checar("capturou exatamente 1 NFe nova", novas_nfe == 1)
checar("parou de consultar ao alcancar maxNSU (nao ficou martelando)", len(sessao_sefaz_a.chamadas) == 1)
checar("ultimo_nsu de NFe da empresa A foi salvo", armazenamento.ultimo_nsu(EMPRESA_A["cnpj"], "nfe") == "000000000000007")

print("\n4) Segunda empresa (CNPJ diferente) nao pode se misturar com a primeira")
chave_nfe_b = "35260822222222000272550010000000019876543"
xml_nfe_b = _nfe_xml_fake(chave_nfe_b, "2026-08-16")
respostas_sefaz_b = {
    "000000000000000": _soap_resposta(
        "138", "Documento(s) localizado(s)", "000000000000003", "000000000000003",
        doc_zip_nsu="000000000000003", xml_doc=xml_nfe_b,
    ),
}
sessao_sefaz_b = FakeSessaoSEFAZ(respostas_sefaz_b)
novas_nfe_b = nfe_sefaz.capturar_novas(EMPRESA_B, sessao_sefaz_b)
checar("empresa B comecou do proprio NSU 0, nao herdou o NSU 7 da empresa A", sessao_sefaz_b.chamadas == ["000000000000000"])
checar("capturou a NFe da empresa B", novas_nfe_b == 1)
checar("ultimo_nsu da empresa A continua intacto (nao foi sobrescrito pela B)", armazenamento.ultimo_nsu(EMPRESA_A["cnpj"], "nfe") == "000000000000007")
checar("indice conta 1 NFe para a empresa A", armazenamento.contar_capturadas(EMPRESA_A["cnpj"], "nfe") == 1)
checar("indice conta 1 NFe para a empresa B (separado da A)", armazenamento.contar_capturadas(EMPRESA_B["cnpj"], "nfe") == 1)

print("\n5) Organizacao final em disco (uma pasta por CNPJ)")
caminho_nfe_a = _PASTA_TEMP / EMPRESA_A["cnpj"] / "2026" / "08" / "nfe" / f"{chave_nfe_a}.xml"
caminho_nfse_a = _PASTA_TEMP / EMPRESA_A["cnpj"] / "2026" / "08" / "nfse" / f"{chave_nfse_a}.xml"
caminho_nfe_b = _PASTA_TEMP / EMPRESA_B["cnpj"] / "2026" / "08" / "nfe" / f"{chave_nfe_b}.xml"
checar(f"XML da NFe (empresa A) foi salvo em {caminho_nfe_a.relative_to(_PASTA_TEMP)}", caminho_nfe_a.is_file())
checar(f"XML da NFSe (empresa A) foi salvo em {caminho_nfse_a.relative_to(_PASTA_TEMP)}", caminho_nfse_a.is_file())
checar(f"XML da NFe (empresa B) foi salvo em pasta separada: {caminho_nfe_b.relative_to(_PASTA_TEMP)}", caminho_nfe_b.is_file())
checar("ja_capturada reconhece a NFe da empresa A pela chave", armazenamento.ja_capturada(EMPRESA_A["cnpj"], "nfe", chave_nfe_a))
checar("ja_capturada NAO confunde a chave da empresa B com a da A", not armazenamento.ja_capturada(EMPRESA_A["cnpj"], "nfe", chave_nfe_b))

shutil.rmtree(_PASTA_TEMP, ignore_errors=True)

print("\n" + "=" * 60)
if _falhas:
    print(f"RESULTADO: {len(_falhas)} verificacao(oes) FALHOU/FALHARAM:")
    for f in _falhas:
        print(f"  - {f}")
    raise SystemExit(1)
else:
    print("RESULTADO: todas as verificacoes passaram. A logica de extracao,")
    print("avanco por NSU, isolamento entre empresas e organizacao em pastas")
    print("esta funcionando. Falta apenas testar contra a SEFAZ/ADN de verdade,")
    print("com o certificado de cada empresa.")
