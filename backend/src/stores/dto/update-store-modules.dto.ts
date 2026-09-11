import { IsArray, IsIn } from 'class-validator';
import { StoreModule } from '@prisma/client';

import { ALL_STORE_MODULES } from '../../common/store-module-labels';

export class UpdateStoreModulesDto {
    // Lista completa dos módulos que ficam ligados pra essa loja — substitui
    // o que já estava, não soma (o painel manda o estado final, igual um
    // formulário de checkboxes).
    @IsArray()
    @IsIn(ALL_STORE_MODULES, { each: true })
    enabledModules: StoreModule[];
}
