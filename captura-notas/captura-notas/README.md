# Robo de captura de XML - NFe + NFSe

Captura automaticamente o XML de toda nota emitida contra o CNPJ de **uma ou
mais empresas do grupo** (cada CNPJ do grupo tem seu proprio certificado
digital e-CNPJ - o certificado e emitido por CNPJ, nao por grupo econômico, por
isso cada empresa entra com o seu no `empresas.json`):

- **NFe** (mercadorias/produtos): via **Distribuicao DFe da SEFAZ** (webservice
  nacional, o mesmo mecanismo de manifestacao do destinatario).
- **NFSe** (servicos): via **ADN - Ambiente de Dados Nacional** (API REST do
  Sistema Nacional NFS-e, `gov.br/nfse`).

Os dois exigem o certificado digital e-CNPJ (A1) da empresa para autenticar
(mTLS) - nao ha usuario/senha separado.

## Por que nao busca o XML dentro do Sankhya

O Sankhya ja guarda a **chave de acesso** de cada nota (confirmamos isso ao
vivo: entidade `CabecalhoNota`, campo `CHAVENFE` - ver `sankhya_consulta.py`),
mas nao encontramos, na documentacao publica do Sankhya, um jeito confiavel de
baixar o **XML bruto autorizado** por API (o unico endpoint documentado,
`ImpressaoNotasSP.imprimeDocumentos`, gera arquivos de impressao/DANFE, nao o
XML). Por isso a captura de verdade vai direto na fonte oficial (SEFAZ/ADN),
que ja usa o mesmo certificado. O Sankhya entra so como **conferencia
cruzada** (comparar o que ele conhece com o que o robo capturou).

Se depois voces confirmarem com o suporte Sankhya um endpoint oficial para
baixar o XML (ou o caminho da pasta onde o Sankhya ja salva o XML em disco -
ver tela "Gerar Arquivo XML de NF-e/NFS-e/SAT" dentro do Sankhya), da pra
simplificar bastante essa parte.

## 1. Instalar dependencias

```bash
cd captura-notas
pip install -r requirements.txt
```

## 2. Configurar

1. Copie `.env.example` para `.env`. Preencha `AMBIENTE` (comece com
   `homologacao`/produção restrita antes de apontar para `producao`) e,
   opcionalmente, `SANKHYA_*` (so necessario para a conferencia cruzada).

2. Copie `empresas.example.json` para `empresas.json` e preencha **uma entrada
   por CNPJ do grupo** (pode ter 1, 3, ou quantas forem):

   ```json
   [
     {
       "nome": "I wanna sleep - Matriz",
       "cnpj": "00000000000000",
       "uf_codigo": "31",
       "certificado_pfx_path": "C:\\certificados\\matriz.pfx",
       "certificado_pfx_senha": "senha1"
     },
     {
       "nome": "I wanna sleep - Filial 2",
       "cnpj": "11111111000100",
       "uf_codigo": "31",
       "certificado_pfx_path": "C:\\certificados\\filial2.pfx",
       "certificado_pfx_senha": "senha2"
     }
   ]
   ```

   - `cnpj`: so numeros (14 digitos).
   - `uf_codigo`: codigo IBGE da UF daquele CNPJ (tabela: AC=12 AL=27 AM=13
     AP=16 BA=29 CE=23 DF=53 ES=32 GO=52 MA=21 MG=31 MS=50 MT=51 PA=15 PB=25
     PE=26 PI=22 PR=41 RJ=33 RN=24 RO=11 RR=14 RS=43 SC=42 SE=28 SP=35 TO=17).
   - `certificado_pfx_path`/`certificado_pfx_senha`: certificado A1 (.pfx) **daquele
     CNPJ especifico** e a senha dele. **Nunca coloque o .pfx nem o
     `empresas.json` numa pasta versionada em Git** (o `.gitignore` ja bloqueia
     os dois, mas confirme antes de qualquer `git add`).

   O robo roda a captura para cada empresa da lista, uma de cada vez, e
   organiza o resultado por CNPJ (ver secao 4). Se um certificado falhar
   (expirado, senha errada), so aquela empresa da lista falha - as outras
   continuam normalmente.

