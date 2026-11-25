import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

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

// Servidor de correo (SMTP) de la plataforma, ej. Mailtrap. Ver MailService.
export class UpdateMailSettingsDto {
  @IsOptional()
  @IsBoolean()
  smtpEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  // true = TLS directo (puerto 465). false = STARTTLS o sin cifrar (587, 2525, 25).
  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  smtpUser?: string;

  // Vacío = borrar la contraseña guardada; ausente = no cambiarla.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  smtpPass?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsEmail()
  @MaxLength(200)
  mailFromEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mailFromName?: string;
}

export class TestMailDto {
  @IsEmail()
  @MaxLength(200)
  to!: string;
}
