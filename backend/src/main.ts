import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app =
    await NestFactory.create<NestExpressApplication>(
      AppModule,
    );

  // CORS_ORIGINS (opcional, separado por vírgula): só esses sites podem
  // chamar a API pelo navegador. Sem a variável, continua aceitando qualquer
  // origem (o login é por token no header, não por cookie).
  const origens = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  app.enableCors({
    origin: origens.length ? origens : true,
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

  // Conciliação do Extrato manda a classificação de centenas de pagamentos
  // de uma vez (o padrão de 100kb do Express não aguenta).
  app.useBodyParser('json', { limit: '50mb' });

  // /uploads NÃO é mais servido aberto: os arquivos (boletos, NF, documentos
  // de funcionário...) passam pelo UploadsController, que exige login.

  // Cabeçalhos básicos de segurança (sem depender do helmet).
  app.disable('x-powered-by');
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
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