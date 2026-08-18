import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  controllers: [StoresController],
  providers: [StoresService, PrismaService],
  exports: [StoresService],
})
export class StoresModule { }