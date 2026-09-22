import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap() {
  const app =
    await NestFactory.create<NestExpressApplication>(
      AppModule,
    );

  app.enableCors({
    // X-Batch-Summary: resumo do lançamento em lote (Sicredi) que vem
    // junto do download do .txt — sem isso o navegador bloqueia o
    // frontend de ler esse header numa resposta cross-origin (Contas a
    // Pagar → botão "Gerar lançamento em lote").
    exposedHeaders: ['X-Batch-Summary'],
  });

  // Atrás do Nginx (produção), sem isso req.ip sempre devolve o IP do
  // próprio servidor, não o do visitante — quebraria o controle de teste
  // grátis por IP (DemoService). 1 = confia só no primeiro proxy na
  // frente (o Nginx local), não em qualquer X-Forwarded-For que chegar.
  app.set('trust proxy', 1);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 3000);

  console.log(
    `Servidor rodando na porta ${process.env.PORT || 3000}`,
  );
}

bootstrap();