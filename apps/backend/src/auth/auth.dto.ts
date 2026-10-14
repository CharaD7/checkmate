import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class CredentialsDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(72)
  password!: string;
}
