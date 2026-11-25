import { Inject, Injectable } from "@nestjs/common";
import type { ConsultaInventarioAnalitico, InventarioAnaliticoVista } from "@contable/shared";
import {
  REPOSITORIO_INVENTARIO,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
  type RepositorioInventario,
} from "../domain/producto.js";
import {
  armarInventarioAnalitico,
  InventarioAnaliticoNoEncontradoError,
  SinSucursalInventarioAnaliticoError,
  SistemaInventarioAnaliticoRequeridoError,
} from "../domain/inventario-analitico.js";

@Injectable()
export class ConsultarInventarioAnalitico {
  constructor(@Inject(REPOSITORIO_INVENTARIO) private readonly repositorio: RepositorioInventario) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    filtros: ConsultaInventarioAnalitico,
  ): Promise<InventarioAnaliticoVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await unidad.acceso(usuarioId, empresaId);
      if (!acceso) throw new InventarioAnaliticoNoEncontradoError();

      let sucursales: readonly string[] | null;
      if (filtros.sucursalId) {
        if (!(await unidad.existeSucursal(empresaId, filtros.sucursalId))) {
          throw new SucursalNoEncontradaError();
        }
        if (!acceso.todasSucursales && !acceso.sucursales.includes(filtros.sucursalId)) {
          throw new SucursalNoAutorizadaError();
        }
        sucursales = [filtros.sucursalId];
      } else {
        sucursales = acceso.todasSucursales ? null : acceso.sucursales;
        if (sucursales?.length === 0) throw new SinSucursalInventarioAnaliticoError();
      }

      const datos = await unidad.datosInventarioAnalitico({
        empresaId,
        desde: filtros.desde,
        hasta: filtros.hasta,
        sucursales,
      });
      if (datos.sistemaInventario !== "analitico") throw new SistemaInventarioAnaliticoRequeridoError();
      return armarInventarioAnalitico(datos, filtros);
    });
  }
}
