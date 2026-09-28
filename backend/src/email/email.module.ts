import { Logger, Module } from '@nestjs/common';

import { EmailService } from './email.service';
import { EMAIL_PROVIDER } from './email-provider.interface';
import { LogEmailProvider } from './providers/log-email.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';

const moduleLogger = new Logger('EmailModule');

@Module({
    providers: [
        EmailService,
        {
            provide: EMAIL_PROVIDER,
            useFactory: () => {
                if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
                    moduleLogger.log('E-mail usando Resend.');
                    return new ResendEmailProvider();
                }

                moduleLogger.warn(
                    'E-mail sem provedor real configurado — mensagens só vão pro log (ver RESEND_API_KEY/RESEND_FROM_EMAIL no .env.example).',
                );

                return new LogEmailProvider();
            },
        },
    ],
    exports: [EmailService],
})
export class EmailModule { }
