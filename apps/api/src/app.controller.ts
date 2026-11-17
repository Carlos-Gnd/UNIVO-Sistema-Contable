import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service.js";
import { Public } from "./auth/public.decorator.js";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getRoot(): string {
    return this.appService.getRootMessage();
  }

  @Public()
  @Get("health")
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }
}
