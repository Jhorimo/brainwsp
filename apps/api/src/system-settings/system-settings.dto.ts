import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSystemSettingsDto {
  // 1..365: por debajo de 1 dia no tiene sentido (borraria cosas del mismo dia), por
  // encima de un año es probablemente un error de digitacion, no un valor real.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  mediaRetentionDays?: number;

  // 1MB..500MB: el piso evita un 0 o negativo que bloquearia todo envio por accidente;
  // el techo es generoso pero acotado, para no permitir un valor que vuelva a exponer
  // al servidor al mismo problema que esto resuelve.
  @IsOptional()
  @IsInt()
  @Min(1024 * 1024)
  @Max(500 * 1024 * 1024)
  maxMediaSizeBytes?: number;
}
