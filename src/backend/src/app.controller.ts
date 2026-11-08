import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Controller()
export class AppController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get()
  getRoot() {
    return {
      name: 'FitHub API Server',
      status: 'online',
      version: '0.1.0',
      health: '/api/health',
    };
  }

  @Get('api/health')
  async getHealth() {
    const userCount = await this.prisma.user.count();
    return {
      status: 'ok',
      database: 'supabase-connected',
      usersInDb: userCount,
      timestamp: new Date().toISOString(),
    };
  }
}