## 3. Testar a logica sem certificado (offline)

Antes de mexer com certificado/rede, valide que a extracao de XML, o avanco
por NSU e a organizacao de pastas estao corretos, com respostas simuladas:

```bash
python teste_offline.py
```

Ou no VS Code: abra `teste_offline.py` e rode a configuracao de debug **"Teste
offline (sem certificado)"** (F5). Nao acessa rede nem le `.env` - roda numa
pasta temporaria que e apagada no final.

## 4. Testar de verdade em homologacao

```bash
python capturar.py
```

Com `AMBIENTE=homologacao`, o robo consulta os ambientes de teste/producao
restrita da SEFAZ e do ADN, para cada empresa do `empresas.json`. Confira:

- Os XMLs aparecem organizados em `dados/<cnpj>/<ano>/<mes>/<nfe|nfse>/<chave>.xml`
  (uma pasta por CNPJ, no topo).
- O arquivo `dados/_estado/indice.sqlite3` registra o que ja foi capturado
  (evita duplicar em execucoes futuras) e o ultimo NSU processado de cada
  fonte (proxima execucao continua do ponto onde parou).
- Os arquivos `dados/_estado/ultima_resposta_*.json` / `.xml` guardam a
  ultima resposta bruta recebida - uteis se algo vier em formato inesperado
  (a API do ADN e nova, lancada em out/2025, e a documentacao publica nao
  detalha o schema JSON campo-a-campo; a extracao em `utilitarios_xml.py` foi
  feita de forma tolerante a isso, mas vale conferir esses arquivos na
  primeira execucao real).

Só depois de validar em homologacao, troque `AMBIENTE=producao` no `.env`
(e troque o certificado/URLs para o CNPJ e ambiente reais, se for diferente).

## 5. Rodar periodicamente

Depois de validado, agende `python capturar.py` para rodar automaticamente
(ex.: Agendador de Tarefas do Windows, 1x por hora ou por dia). O script é
idempotente - pode rodar quantas vezes quiser, so grava o que for novo.

## 6. Conferencia cruzada com o Sankhya (opcional)

```python
from sankhya_consulta import listar_chaves_nfe
notas = listar_chaves_nfe("CHAVENFE IS NOT NULL AND DTNEG >= '01/08/2026'")
```

Compare as chaves retornadas com o conteudo de `dados/_estado/indice.sqlite3`
para ver se alguma nota que o Sankhya conhece ainda nao foi capturada (ou
vice-versa).

## Seguranca

- **Nunca** suba `.env` nem o arquivo `.pfx` para Git ou qualquer
  compartilhamento - eles dao acesso total ao certificado digital da empresa.
- O robo so **le** documentos fiscais (nenhuma chamada de emissao, cancelamento
  ou alteracao). E seguro rodar repetidamente.
- Se a empresa tiver certificado A3 (token/cartao) em vez de A1, este robo
  **nao funciona sem adaptacao** - A3 exige interacao com hardware fisico e
  nao da pra automatizar num servidor sem um dispositivo de assinatura remota.

## Estrutura

| Arquivo | Responsabilidade |
|---|---|
| `config.py` | Le `.env`, valida configuracao |
| `certificado.py` | Sessao HTTP com mTLS via certificado .pfx |
| `nfe_sefaz.py` | Captura de NFe (SOAP, Distribuicao DFe da SEFAZ) |
| `nfse_adn.py` | Captura de NFSe (REST, ADN - Sistema Nacional NFS-e) |
| `utilitarios_xml.py` | Decodifica GZip+Base64, extrai chave de acesso e data de emissao |
| `armazenamento.py` | Organiza XMLs em pastas + indice SQLite (idempotencia, ultimo NSU) |
| `sankhya_consulta.py` | Conferencia cruzada opcional com o Sankhya |
| `capturar.py` | Ponto de entrada (`python capturar.py`) |
