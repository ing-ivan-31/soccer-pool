import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmailVerifyToken(token: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { emailVerifyToken: token } });
  }

  async create(data: {
    email: string;
    password: string;
    name: string;
    emailVerifyToken: string;
    emailVerifyExpiry: Date;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async verifyEmail(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });
  }

  async updateHashedRefreshToken(id: string, hashedToken: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { hashedRefreshToken: hashedToken },
    });
  }
}