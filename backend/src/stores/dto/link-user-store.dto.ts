import { IsString } from 'class-validator';

export class LinkUserStoreDto {
    @IsString()
    userId!: string;
}