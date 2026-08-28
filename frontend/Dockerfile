# syntax=docker/dockerfile:1
#
# Build multi-stage do frontend Next.js (App Router), usando output
# "standalone" pra imagem final ficar pequena.

# ---- deps ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
# NEXT_PUBLIC_* é inlined no bundle JS durante o build — precisa ser
# passado como build-arg (não dá pra trocar só no runtime depois).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --create-home nugalho

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

RUN chown -R nugalho:nugalho /app
USER nugalho

# O Render injeta PORT automaticamente; localmente usamos 3001, igual à
# porta de produção definida no CLAUDE.md do projeto.
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
