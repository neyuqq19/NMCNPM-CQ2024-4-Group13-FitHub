import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { TrainersService } from "./trainers.service";
import { statusInput, WorkingSlotsService } from "./working-slots.service";
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
    @Inject(WorkingSlotsService) private readonly slots: WorkingSlotsService,
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

  @Post("me/availability")
  async registerAvailability(
    @Headers("authorization") header: string,
    @Body() body: unknown,
  ) {
    const { actorId, id } = await this.owner(header, "me");
    return this.slots.register(actorId, id, body);
  }

  @Get("me/slots")
  async mySlots(
    @Headers("authorization") header: string,
    @Query("from") from: unknown,
    @Query("to") to: unknown,
  ) {
    const { id } = await this.owner(header, "me");
    return this.slots.schedule(id, from, to);
  }

  @Get(":id/slots")
  async schedule(
    @Headers("authorization") header: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("from") from: unknown,
    @Query("to") to: unknown,
  ) {
    const user = await this.auth.validateSession(header);
    if (user.role !== "ADMIN") await this.trainers.ownerId(user, id);
    return this.slots.schedule(id, from, to);
  }

  @Get(":id/available-slots")
  async available(
    @Headers("authorization") header: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("date") date: unknown,
  ) {
    await this.auth.validateSession(header);
    return this.slots.available(id, date);
  }

  @Patch("me/slots/:slotId/availability")
  async setAvailability(
    @Headers("authorization") header: string,
    @Param("slotId", new ParseUUIDPipe()) slotId: string,
    @Body() body: unknown,
  ) {
    const { actorId, id } = await this.owner(header, "me");
    return this.slots.change(actorId, id, slotId, statusInput(body));
  }

  @Delete("me/slots/:slotId")
  @HttpCode(204)
  async deleteSlot(
    @Headers("authorization") header: string,
    @Param("slotId", new ParseUUIDPipe()) slotId: string,
  ) {
    const { actorId, id } = await this.owner(header, "me");
    await this.slots.change(actorId, id, slotId, null);
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

  @Patch("me/certifications/:certId")
  async editCertification(
    @Headers("authorization") header: string,
    @Param("certId", new ParseUUIDPipe()) certId: string,
    @Body() body: unknown,
  ) {
    const { actorId, id } = await this.owner(header, "me");
    return this.trainers.updateCertification(
      actorId,
      id,
      certId,
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
