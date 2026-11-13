import { Inject, Injectable } from "@nestjs/common";
import { validarPartida, type CrearPartida, type PartidaVista } from "@contable/shared";
import {
  EmpresaNoEncontradaError,
  LineasInvalidasError,
  NoEsBorradorError,
  PartidaNoEncontradaError,
  PERMISO_REGISTRAR_PARTIDAS,
  PERMISO_VER_PARTIDAS,
  puedeUsarSucursal,
  REPOSITORIO_PARTIDAS,
  SinPermisoPartidasError,
  SucursalNoAutorizadaError,
  type AccesoPartidas,
  type RepositorioPartidas,
  type UnidadPartidas,
} from "../domain/partida-borrador.js";

async function exigirAcceso(
  unidad: UnidadPartidas,
  usuarioId: string,
  empresaId: string,
  permiso: string,
  mensaje: string,
): Promise<AccesoPartidas> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new EmpresaNoEncontradaError();
  if (!acceso.permisos.has(permiso)) throw new SinPermisoPartidasError(mensaje);
  return acceso;
}

/**
 * Las reglas que dependen del catálogo se revisan antes de guardar para responder un error por línea.
 * El cuadre no se exige: un borrador puede guardarse descuadrado y completarse después (HU-21).
 */
async function validarLineas(unidad: UnidadPartidas, empresaId: string, datos: CrearPartida) {
  const ids = [...new Set(datos.lineas.map((l) => l.cuentaId))];
  const cuentas = await unidad.cuentas(empresaId, ids);
  const { errores } = validarPartida(datos.lineas, new Map(cuentas.map((c) => [c.id, c])));
  if (errores.length > 0) throw new LineasInvalidasError(errores);
}

async function leerGuardada(unidad: UnidadPartidas, empresaId: string, id: string): Promise<PartidaVista> {
  const partida = await unidad.leer(empresaId, id);
  if (!partida) throw new Error(`La partida ${id} no se encontró después de guardarla`);
  return partida;
}

const SIN_PERMISO_REGISTRAR = "Su rol no permite registrar partidas en esta empresa.";

/**
 * Registrar y editar partidas en borrador (HU-20, S1-T78). La partida queda en borrador y sin número;
 * el correlativo se asigna al contabilizarla (HU-22).
 */
@Injectable()
export class PartidasBorrador {
  constructor(@Inject(REPOSITORIO_PARTIDAS) private readonly repositorio: RepositorioPartidas) {}

  crear(usuarioId: string, empresaId: string, datos: CrearPartida): Promise<PartidaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_REGISTRAR_PARTIDAS,
        SIN_PERMISO_REGISTRAR,
      );
      if (!puedeUsarSucursal(acceso, datos.sucursalId)) throw new SucursalNoAutorizadaError();
      await validarLineas(unidad, empresaId, datos);
      const id = await unidad.crear(empresaId, datos);
      return leerGuardada(unidad, empresaId, id);
    });
  }

  editar(
    usuarioId: string,
    empresaId: string,
    partidaId: string,
    datos: CrearPartida,
  ): Promise<PartidaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_REGISTRAR_PARTIDAS,
        SIN_PERMISO_REGISTRAR,
      );
      const actual = await unidad.bloquear(empresaId, partidaId);
      // Una partida de una sucursal que no ve se trata como inexistente, igual que la de otra empresa
      if (!actual || !puedeUsarSucursal(acceso, actual.sucursalId)) throw new PartidaNoEncontradaError();
      if (actual.estado !== "borrador") throw new NoEsBorradorError(actual.estado);
      if (!puedeUsarSucursal(acceso, datos.sucursalId)) throw new SucursalNoAutorizadaError();
      await validarLineas(unidad, empresaId, datos);
      await unidad.reemplazar(partidaId, datos);
      return leerGuardada(unidad, empresaId, partidaId);
    });
  }

  consultar(usuarioId: string, empresaId: string, partidaId: string): Promise<PartidaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_VER_PARTIDAS,
        "Su rol no permite consultar partidas en esta empresa.",
      );
      const partida = await unidad.leer(empresaId, partidaId);
      if (!partida || !puedeUsarSucursal(acceso, partida.sucursalId)) throw new PartidaNoEncontradaError();
      return partida;
    });
  }
}
