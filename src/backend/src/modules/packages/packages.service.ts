import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PackagesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listActivePackages() {
    const list = await this.prisma.package.findMany({
      where: { isActive: true },
      orderBy: { durationMonths: 'asc' },
    });
    return list.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      durationMonths: p.durationMonths,
      price: Number(p.price),
      grantsGymAccess: p.grantsGymAccess,
    }));
  }
}
