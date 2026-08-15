import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class BaseApiMessageDto {
  @ApiPropertyOptional({ description: 'También se acepta X-App-Key en header' })
  @IsOptional()
  @IsString()
  appkey?: string;

  @ApiPropertyOptional({ description: 'También se acepta X-Auth-Key en header' })
  @IsOptional()
  @IsString()
  authkey?: string;

  @ApiPropertyOptional({ description: 'Alias camelCase de appkey' })
  @IsOptional()
  @IsString()
  appKey?: string;

  @ApiPropertyOptional({ description: 'Alias camelCase de authkey' })
  @IsOptional()
  @IsString()
  authKey?: string;

  @ApiProperty({ example: '51987654321' })
  @IsString()
  @MinLength(8)
  to!: string;

  @ApiPropertyOptional({ example: 'principal', description: 'Slug de la instancia; opcional si la API Key está fijada a una instancia' })
  @IsOptional()
  @IsString()
  instance?: string;

  @ApiPropertyOptional({ example: 'false' })
  @IsOptional()
  @IsBooleanString()
  sandbox?: string;
}

export class SendTextDto extends BaseApiMessageDto {
  @ApiProperty({ example: 'Gracias por su compra.' })
  @IsString()
  @MinLength(1)
  message!: string;
}

export class SendDocumentDto extends BaseApiMessageDto {
  @ApiProperty({ example: 'https://erp.example.com/documentos/F001-00001234.pdf' })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({ example: 'F001-00001234.pdf' })
  @IsString()
  fileName!: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ example: 'Adjuntamos su comprobante electrónico.' })
  @IsOptional()
  @IsString()
  caption?: string;
}
