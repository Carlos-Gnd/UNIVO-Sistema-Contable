import { Inject, Injectable } from "@nestjs/common";
import type { CrearEmpleado, EditarEmpleado, EmpleadoVista } from "@contable/shared";
import {
  REPOSITORIO_EMPLEADOS,
  type FiltroEmpleados,
  type RepositorioEmpleados,
} from "../domain/empleado.js";

@Injectable()
export class CasosEmpleados {
  constructor(@Inject(REPOSITORIO_EMPLEADOS) private readonly repositorio: RepositorioEmpleados) {}

  empleados(usuarioId: string, empresaId: string, filtro: FiltroEmpleados): Promise<EmpleadoVista[]> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.empleados(usuarioId, empresaId, filtro));
  }

  empleado(usuarioId: string, empresaId: string, empleadoId: string): Promise<EmpleadoVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.empleado(usuarioId, empresaId, empleadoId));
  }

  crearEmpleado(usuarioId: string, empresaId: string, datos: CrearEmpleado): Promise<EmpleadoVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.crearEmpleado(usuarioId, empresaId, datos));
  }

  editarEmpleado(
    usuarioId: string,
    empresaId: string,
    empleadoId: string,
    cambios: EditarEmpleado,
  ): Promise<EmpleadoVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) =>
      u.editarEmpleado(usuarioId, empresaId, empleadoId, cambios),
    );
  }
}
