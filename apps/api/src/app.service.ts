import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getRootMessage(): string {
    return "UNIVO Sistema Contable API";
  }
}
