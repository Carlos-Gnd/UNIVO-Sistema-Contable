import "i18next";
import type { RECURSOS } from "./recursos";

// Claves tipadas: t("menu.abirr") no compila. Las claves válidas son las de los archivos en español.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "comun";
    resources: (typeof RECURSOS)["es"];
  }
}
