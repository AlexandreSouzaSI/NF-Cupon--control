# syntax=docker/dockerfile:1
#
# Build multi-stage do backend NestJS + Prisma.
# Usamos node:20-bookworm-slim (Debian) em vez de alpine porque o bcrypt
# (módulo nativo) e o engine do Prisma têm menos problema de compatibilidade
# com glibc do que com musl.

# ---- deps: instala todas as dependências (precisa das devDependencies pra buildar) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build: compila o Nest e gera o client do Prisma ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime: imagem final, só com o necessário pra rodar ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home nugalho

ENV NODE_ENV=production
# Mantido igual ao script "start:prod" do package.json — algumas libs de
# assinatura/certificado (fluxo de NFe/NFSe) dependem dessa flag com o
# OpenSSL 3 do Node 20.
ENV NODE_OPTIONS=--openssl-legacy-provider

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh \
    && mkdir -p uploads \
    && chown -R nugalho:nugalho /app

USER nugalho

# O Render injeta a variável PORT automaticamente; localmente cai no valor
# do .env (padrão 4000).
EXPOSE 4000

CMD ["./docker-entrypoint.sh"]
