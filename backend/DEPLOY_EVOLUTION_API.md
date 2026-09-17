# Ligar o WhatsApp de verdade (Evolution API) na VPS

Guia complementar ao `DEPLOY_HOSTINGER.md`: assume que o backend/frontend do
Controle NF já estão rodando na VPS via `docker compose`, num diretório tipo
`/opt/nugalho-hub`, com domínio + Nginx + Certbot já configurados. Aqui a
gente sobe a **Evolution API** (open-source, self-hosted) do lado, conecta
seu número de WhatsApp nela e liga no sistema.

Como o código já está pronto (`EvolutionWhatsappProvider`), essa parte é só
infraestrutura — nenhum código muda depois disso, só variáveis de ambiente.

Segue as etapas em ordem, testando cada uma antes de ir pra próxima.

---

## Etapa 1 — Subir a Evolution API no docker-compose

Ainda no VPS, edita o `docker-compose.yml` que já existe em
`/opt/nugalho-hub`:

```bash
cd /opt/nugalho-hub
nano docker-compose.yml
```

Adiciona este serviço (mantendo os que já existem — `db`, `backend`,
`frontend`):

```yaml
  evolution-api:
    container_name: evolution_api
    image: evoapicloud/evolution-api:v2.1.1
    restart: unless-stopped
    env_file:
      - ./evolution.env
    ports:
      - "8080:8080"
    volumes:
      - evolution_instances:/evolution/instances
```

E adiciona o volume novo lá embaixo, junto dos outros:

```yaml
volumes:
  db_data:
  backend_uploads:
  backend_certificates:
  evolution_instances:
```

Salva e sai (`Ctrl+O`, `Enter`, `Ctrl+X`).

## Etapa 2 — Arquivo de configuração da Evolution API

Gera uma chave de API aleatória (essa é a senha que protege sua instância —
guarda ela, vai ser usada em vários lugares depois):

```bash
openssl rand -hex 24
```

Cria o `evolution.env`:

```bash
nano /opt/nugalho-hub/evolution.env
```

Cola (trocando `evolution.SEUDOMINIO.com.br` pelo subdomínio que você vai
usar, e a chave pela que acabou de gerar):

```
AUTHENTICATION_API_KEY=cole_a_chave_gerada_aqui
SERVER_URL=https://evolution.SEUDOMINIO.com.br
```

Salva e sai.

**Teste esta etapa:** `cat /opt/nugalho-hub/evolution.env` mostra as duas
linhas preenchidas certo.

---

## Etapa 3 — Subir o container

```bash
cd /opt/nugalho-hub
docker compose up -d evolution-api
docker compose logs -f evolution-api
```

Espera aparecer algo como `Server running on port 8080` nos logs. `Ctrl+C`
sai do modo de acompanhar (o container continua rodando).

**Teste esta etapa:**

```bash
curl http://localhost:8080
```

Deve responder um JSON dizendo que a API está no ar (algo como
`{"status":200,"message":"Welcome to the Evolution API..."}`).

---

## Etapa 4 — Subdomínio + HTTPS (Nginx + Certbot)

Aponta o DNS de `evolution.SEUDOMINIO.com.br` pro IP da VPS (mesmo lugar
onde você já apontou os outros subdomínios do Controle NF).

Cria o site no Nginx:

```bash
nano /etc/nginx/sites-available/evolution
```

```nginx
server {
    listen 80;
    server_name evolution.SEUDOMINIO.com.br;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

(o `Upgrade`/`Connection` é porque o painel da Evolution usa WebSocket pra
atualizar o QR Code ao vivo — sem isso ele não atualiza sozinho.)

Ativa e recarrega:

```bash
ln -s /etc/nginx/sites-available/evolution /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Gera o certificado HTTPS:

```bash
certbot --nginx -d evolution.SEUDOMINIO.com.br
```

**Teste esta etapa:** abrir `https://evolution.SEUDOMINIO.com.br` no
navegador deve mostrar o mesmo JSON de "Welcome to the Evolution API",
agora com cadeado.

---

## Etapa 5 — Criar a instância e conectar seu WhatsApp (QR Code)

Cria a instância (troca `SUA_API_KEY` pela chave gerada na Etapa 2; pode
trocar `"gestia"` pelo nome que quiser, é só um identificador):

