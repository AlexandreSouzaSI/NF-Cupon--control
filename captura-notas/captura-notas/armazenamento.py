"""Organizacao em pasta + indice das notas capturadas, para uma ou mais
empresas (CNPJs).

Layout de pastas: PASTA_SAIDA/<cnpj>/<ano>/<mes>/<nfe|nfse>/<chave_de_acesso>.xml

O indice (SQLite, compartilhado entre empresas) evita gravar a mesma nota duas
vezes quando o robo roda de novo (idempotente) e guarda o "ultimo NSU
processado" de cada empresa+fonte, para que a proxima execucao continue de
onde parou em vez de reprocessar tudo. NSU e uma sequencia por CNPJ - por isso
sempre aparece junto com o cnpj nas chaves primarias abaixo.
"""

import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

import config

_SQL_CRIA_TABELAS = """
CREATE TABLE IF NOT EXISTS notas (
    cnpj TEXT NOT NULL,
    tipo TEXT NOT NULL,               -- 'nfe' ou 'nfse'
    chave TEXT NOT NULL,              -- chave de acesso (44 digitos na NFe; NFSe nacional tem o proprio padrao)
    nsu TEXT,                         -- NSU em que a nota foi recebida na distribuicao (auditoria)
    caminho_arquivo TEXT NOT NULL,
    capturado_em TEXT NOT NULL,
    PRIMARY KEY (cnpj, tipo, chave)
);

CREATE TABLE IF NOT EXISTS estado_nsu (
    cnpj TEXT NOT NULL,
    tipo TEXT NOT NULL,               -- 'nfe' ou 'nfse'
    ultimo_nsu TEXT NOT NULL,
    PRIMARY KEY (cnpj, tipo)
);
"""


@contextmanager
def _conexao():
    config.PASTA_ESTADO.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.CAMINHO_INDICE)
    try:
        conn.executescript(_SQL_CRIA_TABELAS)
        yield conn
        conn.commit()
    finally:
        conn.close()


def ja_capturada(cnpj: str, tipo: str, chave: str) -> bool:
    with _conexao() as conn:
        row = conn.execute(
            "SELECT 1 FROM notas WHERE cnpj = ? AND tipo = ? AND chave = ?", (cnpj, tipo, chave)
        ).fetchone()
        return row is not None


def salvar_xml(cnpj: str, tipo: str, chave: str, conteudo_xml: bytes, data_emissao: date | None, nsu: str | None) -> Path:
    """Grava o XML na pasta organizada por cnpj/ano/mes e registra no indice.
    Se a chave ja tiver sido capturada antes, sobrescreve o arquivo (o conteudo
    autorizado de uma nota nao muda) mas nao duplica a linha no indice."""
    ano_mes = data_emissao or date.today()
    pasta_destino = config.PASTA_SAIDA / cnpj / f"{ano_mes.year:04d}" / f"{ano_mes.month:02d}" / tipo
    pasta_destino.mkdir(parents=True, exist_ok=True)

    caminho = pasta_destino / f"{chave}.xml"
    caminho.write_bytes(conteudo_xml)

    with _conexao() as conn:
        conn.execute(
            """
            INSERT INTO notas (cnpj, tipo, chave, nsu, caminho_arquivo, capturado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (cnpj, tipo, chave) DO UPDATE SET
                caminho_arquivo = excluded.caminho_arquivo,
                nsu = excluded.nsu
            """,
            (cnpj, tipo, chave, nsu, str(caminho), datetime.now().isoformat(timespec="seconds")),
        )

    return caminho


def ultimo_nsu(cnpj: str, tipo: str) -> str:
    with _conexao() as conn:
        row = conn.execute(
            "SELECT ultimo_nsu FROM estado_nsu WHERE cnpj = ? AND tipo = ?", (cnpj, tipo)
        ).fetchone()
        return row[0] if row else "0"


def salvar_ultimo_nsu(cnpj: str, tipo: str, nsu: str) -> None:
    with _conexao() as conn:
        conn.execute(
            """
            INSERT INTO estado_nsu (cnpj, tipo, ultimo_nsu) VALUES (?, ?, ?)
            ON CONFLICT (cnpj, tipo) DO UPDATE SET ultimo_nsu = excluded.ultimo_nsu
            """,
            (cnpj, tipo, nsu),
        )


def contar_capturadas(cnpj: str, tipo: str) -> int:
    with _conexao() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM notas WHERE cnpj = ? AND tipo = ?", (cnpj, tipo)
        ).fetchone()
        return row[0] if row else 0
