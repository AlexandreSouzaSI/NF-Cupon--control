import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
    imports: [
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.getOrThrow<string>('JWT_SECRET'),
                signOptions: {
                    expiresIn: '7d',
                },
            }),
        }),
    ],
    controllers: [DemoController],
    providers: [DemoService],
})
export class DemoModule { }
