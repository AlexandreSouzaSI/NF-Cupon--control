# Deploy do NuGalho Hub (teste, grátis, no Render)

Este guia parte do princípio de que o repositório já está no GitHub, com
`backend/` e `frontend/` na raiz.

## 0. Antes de tudo: segurança

Confirme que **nada disso está no repositório** (rode `git status` na raiz):

- Arquivos `.pfx`/`.p12` (certificados digitais das lojas)
- `.env` de qualquer uma das duas pastas
- Backups tipo `.tar.gz` do projeto

Se algum desses já foi commitado, adicionar ao `.gitignore` agora não
resolve — é preciso remover do histórico do Git e, no caso dos `.pfx`,
considerar o certificado comprometido e reemitir junto à AC.

## 1. Preparar o repositório

Coloque estes três arquivos na **raiz** do repositório (mesmo nível de
`backend/` e `frontend/`), substituindo qualquer versão anterior:

- `docker-compose.yml`
- `render.yaml`
- este `DEPLOY.md` (opcional, mas ajuda quem mexer depois)

Os `Dockerfile`, `.dockerignore` e `.env.example` de cada lado já foram
criados dentro de `backend/` e `frontend/`.

Confira que a raiz também tem um `.gitignore` com:

```
*.pfx
*.p12
*.tar.gz
backend/.env
frontend/.env
backend/uploads/
```

## 2. Gerar as chaves antes de testar

Duas chaves precisam ser geradas localmente (Git Bash/WSL/Mac/Linux) antes
do primeiro teste, local ou no Render:

```bash
# Criptografia dos certificados digitais das lojas (.pfx)
openssl rand -hex 32

# Par de chaves do push notification (Web Push)
npx web-push generate-vapid-keys
```

