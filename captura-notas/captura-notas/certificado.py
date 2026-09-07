"""Sessao HTTP autenticada por certificado digital A1 (.pfx) de UMA empresa,
usada tanto na consulta ao ADN (NFSe Nacional, REST) quanto na Distribuicao DFe
da NFe (SEFAZ, SOAP) - os dois exigem mTLS (o certificado identifica a empresa,
nao ha usuario/senha separado)."""

from requests_pkcs12 import Pkcs12Adapter
import requests


def criar_sessao(empresa: dict) -> requests.Session:
    """Cria uma requests.Session que apresenta o certificado .pfx da `empresa`
    em toda chamada HTTPS (mTLS). Falha cedo e com mensagem clara se o .pfx ou
    a senha estiverem errados, em vez de um erro SSL generico no meio da
    captura. `empresa` e um dict vindo de empresas.json (chaves
    certificado_pfx_path / certificado_pfx_senha / nome)."""
    sessao = requests.Session()
    try:
        adaptador = Pkcs12Adapter(
            pkcs12_filename=empresa["certificado_pfx_path"],
            pkcs12_password=empresa["certificado_pfx_senha"],
        )
    except Exception as exc:
        raise RuntimeError(
            f"Nao foi possivel carregar o certificado de '{empresa.get('nome')}' "
            f"({empresa.get('certificado_pfx_path')}). Confira o caminho e a senha "
            f"em empresas.json. Erro original: {exc}"
        ) from exc

    sessao.mount("https://", adaptador)
    return sessao
