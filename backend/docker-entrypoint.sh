#!/bin/sh
set -e

echo "Aplicando migrações do Prisma (migrate deploy)..."
npx prisma migrate deploy

# O plano free do Render não tem acesso a Shell nem a "one-off jobs", então
# não dá pra rodar o seed manualmente depois do deploy. Como o seed usa
# upsert (idempotente), é seguro rodar em toda subida — só cria o que ainda
# não existe.
echo "Rodando seed (idempotente)..."
npx prisma db seed || echo "Seed falhou ou já não é necessário, seguindo."

echo "Iniciando o servidor NestJS..."
exec node dist/main.js
