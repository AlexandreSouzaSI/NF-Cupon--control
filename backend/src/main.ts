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

  app.enableCors();

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