import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { OutgoingSalesNfController } from './outgoing-sales-nf.controller';
import { OutgoingSalesNfService } from './outgoing-sales-nf.service';

@Module({
    controllers: [OutgoingSalesNfController],
    providers: [OutgoingSalesNfService, PrismaService],
})
export class OutgoingSalesNfModule { }
