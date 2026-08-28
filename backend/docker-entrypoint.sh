#!/bin/sh
set -e

echo "Aplicando migrações do Prisma (migrate deploy)..."
npx prisma migrate deploy

echo "Iniciando o servidor NestJS..."
exec node dist/main.js
