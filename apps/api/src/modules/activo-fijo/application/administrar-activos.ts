import { Inject, Injectable } from "@nestjs/common";
import {
  validarPartida,
  type ActivoFijoVista,
  type CrearActivoFijo,
  type DarBajaActivo,
  type LineaPartida,
  type ResultadoAltaActivo,
  type ResultadoBajaActivo,
} from "@contable/shared";
import {
  ActivoNoEncontradoError,
  ActivoYaDadoDeBajaError,
  CUENTAS_GASTO_DEPRECIACION,
  CUENTAS_POR_CATEGORIA,
  CUENTA_PERDIDA_BAJA,
  CuentaInvalidaError,
  EmpresaNoEncontradaError,
  FechaBajaInvalidaError,
  PERMISO_REGISTRAR_ACTIVOS,
  PERMISO_VER_ACTIVOS,
  PartidaInvalidaError,
  SinPermisoActivoFijoError,
  SucursalNoAutorizadaError,
  lineasDeAlta,
  lineasDeBaja,
  type CuentaCatalogo,
} from "../domain/activo-fijo.js";
import {
  puedeUsarSucursal,
  REPOSITORIO_ACTIVO_FIJO,
  type AccesoActivos,
  type RepositorioActivoFijo,
  type UnidadActivoFijo,
} from "../domain/repositorio-activo-fijo.js";

async function acceso(unidad: UnidadActivoFijo, usuarioId: string, empresaId: string, permiso: string) {
  const a = await unidad.acceso(usuarioId, empresaId);
  if (!a) throw new EmpresaNoEncontradaError();
  if (!a.permisos.has(permiso)) throw new SinPermisoActivoFijoError();
  return a;
}

/** Cuenta imputable y activa con el id pedido, o la primera de los códigos predeterminados que lo sea. */
async function resolverCuenta(
  unidad: UnidadActivoFijo,
  empresaId: string,
  id: string | undefined,
  codigos: readonly string[],
  descripcion: string,
): Promise<CuentaCatalogo> {
  if (id) {
    const [cuenta] = await unidad.cuentasPorId(empresaId, [id]);
    if (!cuenta)
      throw new CuentaInvalidaError(`La cuenta de ${descripcion} no existe en el catálogo de la empresa.`);
    return exigirUsable(cuenta, descripcion);
  }
  const candidatas = await unidad.cuentasPorCodigo(empresaId, codigos);
  const cuenta = codigos
    .map((c) => candidatas.find((x) => x.codigo === c))
    .find((c): c is CuentaCatalogo => c !== undefined && c.activa && c.imputable);
  if (!cuenta) {
    throw new CuentaInvalidaError(
      `No hay una cuenta predeterminada de ${descripcion} (${codigos.join(" o ")}) disponible: indique la cuenta.`,
    );
  }
  return cuenta;
}

/** Clase de la cuenta: su primer dígito (1 activo, 4 costos y gastos). */
function exigirClase(cuenta: CuentaCatalogo, clase: string, descripcion: string): CuentaCatalogo {
  if (!cuenta.codigo.startsWith(clase)) {
    throw new CuentaInvalidaError(
      `La cuenta de ${descripcion} (${cuenta.codigo}) debe ser de la clase ${clase} del catálogo.`,
    );
  }
  return cuenta;
}

function exigirUsable(cuenta: CuentaCatalogo, descripcion: string): CuentaCatalogo {
  if (!cuenta.activa)
    throw new CuentaInvalidaError(`La cuenta de ${descripcion} (${cuenta.codigo}) está inactiva.`);
  if (!cuenta.imputable) {
    throw new CuentaInvalidaError(`La cuenta de ${descripcion} (${cuenta.codigo}) no es de último nivel.`);
  }
  return cuenta;
}

/** Valida las líneas con las mismas reglas que una partida manual antes de dejar que la base la contabilice. */
async function validarLineas(unidad: UnidadActivoFijo, empresaId: string, lineas: LineaPartida[]) {
  const cuentas = await unidad.cuentasPorId(empresaId, [...new Set(lineas.map((l) => l.cuentaId))]);
  const info = new Map(
    cuentas.map((c) => [c.id, { id: c.id, codigo: c.codigo, activa: c.activa, imputable: c.imputable }]),
  );
  const r = validarPartida(lineas, info);
  if (!r.puedeContabilizarse) {
    throw new PartidaInvalidaError(r.errores[0]?.mensaje ?? "La partida generada no cuadra.");
  }
}

/**
 * Casos de uso de los activos fijos (HU-81): listar, registrar con su partida de adquisición y dar de baja con su
 * partida. Cada operación es una transacción; si la partida es rechazada (período cerrado, por ejemplo) el activo
 * tampoco se registra.
 */
@Injectable()
export class AdministrarActivos {
  constructor(@Inject(REPOSITORIO_ACTIVO_FIJO) private readonly repositorio: RepositorioActivoFijo) {}

