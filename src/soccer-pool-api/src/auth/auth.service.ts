import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface JwtPayload {
  sub: string;
  email?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type SafeUser = Omit<
  User,
  'password' | 'hashedRefreshToken' | 'emailVerifyToken' | 'emailVerifyExpiry'
>;

@Injectable()
export class AuthService {
  private readonly resend: Resend;
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  async register(
    dto: RegisterDto,
  ): Promise<{ message: string; data: SafeUser }> {
    const existing = await this.authRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.authRepository.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      emailVerifyToken,
      emailVerifyExpiry,
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    await this.resend.emails.send({
      from: 'Soccer Pool <noreply@soccerpool.app>',
      to: user.email,
      subject: 'Verifica tu cuenta',
      html: `<p>Hola ${user.name},</p><p>Verifica tu cuenta haciendo clic en el siguiente enlace:</p><a href="${frontendUrl}/verify-email?token=${emailVerifyToken}">Verificar email</a><p>Este enlace expira en 24 horas.</p>`,
    });

    return {
      message: 'Usuario registrado. Revisa tu email para verificar tu cuenta.',
      data: this.sanitizeUser(user),
    };
  }

  async verifyEmail(
    token: string,
  ): Promise<{ message: string; data: SafeUser }> {
    const user = await this.authRepository.findByEmailVerifyToken(token);
    if (
      !user ||
      !user.emailVerifyExpiry ||
      user.emailVerifyExpiry < new Date()
    ) {
      throw new BadRequestException('Token expirado o inválido');
    }

    const updated = await this.authRepository.verifyEmail(user.id);
    return {
      message: 'Email verificado exitosamente.',
      data: this.sanitizeUser(updated),
    };
  }

  async login(
    dto: LoginDto,
    res: { cookie: (name: string, value: string, options: object) => void },
  ): Promise<{
    message: string;
    data: { accessToken: string; user: SafeUser };
  }> {
    const user = await this.authRepository.findByEmail(dto.email);
    const isValidPassword = user
      ? await bcrypt.compare(dto.password, user.password)
      : false;

    if (!user || !isValidPassword) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Verifica tu email antes de iniciar sesión');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      message: 'Login exitoso.',
      data: {
        accessToken: tokens.accessToken,
        user: this.sanitizeUser(user),
      },
    };
  }

  async refresh(
    userId: string,
    refreshToken: string,
    res: { cookie: (name: string, value: string, options: object) => void },
  ): Promise<{ message: string; data: { accessToken: string } }> {
    const user = await this.authRepository.findById(userId);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Acceso denegado');
    }

    const isValid = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
    if (!isValid) throw new UnauthorizedException('Acceso denegado');

    const tokens = await this.generateTokens(user.id, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      message: 'Token renovado.',
      data: { accessToken: tokens.accessToken },
    };
  }

  async logout(
    userId: string,
    res: { clearCookie: (name: string, options: object) => void },
  ): Promise<{ message: string; data: null }> {
    await this.authRepository.updateHashedRefreshToken(userId, null);
    res.clearCookie('refresh_token', { path: '/auth/refresh' });
    return { message: 'Sesión cerrada.', data: null };
  }

  async getMe(userId: string): Promise<{ message: string; data: SafeUser }> {
    const user = await this.authRepository.findById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return { message: 'Perfil obtenido.', data: this.sanitizeUser(user) };
  }

  private async generateTokens(
    userId: string,
    email: string,
  ): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ sub: userId, email } satisfies JwtPayload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn:
          Number(this.configService.get('JWT_ACCESS_EXPIRES_IN')) || 3600,
      }),
      this.jwtService.signAsync({ sub: userId } satisfies JwtPayload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn:
          Number(this.configService.get('JWT_REFRESH_EXPIRES_IN')) || 604800,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hashed = await bcrypt.hash(refreshToken, this.BCRYPT_ROUNDS);
    await this.authRepository.updateHashedRefreshToken(userId, hashed);
  }

  private setRefreshCookie(
    res: { cookie: (name: string, value: string, options: object) => void },
    token: string,
  ): void {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private sanitizeUser(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      password,
      hashedRefreshToken,
      emailVerifyToken,
      emailVerifyExpiry,
      ...safe
    } = user;

    return safe;
  }
}
