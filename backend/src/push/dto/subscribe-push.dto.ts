import { IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
    @IsString()
    p256dh!: string;

    @IsString()
    auth!: string;
}

// Corresponde exatamente ao formato que `PushSubscription.toJSON()` gera no
// navegador — endpoint + par de chaves (p256dh/auth) usado pra criptografar
// o payload do push.
export class SubscribePushDto {
    @IsString()
    endpoint!: string;

    @ValidateNested()
    @Type(() => PushKeysDto)
    keys!: PushKeysDto;
}
