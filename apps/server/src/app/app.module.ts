import { Controller, Get, Module, type DynamicModule } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin.guard";
import { AutomationsController, TrackingController } from "./automations.controller";
import { BackgroundJobs } from "./background";
import { CONTAINER, type Container } from "./container";
import { CrmController } from "./crm.controller";
import { WebhookController } from "./webhook.controller";

@Controller("health")
class HealthController {
  @Get()
  health() {
    return { status: "ok" };
  }
}

@Module({})
export class AppModule {
  static register(container: Container): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, WebhookController, AdminController, CrmController, AutomationsController, TrackingController],
      providers: [{ provide: CONTAINER, useValue: container }, AdminGuard, BackgroundJobs],
    };
  }
}
