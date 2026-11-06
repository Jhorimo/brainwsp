import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'b6f1c2b0-2222-4444-8888-000000000000' })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({ example: 'Llamada de seguimiento' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ example: 'Confirmar entrega del pedido #1234' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Oficina Brain Tech' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: '2026-08-25T15:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-08-25T15:30:00.000Z' })
  @IsDateString()
  endAt!: string;
}

export class SetAttendedDto {
  @ApiProperty({ example: true, description: 'true = asistió (check), false = quitar el check' })
  @IsBoolean()
  attended!: boolean;
}