O `openssl rand -hex 32` vira o `CERT_ENCRYPTION_KEY`. O `web-push
generate-vapid-keys` devolve um par `Public Key` / `Private Key`: a
`Public Key` vai em **dois** lugares (`VAPID_PUBLIC_KEY` no backend **e**
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` no frontend — é a mesma string nos dois), a
`Private Key` só no backend (`VAPID_PRIVATE_KEY`). Guarde as duas em algum
lugar seguro — se perder, é só gerar um par novo, mas aí quem já tinha
ativado notificação nos perfil vai precisar ativar de novo.

Notificação push não é obrigatória pro app funcionar: se deixar as
variáveis VAPID em branco, o push fica desativado sem quebrar nada — o
sino de notificação dentro do app continua funcionando normal.

## 3. Testar localmente com Docker (recomendado antes do deploy)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edite os dois `.env` com as chaves geradas no passo 2, depois:

```bash
docker compose up --build
```

- Backend: http://localhost:4000
- Frontend: http://localhost:3001
- Login seed: `admin@compras.com` / `123456`

Se isso funcionar local, o deploy no Render tem muito mais chance de
funcionar de primeira, porque é o mesmo Dockerfile.

## 4. Criar conta no Render e conectar o repositório

1. Crie uma conta em https://dashboard.render.com/register (dá pra entrar
   direto com a conta do GitHub).
2. No painel, clique em **New > Blueprint**.
3. Selecione o repositório do NuGalho Hub. O Render vai detectar o
   `render.yaml` na raiz automaticamente.
4. Ele vai listar os 3 recursos que o Blueprint cria:
   - `nugalho-db` (Postgres, plano free)
   - `nugalho-backend` (web service, Docker, plano free)
   - `nugalho-frontend` (web service, Docker, plano free)
5. Antes de confirmar, o Render pede pra preencher as variáveis marcadas
   como manuais:
   - **CERT_ENCRYPTION_KEY**: cole o valor gerado no passo 2 (hexadecimal
     de 64 caracteres — o gerador automático do Render não serve aqui,
     ele usa base64).
   - **VAPID_PUBLIC_KEY** / **VAPID_PRIVATE_KEY** / **VAPID_SUBJECT**: cole
     o par gerado no passo 2 (`VAPID_SUBJECT` é
     `mailto:alemourasouza33@gmail.com`, ou outro e-mail de contato). Pode
     deixar em branco se não quiser push agora.
   - **OPENAI_API_KEY**: só preencha se for usar o lançamento de despesa por
     voz. Pode deixar em branco por enquanto.
   - **NEXT_PUBLIC_API_URL** e **NEXT_PUBLIC_VAPID_PUBLIC_KEY** (frontend):
     deixe em branco por enquanto — vêm no passo 6.
6. Clique em **Apply**. O Render builda os dois Dockerfiles e sobe tudo.
   A primeira build demora alguns minutos.

## 5. O que acontece automaticamente no primeiro deploy do backend

O `docker-entrypoint.sh` roda, nessa ordem, toda vez que o backend sobe:

1. `prisma migrate deploy` — aplica todas as migrações pendentes no banco
   do Render (inclui o model `PushSubscription` do push notification).
2. `prisma db seed` — cria o usuário admin e as lojas demo (é idempotente,
   então rodar de novo em deploys futuros não duplica nada nem apaga dado
   real que já exista).
3. Inicia o servidor.

Você não precisa (e no plano free nem consegue — ver limitações abaixo)
entrar via terminal no Render pra rodar isso manualmente.

## 6. Ligar o frontend ao backend

1. Depois que `nugalho-backend` terminar o deploy, copie a URL dele no
   painel do Render (algo como `https://nugalho-backend-xxxx.onrender.com`).
2. Vá em `nugalho-frontend` > **Environment**, edite:
   - `NEXT_PUBLIC_API_URL`: cole essa URL completa (com `https://`).
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: cole a mesma `Public Key` que você
     colocou no backend no passo 4 (só se for usar push).
3. Como essas variáveis são gravadas dentro do JavaScript no momento do
   build (não são lidas em tempo real), é preciso forçar um novo build:
   **Manual Deploy > Deploy latest commit** no `nugalho-frontend`.
4. Quando terminar, acesse a URL do `nugalho-frontend` e teste o login.
5. Pra testar o push: entre em **Notificações** dentro do app e clique em
   **Ativar notificações**. Depois peça pra alguém com perfil Gerente
   registrar uma Perda numa loja que vocês tenham acesso — deve chegar uma
   notificação do sistema, mesmo com a aba fechada.

## 7. Limitações do plano free do Render (importante pra não se assustar)

Confirmado na documentação oficial do Render:

- **O serviço "dorme" depois de 15 min sem tráfego** e demora ~1 minuto pra
  acordar na próxima visita. Normal em teste, mas explica a primeira
  requisição lenta depois de um tempo parado.
- **O disco é sempre temporário (ephemeral)** — toda vez que o serviço
  reinicia, faz um novo deploy ou "dorme" e acorda, qualquer arquivo salvo
  localmente é apagado. Isso afeta direto: fotos de Perdas (o campo é
  obrigatório no app!), anexos de Tarefas, XML/NF de Serviços salvos em
  disco, e certificados `.pfx` enviados pela tela de Lojas. **Nesse plano
  free, esses uploads não sobrevivem — funcionam na hora, mas somem depois
  do próximo "sono" do serviço.** Pra um teste rápido de fluxo isso não
  trava nada, mas não dá pra depender desses dados ficarem lá. Quando
  quiserem usar de verdade (não só testar), a solução é subir num plano
  pago com disco persistente, ou mover esses uploads pra um storage externo
  tipo Cloudflare R2/S3 — posso montar isso depois, é trabalho à parte.
- **Banco Postgres free expira em 30 dias** da criação, com 14 dias de
  prazo extra pra fazer upgrade antes de apagar tudo. Pra um teste de
  algumas semanas tá ótimo; se o teste esticar, migrem o banco pra um plano
  pago antes do prazo (ou recriem outro free e rodem a migração de novo).
- **750 horas grátis por mês por workspace**, compartilhadas entre todos os
  serviços free daquele workspace. Como só temos 2 serviços web, não deve
  ser problema num teste normal.
- **Sem acesso a Shell/terminal e sem "one-off jobs" no plano free** — por
  isso o seed roda automaticamente no entrypoint em vez de manual.

## 8. Sobre o app instalável (PWA)

Depois que o frontend estiver publicado, qualquer pessoa pode "instalar"
o NuGalho Hub direto do navegador, sem loja de aplicativo:

- **Android (Chrome)**: abre um banner de "Adicionar à tela inicial"
  automaticamente, ou tem a opção no menu (⋮).
- **iOS (Safari)**: não tem banner automático — o usuário precisa tocar em
  **Compartilhar** (ícone de quadrado com seta) e escolher **Adicionar à
  Tela de Início**. Vale avisar o time disso na hora de divulgar o app.

Depois de instalado, o app abre em tela cheia (sem barra de endereço) e,
se as chaves VAPID estiverem configuradas, dá pra ativar notificação
push em **Notificações > Ativar notificações**.

## 9. Se algo der errado

- Logs: aba **Logs** de cada serviço no painel do Render, em tempo real.
- Erro de migração: geralmente falta variável de ambiente ou o
  `DATABASE_URL` não está apontando pro banco certo — confira em
  **Environment** do `nugalho-backend`.
- Frontend não fala com o backend: normalmente é o `NEXT_PUBLIC_API_URL`
  errado ou esquecido de redeployar depois de mudar (passo 6.3).
- Push não chega: confira se as 3 variáveis VAPID estão preenchidas no
  backend e se `NEXT_PUBLIC_VAPID_PUBLIC_KEY` bate com `VAPID_PUBLIC_KEY`
  (mesma string nos dois lados) — e se o frontend foi redeployado depois
  de preencher.