  listar(usuarioId: string, empresaId: string): Promise<ActivoFijoVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const a = await acceso(unidad, usuarioId, empresaId, PERMISO_VER_ACTIVOS);
      return unidad.listar(empresaId, a.todasSucursales ? null : a.sucursales);
    });
  }

  registrar(usuarioId: string, empresaId: string, datos: CrearActivoFijo): Promise<ResultadoAltaActivo> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const a = await acceso(unidad, usuarioId, empresaId, PERMISO_REGISTRAR_ACTIVOS);
      await exigirSucursal(unidad, a, empresaId, datos.sucursalId);

      const porDefecto = CUENTAS_POR_CATEGORIA[datos.categoria];
      const cuentaActivo = await resolverCuenta(
        unidad,
        empresaId,
        datos.cuentaActivoId,
        [porDefecto.activo],
        "activo fijo",
      );
      const cuentaDepreciacion = await resolverCuenta(
        unidad,
        empresaId,
        datos.cuentaDepreciacionId,
        [porDefecto.depreciacion],
        "depreciación acumulada",
      );
      const cuentaGasto = await resolverCuenta(
        unidad,
        empresaId,
        datos.cuentaGastoId,
        CUENTAS_GASTO_DEPRECIACION,
        "gasto por depreciación",
      );
      exigirClase(cuentaActivo, "1", "activo fijo");
      exigirClase(cuentaDepreciacion, "1", "depreciación acumulada");
      exigirClase(cuentaGasto, "4", "gasto por depreciación");
      const contrapartida = datos.contrapartidaId
        ? await resolverCuenta(unidad, empresaId, datos.contrapartidaId, [], "contrapartida")
        : null;

      const activoId = await unidad.insertar(empresaId, usuarioId, {
        nombre: datos.nombre,
        categoria: datos.categoria,
        sucursalId: datos.sucursalId,
        costo: datos.costo,
        valorResidual: datos.valorResidual,
        fechaAdquisicion: datos.fechaAdquisicion,
        vidaUtilAnios: datos.vidaUtilAnios,
        cuentaActivoId: cuentaActivo.id,
        cuentaDepreciacionId: cuentaDepreciacion.id,
        cuentaGastoId: cuentaGasto.id,
      });

      let partida = null;
      if (contrapartida) {
        const creado = await unidad.obtener(empresaId, activoId);
        if (!creado) throw new ActivoNoEncontradoError();
        const lineas = lineasDeAlta(datos.costo, cuentaActivo.id, contrapartida.id);
        await validarLineas(unidad, empresaId, lineas);
        partida = await unidad.contabilizarPartida(empresaId, {
          sucursalId: datos.sucursalId,
          fecha: datos.fechaAdquisicion,
          concepto: `Adquisición de activo fijo ${creado.codigo} · ${creado.nombre}`,
          origenId: activoId,
          lineas,
        });
        await unidad.vincularAlta(activoId, partida.id);
      }

      const activo = await unidad.obtener(empresaId, activoId);
      if (!activo) throw new ActivoNoEncontradoError();
      return { activo, partida };
    });
  }

  darDeBaja(
    usuarioId: string,
    empresaId: string,
    activoId: string,
    datos: DarBajaActivo,
  ): Promise<ResultadoBajaActivo> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const a = await acceso(unidad, usuarioId, empresaId, PERMISO_REGISTRAR_ACTIVOS);
      const actual = await unidad.obtener(empresaId, activoId, true);
      // Un activo de una sucursal que no ve se trata como inexistente
      if (!actual || !puedeUsarSucursal(a, actual.sucursalId)) throw new ActivoNoEncontradoError();
      if (actual.estado === "de_baja") throw new ActivoYaDadoDeBajaError(actual.codigo);
      if (datos.fecha < actual.fechaAdquisicion) {
        throw new FechaBajaInvalidaError(
          `La baja no puede ser anterior a la adquisición (${actual.fechaAdquisicion}).`,
        );
      }
      if (actual.ultimoMesDepreciado && datos.fecha.slice(0, 7) < actual.ultimoMesDepreciado.slice(0, 7)) {
        throw new FechaBajaInvalidaError(
          `El activo ya se depreció hasta ${actual.ultimoMesDepreciado.slice(0, 7)}: la baja no puede ser anterior a ese mes.`,
        );
      }

      const perdida = await resolverCuenta(
        unidad,
        empresaId,
        datos.cuentaPerdidaId,
        [CUENTA_PERDIDA_BAJA],
        "pérdida por baja",
      );
      const lineas = lineasDeBaja(actual, perdida.id);
      await validarLineas(unidad, empresaId, lineas);
      const partida = await unidad.contabilizarPartida(empresaId, {
        sucursalId: actual.sucursalId,
        fecha: datos.fecha,
        concepto: `Baja de activo fijo ${actual.codigo} · ${actual.nombre}`,
        origenId: actual.id,
        lineas,
      });
      await unidad.registrarBaja(actual.id, datos.fecha, partida.id);
      const activo = await unidad.obtener(empresaId, actual.id);
      if (!activo) throw new ActivoNoEncontradoError();
      return { activo, partida };
    });
  }
}

async function exigirSucursal(
  unidad: UnidadActivoFijo,
  a: AccesoActivos,
  empresaId: string,
  sucursalId: string,
) {
  if (!puedeUsarSucursal(a, sucursalId) || !(await unidad.existeSucursal(empresaId, sucursalId))) {
    throw new SucursalNoAutorizadaError();
  }
}