```bash
curl -X POST https://evolution.SEUDOMINIO.com.br/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_API_KEY" \
  -d '{
    "instanceName": "gestia",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

A resposta vem com um campo `qrcode.base64` (uma string bem longa
começando com `data:image/png;base64,...`). Pra ver o QR Code de verdade:

1. Copia só o conteúdo desse campo (o valor entre aspas).
2. Cola inteiro na barra de endereço do navegador (funciona porque já é
   uma "data URL" de imagem) — ou joga num conversor online tipo
   `base64toimage.com` se preferir.
3. Escaneia com o WhatsApp do celular: **Configurações → Aparelhos
   conectados → Conectar um aparelho**.

Se o QR expirar antes de escanear (dura pouco), pega um novo com:

```bash
curl https://evolution.SEUDOMINIO.com.br/instance/connect/gestia \
  -H "apikey: SUA_API_KEY"
```

**Teste esta etapa:**

```bash
curl https://evolution.SEUDOMINIO.com.br/instance/connectionState/gestia \
  -H "apikey: SUA_API_KEY"
```

Deve responder `"state": "open"` depois de escanear — significa que o
número está conectado.

---

## Etapa 6 — Registrar o webhook (pra "iniciar" funcionar pelas respostas)

Gera outro valor aleatório (esse protege o endpoint que recebe as
respostas do WhatsApp no seu backend):

```bash
openssl rand -hex 24
```

Registra o webhook na instância (troca `SUA_API_KEY`, `SEU_WEBHOOK_TOKEN`
— o valor que acabou de gerar — e `api.SEUDOMINIO.com.br` pelo domínio
real do backend):

```bash
curl -X POST https://evolution.SEUDOMINIO.com.br/webhook/set/gestia \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_API_KEY" \
  -d '{
    "url": "https://api.SEUDOMINIO.com.br/whatsapp/webhook?token=SEU_WEBHOOK_TOKEN",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

---

## Etapa 7 — Ligar no backend do Controle NF

Edita o `.env` do backend:

```bash
nano /opt/nugalho-hub/backend/.env
```

Preenche (ou adiciona) essas linhas com os valores das etapas anteriores:

```
EVOLUTION_API_URL="https://evolution.SEUDOMINIO.com.br"
EVOLUTION_API_KEY="a mesma chave da Etapa 2"
EVOLUTION_INSTANCE="gestia"
WHATSAPP_WEBHOOK_TOKEN="o valor gerado na Etapa 6"
```

Salva e reinicia só o backend pra ele carregar as novas variáveis:

```bash
cd /opt/nugalho-hub
docker compose up -d --build backend
docker compose logs -f backend
```

Procura no log por uma linha assim (confirma que pegou o provedor certo):

```
WhatsApp usando Evolution API (instância "gestia").
```

Se em vez disso aparecer o aviso "WhatsApp sem provedor real
configurado...", alguma das 3 variáveis (`EVOLUTION_API_URL`,
`EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`) não foi lida certo — confere o
`.env`.

---

## Etapa 8 — Testar de ponta a ponta

1. Em Cadastros → Usuários, confirma que o seu usuário tem telefone
   cadastrado (o mesmo número que você quer notificar).
2. Cria uma tarefa atribuída a você mesmo.
3. Deve chegar uma mensagem de verdade no seu WhatsApp em poucos segundos.
4. No Quadro de Tarefas, clica em **"Notificar WhatsApp"** no card — deve
   chegar um lembrete avulso também.
5. Responde **"iniciar"** na conversa do WhatsApp — a tarefa deve mudar
   pra "Em andamento" sozinha no Quadro (sem precisar clicar em nada no
   sistema). Se isso funcionar, o webhook (Etapa 6) está certo.

---

## Problemas comuns

- **Não chega nada, sem erro no log:** confere se o `phone` do usuário
  está cadastrado e se o `state` da instância (Etapa 5) ainda está
  `"open"` — o WhatsApp desconecta a instância se o celular ficar muito
  tempo offline da internet.
- **Erro 401 do WhatsApp ao mandar mensagem:** a `EVOLUTION_API_KEY` no
  `.env` do backend não bate com a `AUTHENTICATION_API_KEY` do
  `evolution.env`.
- **"iniciar" não muda o status da tarefa:** confere se o webhook foi
  registrado certo (Etapa 6) e se `WHATSAPP_WEBHOOK_TOKEN` no `.env` do
  backend é exatamente o mesmo valor usado na URL do webhook.
