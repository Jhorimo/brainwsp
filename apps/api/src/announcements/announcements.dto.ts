import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
