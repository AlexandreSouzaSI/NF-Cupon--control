"""Conferencia cruzada (opcional): lista as chaves de acesso de NFe que o
Sankhya conhece (entidade CabecalhoNota), para comparar com o que este robo
capturou da SEFAZ e apontar divergencias (nota que o Sankhya tem mas o robo
nao capturou, ou vice-versa).

Campos confirmados ao vivo em 27/08/2026 (consulta com filtro que nao retorna
nenhuma linha real, so para validar que os nomes de campo existem):
CabecalhoNota.NUNOTA, NUMNOTA, STATUSNFE, CHAVENFE, TIPMOV, CODEMP, CODPARC,
DTNEG. NAO confirmamos um jeito de baixar o XML bruto por esta API (por isso a
captura de verdade usa nfe_sefaz.py, direto na SEFAZ) - isto aqui e so para
conferencia.
"""

import requests

import config

ENTIDADE_NOTA = "CabecalhoNota"
CAMPOS_NOTA = ["NUNOTA", "NUMNOTA", "STATUSNFE", "CHAVENFE", "TIPMOV", "CODEMP", "CODPARC", "DTNEG"]

_token_cache = {"token": None}


def _autenticar() -> str:
    if _token_cache["token"]:
        return _token_cache["token"]
    resp = requests.post(
        f"{config.SANKHYA_BASE_URL}/authenticate",
        headers={"X-Token": config.SANKHYA_TOKEN},
        data={
            "client_id": config.SANKHYA_CLIENT_ID,
            "client_secret": config.SANKHYA_CLIENT_SECRET,
            "grant_type": "client_credentials",
        },
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    token = body.get("access_token") or body.get("bearerToken") or body.get("token")
    if not token:
        raise RuntimeError(f"Nao encontrei o token na resposta de autenticacao: {body}")
    _token_cache["token"] = token
    return token


def _parse_registros(body, campos):
    try:
        registros = body["responseBody"]["entities"]["entity"]
    except (KeyError, TypeError):
        return []
    if registros is None:
        return []
    if isinstance(registros, dict):
        registros = [registros]
    resultado = []
    for reg in registros:
        item = {campo: (reg.get(f"f{i}") or {}).get("$") for i, campo in enumerate(campos)}
        resultado.append(item)
    return resultado


def listar_chaves_nfe(expressao_sql: str = "CHAVENFE IS NOT NULL", max_paginas: int = 50) -> list[dict]:
    """Busca notas com chave de acesso preenchida, paginando ate a API devolver
    pagina vazia. Use `expressao_sql` para restringir por periodo/empresa, ex.:
    "CHAVENFE IS NOT NULL AND DTNEG >= '01/08/2026'"."""
    token = _autenticar()
    todos = []
    offset = 0
    while offset < max_paginas:
        resp = requests.post(
            f"{config.SANKHYA_BASE_URL}/gateway/v1/mge/service.sbr"
            "?serviceName=CRUDServiceProvider.loadRecords&outputType=json",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "serviceName": "CRUDServiceProvider.loadRecords",
                "requestBody": {
                    "dataSet": {
                        "rootEntity": ENTIDADE_NOTA,
                        "ignoreCalculatedFields": "true",
                        "useFileBasedPagination": "false",
                        "offsetPage": str(offset),
                        "criteria": {"expression": {"$": expressao_sql}, "parameter": []},
                        "entity": [{"path": "", "fieldset": {"list": ", ".join(CAMPOS_NOTA)}}],
                    }
                },
            },
            timeout=60,
        )
        if resp.status_code in (401, 403):
            _token_cache["token"] = None
            token = _autenticar()
            continue
        resp.raise_for_status()
        body = resp.json()
        if body.get("status") != "1":
            raise RuntimeError(f"Sankhya retornou erro: {body.get('statusMessage', body)}")
        pagina = _parse_registros(body, CAMPOS_NOTA)
        if not pagina:
            break
        todos.extend(pagina)
        offset += 1
    return todos
