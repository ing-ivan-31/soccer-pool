import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ivan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MyPass123' })
  @IsString()
  password: string;
}