import { Module } from "@nestjs/common";
import { ContabilidadModule } from "../contabilidad/contabilidad.module.js";
import { CasosCalculoPlanilla } from "./application/casos-calculo-planilla.js";
import { CasosEmpleados } from "./application/casos-empleados.js";
import { CasosTasasPlanilla } from "./application/casos-tasas-planilla.js";
import { CasosPrestaciones } from "./application/casos-prestaciones.js";
import { REPOSITORIO_EMPLEADOS } from "./domain/empleado.js";
import { REPOSITORIO_TASAS_PLANILLA } from "./domain/tasas-planilla.js";
import { EmpleadosController } from "./infrastructure/http/empleados.controller.js";
import { TasasPlanillaController } from "./infrastructure/http/tasas-planilla.controller.js";
import { PrestacionesController } from "./infrastructure/http/prestaciones.controller.js";
import { CalculoPlanillaController } from "./infrastructure/http/calculo-planilla.controller.js";
import { RepositorioEmpleadosPrisma } from "./infrastructure/repositorio-empleados.prisma.js";
import { RepositorioTasasPlanillaPrisma } from "./infrastructure/repositorio-tasas-planilla.prisma.js";
import { RepositorioCalculoPlanillaPrisma } from "./infrastructure/repositorio-calculo-planilla.prisma.js";
import { REPOSITORIO_CALCULO_PLANILLA } from "./domain/calculo-planilla.js";
import { REPOSITORIO_PRESTACIONES } from "./domain/prestaciones.js";
import { RepositorioPrestacionesPrisma } from "./infrastructure/repositorio-prestaciones.prisma.js";
import { CasosPlanillasOficiales } from "./application/casos-planillas-oficiales.js";
import { REPOSITORIO_PLANILLAS_OFICIALES } from "./domain/planillas-oficiales.js";
import { PlanillasOficialesController } from "./infrastructure/http/planillas-oficiales.controller.js";
import { RepositorioPlanillasOficialesPrisma } from "./infrastructure/repositorio-planillas-oficiales.prisma.js";

@Module({
  imports: [ContabilidadModule],
  controllers: [
    EmpleadosController,
    TasasPlanillaController,
    CalculoPlanillaController,
    PrestacionesController,
    PlanillasOficialesController,
  ],
  providers: [
    CasosEmpleados,
    CasosTasasPlanilla,
    CasosCalculoPlanilla,
    CasosPrestaciones,
    CasosPlanillasOficiales,
    { provide: REPOSITORIO_EMPLEADOS, useClass: RepositorioEmpleadosPrisma },
    { provide: REPOSITORIO_TASAS_PLANILLA, useClass: RepositorioTasasPlanillaPrisma },
    { provide: REPOSITORIO_CALCULO_PLANILLA, useClass: RepositorioCalculoPlanillaPrisma },
    { provide: REPOSITORIO_PRESTACIONES, useClass: RepositorioPrestacionesPrisma },
    { provide: REPOSITORIO_PLANILLAS_OFICIALES, useClass: RepositorioPlanillasOficialesPrisma },
  ],
})
export class PlanillaModule {}
