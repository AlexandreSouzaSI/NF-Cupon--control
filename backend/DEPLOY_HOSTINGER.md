# Deploy do NuGalho Hub (Controle NF) num VPS Hostinger

Guia completo pra colocar o backend (NestJS) + frontend (Next.js) + banco
(Postgres) rodando num VPS Hostinger com Docker. Sem domínio por enquanto —
acesso direto pelo IP do VPS, sem HTTPS (dá pra adicionar depois, quando
tiver domínio).

Segue as etapas em ordem. Teste cada uma antes de ir pra próxima.

---

## Etapa 0 — Sistema operacional

Na tela de criação do VPS ("Escolha o que instalar"), escolha **Ubuntu**
(a versão LTS mais recente disponível, ex: 24.04). É a opção mais
compatível com os passos abaixo.

---

## Etapa 1 — Acesso inicial e instalação do Docker

Conecta no VPS via SSH (o Hostinger te dá o IP e a senha root, ou você
configura uma chave SSH na criação):

```bash
ssh root@SEU_IP_DO_VPS
```

Atualiza o sistema:

```bash
apt update && apt upgrade -y
```

Instala o Docker (script oficial, cobre Docker Engine + CLI + plugin do
Compose):

```bash
curl -fsSL https://get.docker.com | sh
```

Confirma que instalou certo:

```bash
docker --version
docker compose version
```

Libera o firewall (SSH + as portas que o backend/frontend vão usar —
sem domínio/Nginx por enquanto, acessamos direto por porta):

```bash
apt install -y ufw
ufw allow OpenSSH
ufw allow 3001/tcp
ufw allow 4000/tcp
ufw --force enable
ufw status
```

**Teste esta etapa:** `docker --version` e `docker compose version` devem
responder com números de versão, sem erro. Me avisa quando isso funcionar
que a gente segue pra próxima etapa (clonar o código).

---

## Etapa 2 — Clonar o código

Cria uma pasta pro projeto e clona os dois repositórios dentro dela:

```bash
mkdir -p /opt/nugalho-hub
cd /opt/nugalho-hub

git clone SEU_REPO_BACKEND.git backend
git clone SEU_REPO_FRONTEND.git frontend
```

A estrutura final precisa ficar assim:

```
/opt/nugalho-hub/
  docker-compose.yml   (criamos na próxima etapa)
  backend/             (repo clonado, tem o Dockerfile)
  frontend/            (repo clonado, tem o Dockerfile)
```

**Teste esta etapa:** `ls /opt/nugalho-hub/backend/Dockerfile` e
`ls /opt/nugalho-hub/frontend/Dockerfile` precisam existir.

---

## Etapa 3 — Variáveis de ambiente

### 3.1 — Gerar os segredos

Ainda no VPS, gera 2 valores aleatórios (vamos usar nas próximas):

```bash
openssl rand -hex 32   # -> vai virar o JWT_SECRET
openssl rand -hex 32   # -> vai virar o CERT_ENCRYPTION_KEY
```

Guarda esses dois valores (cada `openssl rand` gera um diferente).

### 3.2 — backend/.env

```bash
cd /opt/nugalho-hub/backend
cp .env.example .env
nano .env
```

Ajusta pelo menos:

```
DATABASE_URL="postgresql://postgres:postgres@db:5432/compras_db?schema=public"
JWT_SECRET="cole aqui o primeiro valor do openssl rand"
PORT=4000
CERT_ENCRYPTION_KEY="cole aqui o segundo valor do openssl rand"
```

(O `db` no `DATABASE_URL` é o nome do serviço do Postgres no
`docker-compose.yml` — não é `localhost`, porque cada container tem sua
própria rede interna.)

As outras variáveis (`OPENAI_API_KEY`, `VAPID_*`, `WHATSAPP_*`) podem
ficar em branco por enquanto — o sistema funciona sem elas, só desativa
esses recursos específicos. Dá pra preencher depois.

Salva com `Ctrl+O`, `Enter`, sai com `Ctrl+X`.

### 3.3 — frontend/.env

```bash
cd /opt/nugalho-hub/frontend
cp .env.example .env
nano .env
```

```
NEXT_PUBLIC_API_URL=http://SEU_IP_DO_VPS:4000
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

Troca `SEU_IP_DO_VPS` pelo IP real do VPS. Salva e sai.

> Importante: como não tem domínio ainda, o frontend vai chamar a API
> por `http://IP:4000` (sem HTTPS). Isso funciona, mas o navegador pode
> reclamar de "site não seguro" — normal nessa fase. Quando você tiver
> um domínio, a gente troca isso e adiciona HTTPS de verdade.

