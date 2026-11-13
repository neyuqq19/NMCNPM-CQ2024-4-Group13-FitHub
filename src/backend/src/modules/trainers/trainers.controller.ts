import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { TrainersService } from "./trainers.service";
import {
  certificationInput,
  deleteVersion,
  profileInput,
} from "./trainers.validation";

@Controller("api/trainers")
export class TrainersController {
  constructor(
    @Inject(TrainersService) private readonly trainers: TrainersService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  async list(
    @Headers("authorization") header: string,
    @Query("q") q: unknown,
    @Query("specialty") specialty: unknown,
  ) {
    await this.auth.validateSession(header);
    return this.trainers.list(q, specialty);
  }

  @Get("me")
  async mine(@Headers("authorization") header: string) {
    return this.trainers.mine(await this.auth.validateSession(header));
  }

  @Get(":id")
  async get(
    @Headers("authorization") header: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.trainers.get(id, await this.auth.validateSession(header));
  }

  private async owner(header: string, target: string) {
    const user = await this.auth.validateSession(header);
    return { actorId: user.id, id: await this.trainers.ownerId(user, target) };
  }

  @Put(":target/profile")
  async update(
    @Headers("authorization") header: string,
    @Param("target") target: string,
    @Body() body: unknown,
  ) {
    const { actorId, id } = await this.owner(header, target);
    return this.trainers.update(actorId, id, profileInput(body));
  }

  @Post(":target/certifications")
  async add(
    @Headers("authorization") header: string,
    @Param("target") target: string,
    @Body() body: unknown,
  ) {
    const { actorId, id } = await this.owner(header, target);
    return this.trainers.addCertification(
      actorId,
      id,
      certificationInput(body),
    );
  }

  @Delete(":target/certifications/:certId")
  async remove(
    @Headers("authorization") header: string,
    @Param("target") target: string,
    @Param("certId", new ParseUUIDPipe()) certId: string,
    @Body() body: unknown,
  ) {
    const { actorId, id } = await this.owner(header, target);
    return this.trainers.removeCertification(
      actorId,
      id,
      certId,
      deleteVersion(body),
    );
  }
}
