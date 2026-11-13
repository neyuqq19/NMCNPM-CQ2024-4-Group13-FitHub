import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { WorkoutsService } from "./workouts.service";

// UC13 — Nhật ký tập luyện. All routes are MEMBER-only (checked in the service).
@Controller("api/workouts")
export class WorkoutsController {
  constructor(@Inject(WorkoutsService) private readonly service: WorkoutsService) {}

  // Static routes are declared before ":id" so they are matched first.
  @Get("my")
  @Header("Cache-Control", "no-store")
  listMine(
    @Headers("authorization") header?: string,
    @Query() query: Record<string, string> = {},
  ) {
    return this.service.listMine(header, query);
  }

  @Get("my/records")
  @Header("Cache-Control", "no-store")
  records(@Headers("authorization") header?: string) {
    return this.service.records(header);
  }

  @Post()
  create(@Body() body: unknown, @Headers("authorization") header?: string) {
    return this.service.create(header, body);
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  getOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") header?: string,
  ) {
    return this.service.getOne(header, id);
  }

  @Put(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Headers("authorization") header?: string,
  ) {
    return this.service.update(header, id, body);
  }

  @Delete(":id")
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") header?: string,
  ) {
    return this.service.remove(header, id);
  }
}
