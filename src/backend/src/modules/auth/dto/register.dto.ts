import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\s\S]+$/)
  password!: string;
  @IsString() @MaxLength(128) confirmPassword!: string;
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
}
export class ResendOtpDto {
  @IsUUID() verificationId!: string;
}
export class VerifyEmailDto extends ResendOtpDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
  // Counter-created accounts only set their password after proof of email ownership.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\s\S]+$/)
  password?: string;
  @IsOptional() @IsString() @MaxLength(128) confirmPassword?: string;
}
