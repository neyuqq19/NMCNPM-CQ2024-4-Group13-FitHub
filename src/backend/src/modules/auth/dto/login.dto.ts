import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type { Platform } from '@fithub/contracts';
export function normalizeIdentifier(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const clean = value.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  const phone = clean.replace(/[\s.-]/g, '');
  return phone.startsWith('+84') ? `0${phone.slice(3)}` : phone;
}
export class LoginDto {
  @Transform(({ value }) => normalizeIdentifier(value))
  @IsString() @MaxLength(254)
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|0[35789]\d{8})$/)
  identifier!: string;
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
  @IsIn(['WEB', 'MOBILE']) platform!: Platform;
  @IsUUID() deviceId!: string;
  @IsUUID() requestId!: string;
}
