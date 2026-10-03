import { IsString } from 'class-validator';

export class SaveMeepCredentialDto {
    @IsString()
    subscriptionKey!: string;

    @IsString()
    username!: string;

    @IsString()
    password!: string;

    @IsString()
    meepStoreId!: string;
}
