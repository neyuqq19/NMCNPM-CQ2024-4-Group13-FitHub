import { Controller, Get, Inject } from '@nestjs/common';
import { PackagesService } from './packages.service';

@Controller('api/packages')
export class PackagesController {
  constructor(
    @Inject(PackagesService) private readonly packagesService: PackagesService,
  ) {}

  @Get()
  async listPackages() {
    return this.packagesService.listActivePackages();
  }
}