**Teste esta etapa:** `cat backend/.env` e `cat frontend/.env` devem
mostrar os valores preenchidos (sem aspas erradas ou linhas quebradas).

---

## Etapa 4 — docker-compose.yml de produção

Ainda no VPS, na pasta `/opt/nugalho-hub`:

```bash
cd /opt/nugalho-hub
nano docker-compose.yml
```

Cola isto:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: compras_db
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
    restart: unless-stopped
    env_file:
      - ./backend/.env
    ports:
      - "4000:4000"
    volumes:
      - backend_uploads:/app/uploads
      - backend_certificates:/app/storage/certificates
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: ${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
    restart: unless-stopped
    ports:
      - "3001:3001"
    depends_on:
      - backend

volumes:
  db_data:
  backend_uploads:
  backend_certificates:
```

> `backend_certificates` guarda os arquivos `.pfx` do Certificado Digital
> (fica fora de `/uploads` de propósito, porque `/uploads` é servido
> publicamente). Sem esse volume, todo `docker compose up -d --build`
> recria o container do zero e apaga os certificados enviados — o registro
> no banco continua existindo, mas aponta pra um arquivo que já era. Com
> o volume, o arquivo sobrevive a rebuilds normalmente.

Salva e sai (`Ctrl+O`, `Enter`, `Ctrl+X`).

Repare que o `frontend` usa `${NEXT_PUBLIC_API_URL}` — isso lê do
ambiente do shell no momento do build, não do `frontend/.env` (porque é
um build-arg, precisa existir antes do container existir). Cria um
`.env` na raiz `/opt/nugalho-hub` (mesma pasta do `docker-compose.yml`,
não dentro de `frontend/`) só com isso:

```bash
cat > /opt/nugalho-hub/.env <<'EOF'
NEXT_PUBLIC_API_URL=http://SEU_IP_DO_VPS:4000
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
EOF
```

(troca `SEU_IP_DO_VPS` de novo pelo IP real).

**Teste esta etapa:** `cat docker-compose.yml` mostra o arquivo certo, e
`ls` na pasta `/opt/nugalho-hub` mostra `backend/`, `frontend/`,
`docker-compose.yml` e `.env`.

---

## Etapa 5 — Subir tudo

```bash
cd /opt/nugalho-hub
docker compose up -d --build
```

Isso builda as duas imagens (demora alguns minutos na primeira vez) e
sobe os 3 containers. O `docker-entrypoint.sh` do backend já roda as
migrações do Prisma e o seed automaticamente na subida.

Acompanha os logs:

```bash
docker compose logs -f backend
```

Procura por `Aplicando migrações do Prisma` e depois
`Iniciando o servidor NestJS`. `Ctrl+C` sai do modo de acompanhar logs
(os containers continuam rodando em segundo plano).

**Teste esta etapa:**

```bash
docker compose ps
```

Os 3 serviços (`db`, `backend`, `frontend`) precisam estar com status
`Up` (ou `running`). Depois, do seu computador (não precisa estar no
VPS), abre no navegador:

- `http://SEU_IP_DO_VPS:3001` → deve carregar a tela de login do
  NuGalho Hub.
- Login: `alemourasouza33@gmail.com` / senha `92988096` (a mesma do
  seed local).

---

## Comandos úteis pra depois

Ver logs de um serviço:
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Reiniciar tudo:
```bash
docker compose restart
```

Atualizar o código (depois de um `git push` novo):
```bash
cd /opt/nugalho-hub/backend && git pull
cd /opt/nugalho-hub/frontend && git pull
cd /opt/nugalho-hub
docker compose up -d --build
```

Parar tudo:
```bash
docker compose down
```
(os dados do banco e os uploads continuam salvos nos volumes — não some
nada, só para os containers.)

---

## Próximos passos (quando tiver domínio)

Quando você comprar/apontar um domínio pro IP desse VPS, a gente:
1. Instala Nginx no VPS como proxy reverso (domínio → porta 3001, e
   `api.dominio.com` → porta 4000).
2. Instala Certbot e gera certificado HTTPS grátis (Let's Encrypt) pros
   dois.
3. Troca `NEXT_PUBLIC_API_URL` pra usar `https://api.dominio.com` e
   rebuilda o frontend.

Isso deixa tudo com cadeado verde e sem expor as portas 3001/4000
diretamente. Me chama quando tiver o domínio que eu te guio nisso.
