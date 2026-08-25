import { Module } from '@nestjs/common';
import { LossesController } from './losses.controller';
import { LossesService } from './losses.service';

@Module({
    controllers: [LossesController],
    providers: [LossesService],
})
export class LossesModule { }
