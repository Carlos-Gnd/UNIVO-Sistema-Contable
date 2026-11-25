import { Inject, Injectable } from "@nestjs/common";
import {
  Dinero,
  ExistenciasProducto,
  cantidadTomaEsCero,
  costoTotalDeEntrada,
  costoTotalDeSeries,
  costoUnitarioDeTotal,
  diferenciaCantidadToma,
  distribuirCostoPorUnidad,
  sumarCantidadesToma,
  type AprobarTomaFisica,
  type CrearTomaFisica,
  type DetalleTomaFisicaVista,
  type MetodoValuacionKardex,
  type TomaFisicaVista,
} from "@contable/shared";
import {
  REPOSITORIO_INVENTARIO,
  ReglaProductoError,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
  type RepositorioInventario,
  type UnidadInventario,
} from "../domain/producto.js";
import {
  TomaFisicaNoEncontradaError,
  TomaFisicaSinPermisoError,
  type LineaPartidaTomaFisica,
  type TomaFisicaRegistro,
  type ValorFinalTomaFisica,
} from "../domain/toma-fisica.js";

async function exigirPermiso(
  unidad: UnidadInventario,
  usuarioId: string,
  empresaId: string,
  permiso: string,
): Promise<void> {
  if (!(await unidad.acceso(usuarioId, empresaId))) throw new TomaFisicaNoEncontradaError();
  if (!(await unidad.permisos(usuarioId, empresaId)).includes(permiso)) throw new TomaFisicaSinPermisoError();
}

async function exigirSucursal(
  unidad: UnidadInventario,
  usuarioId: string,
  empresaId: string,
  sucursalId: string,
): Promise<void> {
  if (!(await unidad.existeSucursal(empresaId, sucursalId))) throw new SucursalNoEncontradaError();
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new TomaFisicaNoEncontradaError();
  if (!acceso.todasSucursales && !acceso.sucursales.includes(sucursalId)) {
    throw new SucursalNoAutorizadaError();
  }
}

function existenciaDesdeMovimientos(
  movimientos: Awaited<ReturnType<UnidadInventario["movimientos"]>>,
  metodo: MetodoValuacionKardex,
): ExistenciasProducto {
  const existencia = new ExistenciasProducto(metodo);
  for (const movimiento of movimientos) {
    if (movimiento.tipo === "entrada") existencia.entrada(movimiento.cantidad, movimiento.costoTotal);
    else if (metodo === "especifico") existencia.salidaEspecifica(movimiento.cantidad, movimiento.costoTotal);
    else existencia.salida(movimiento.cantidad);
  }
  return existencia;
}

function enteras(cantidad: string): bigint | null {
  const partes = /^(\d+)\.0000$/.exec(cantidad);
  return partes ? BigInt(partes[1]!) : null;
}

function cantidadUnidades(unidades: number): string {
  return `${unidades}.0000`;
}

function numeroSerieEnSet(series: readonly string[], numero: string): boolean {
  return series.includes(numero);
}

@Injectable()
export class CasosTomaFisica {
  constructor(@Inject(REPOSITORIO_INVENTARIO) private readonly repositorio: RepositorioInventario) {}

  consultar(usuarioId: string, empresaId: string, sucursalId: string): Promise<TomaFisicaVista | null> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirPermiso(unidad, usuarioId, empresaId, "inventario.ver");
      await exigirSucursal(unidad, usuarioId, empresaId, sucursalId);
      const tomaId = await unidad.ultimaTomaFisica(empresaId, sucursalId);
      if (!tomaId) return null;
      const toma = await unidad.leerTomaFisica(empresaId, tomaId);
      return toma ? presentar(unidad, toma) : null;
    });
  }

  crear(usuarioId: string, empresaId: string, datos: CrearTomaFisica): Promise<TomaFisicaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirPermiso(unidad, usuarioId, empresaId, "inventario.contar");
      await exigirSucursal(unidad, usuarioId, empresaId, datos.sucursalId);
      const id = await unidad.crearTomaFisica(empresaId, datos.sucursalId, datos.fecha, usuarioId);
      const toma = await unidad.leerTomaFisica(empresaId, id);
      if (!toma) throw new Error("La base no devolvió la toma física creada.");
      return presentar(unidad, toma);
    });
  }

  guardar(
    usuarioId: string,
    empresaId: string,
    tomaId: string,
    lineas: NonNullable<Parameters<UnidadInventario["guardarConteoTomaFisica"]>[2]>,
  ): Promise<TomaFisicaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirPermiso(unidad, usuarioId, empresaId, "inventario.contar");
      const toma = await unidad.leerTomaFisica(empresaId, tomaId, true);
      if (!toma) throw new TomaFisicaNoEncontradaError();
      await exigirSucursal(unidad, usuarioId, empresaId, toma.sucursalId);
      if (toma.estado !== "en_conteo") throw new ReglaProductoError("La toma física ya está aprobada.");
      for (const linea of lineas) {
        const detalle = toma.detalles.find((actual) => actual.productoId === linea.productoId);
        if (!detalle) throw new ReglaProductoError("El producto no forma parte de esta toma física.");
        if (detalle.controlaSeries) {
          const unidades = enteras(linea.cantidadContada);
          if (unidades === null || unidades !== BigInt(linea.seriesContadas?.length ?? 0)) {
            throw new ReglaProductoError("Registra una serie o IMEI por cada unidad contada.");
          }
        } else if (linea.seriesContadas?.length) {
          throw new ReglaProductoError("Este producto no está configurado para controlar series.");
        }
      }
      await unidad.guardarConteoTomaFisica(empresaId, tomaId, lineas);
      const guardada = await unidad.leerTomaFisica(empresaId, tomaId);
      if (!guardada) throw new TomaFisicaNoEncontradaError();
      return presentar(unidad, guardada);
    });
  }

  aprobar(
    usuarioId: string,
    empresaId: string,
    tomaId: string,
    datos: AprobarTomaFisica,
  ): Promise<TomaFisicaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirPermiso(unidad, usuarioId, empresaId, "inventario.aprobar_ajuste");
      const toma = await unidad.leerTomaFisica(empresaId, tomaId, true);
      if (!toma) throw new TomaFisicaNoEncontradaError();
      await exigirSucursal(unidad, usuarioId, empresaId, toma.sucursalId);
      if (toma.estado !== "en_conteo") throw new ReglaProductoError("La toma física ya fue aprobada.");
      if (toma.detalles.some((detalle) => detalle.cantidadContada === null)) {
        throw new ReglaProductoError("Completa el conteo de todos los productos antes de aprobar.");
      }

      const ordenados = [...toma.detalles].sort((a, b) => a.productoId.localeCompare(b.productoId));
      for (const detalle of ordenados) await unidad.bloquearProducto(detalle.productoId);
      const costosSobrantes = new Map(
        datos.costosSobrantes.map((costo) => [costo.productoId, costo.costoUnitario]),
      );
      const costosUsados = new Set<string>();
      const valores: ValorFinalTomaFisica[] = [];
      let totalFaltantes = Dinero.cero();
      let totalSobrantes = Dinero.cero();

      for (const detalle of ordenados) {
        const secuencia = await unidad.ultimaSecuenciaMovimiento(detalle.productoId, toma.sucursalId);
        if (secuencia !== BigInt(detalle.secuenciaSistema)) {
          throw new ReglaProductoError(
            `El inventario de ${detalle.codigo} cambió después de iniciar el conteo. Inicia una nueva toma física.`,
          );
        }
        const movimientos = await unidad.movimientos(detalle.productoId, toma.sucursalId);
        const metodo = detalle.controlaSeries
          ? "especifico"
          : (detalle.metodoValuacion ?? (await unidad.metodoDeEmpresa(empresaId)));
        const existencia = existenciaDesdeMovimientos(movimientos, metodo);
        if (!detalle.cantidadContada) throw new ReglaProductoError("Falta el conteo de un producto.");
        const diferencia = diferenciaCantidadToma(detalle.cantidadContada, detalle.existenciaSistema);
        let cantidadFaltante = "0.0000";
        let cantidadSobrante = "0.0000";
        let valorFaltante = "0.00";
        let valorSobrante = "0.00";

        if (detalle.controlaSeries) {
          const serieConteo = detalle.seriesContadas ?? [];
          const actuales = await unidad.series(
            empresaId,
            detalle.productoId,
            toma.sucursalId,
            "en_existencia",
          );
          if (cantidadUnidades(actuales.length) !== detalle.existenciaSistema) {
            throw new ReglaProductoError(
              `Las series en existencia de ${detalle.codigo} no coinciden con el saldo del kardex.`,
            );
          }
          const numerosActuales = actuales.map((serie) => serie.numeroSerie);
          const faltantes = actuales.filter((serie) => !numeroSerieEnSet(serieConteo, serie.numeroSerie));
          const sobrantes = serieConteo.filter((serie) => !numerosActuales.includes(serie));
          if (faltantes.length) {
            const cantidad = cantidadUnidades(faltantes.length);
            cantidadFaltante = cantidad;
            valorFaltante = costoTotalDeSeries(faltantes.map((serie) => serie.costoUnitario));
            existencia.salidaEspecifica(cantidad, valorFaltante);
            await unidad.registrarMovimiento({
              empresaId,
              sucursalId: toma.sucursalId,
              productoId: detalle.productoId,
              fecha: toma.fecha,
              tipo: "salida",
              cantidad,
              costoUnitario: costoUnitarioDeTotal(valorFaltante, cantidad),
              costoTotal: valorFaltante,
              referencia: `Toma física ${toma.id}`,
              series: faltantes.map((serie) => ({
                numeroSerie: serie.numeroSerie,
                costoUnitario: serie.costoUnitario,
              })),
            });
          }
          if (sobrantes.length) {
            const costoUnitario = costosSobrantes.get(detalle.productoId);
            if (costoUnitario === undefined) {
              throw new ReglaProductoError(`Indica el costo unitario de los sobrantes de ${detalle.codigo}.`);
            }
            costosUsados.add(detalle.productoId);
            const cantidad = cantidadUnidades(sobrantes.length);
            cantidadSobrante = cantidad;
            valorSobrante = costoTotalDeEntrada(cantidad, costoUnitario);
            existencia.entrada(cantidad, valorSobrante);
            const costos = distribuirCostoPorUnidad(valorSobrante, sobrantes.length);
            await unidad.registrarMovimiento({
              empresaId,
              sucursalId: toma.sucursalId,
              productoId: detalle.productoId,
              fecha: toma.fecha,
              tipo: "entrada",
              cantidad,
              costoUnitario: costoUnitarioDeTotal(valorSobrante, cantidad),
              costoTotal: valorSobrante,
              referencia: `Toma física ${toma.id}`,
              series: sobrantes.map((numeroSerie, indice) => ({
                numeroSerie,
                costoUnitario: costos[indice]!,
              })),
            });
          }
        } else if (!cantidadTomaEsCero(diferencia)) {
          if (diferencia.startsWith("-")) {
            const cantidad = diferencia.slice(1);
            cantidadFaltante = cantidad;
            valorFaltante = existencia.salida(cantidad);
            await unidad.registrarMovimiento({
              empresaId,
              sucursalId: toma.sucursalId,
              productoId: detalle.productoId,
              fecha: toma.fecha,
              tipo: "salida",
              cantidad,
              costoUnitario: costoUnitarioDeTotal(valorFaltante, cantidad),
              costoTotal: valorFaltante,
              referencia: `Toma física ${toma.id}`,
              series: null,
            });
          } else {
            const costoUnitario = costosSobrantes.get(detalle.productoId);
            if (costoUnitario === undefined) {
              throw new ReglaProductoError(`Indica el costo unitario de los sobrantes de ${detalle.codigo}.`);
            }
            costosUsados.add(detalle.productoId);
            const cantidad = diferencia;
            cantidadSobrante = cantidad;
            valorSobrante = costoTotalDeEntrada(cantidad, costoUnitario);
            existencia.entrada(cantidad, valorSobrante);
            await unidad.registrarMovimiento({
              empresaId,
              sucursalId: toma.sucursalId,
              productoId: detalle.productoId,
              fecha: toma.fecha,
              tipo: "entrada",
              cantidad,
              costoUnitario,
              costoTotal: valorSobrante,
              referencia: `Toma física ${toma.id}`,
              series: null,
            });
          }
        }

        totalFaltantes = totalFaltantes.mas(valorFaltante);
        totalSobrantes = totalSobrantes.mas(valorSobrante);
        valores.push({
          productoId: detalle.productoId,
          cantidadFaltante,
          cantidadSobrante,
          valorFaltante,
          valorSobrante,
          valorFinal: existencia.saldo().costoTotal,
        });
      }

      for (const productoId of costosSobrantes.keys()) {
        if (!costosUsados.has(productoId)) {
          throw new ReglaProductoError("Indica el costo solo para productos que tengan unidades sobrantes.");
        }
      }

      const lineas = await this.lineasPartida(unidad, empresaId, datos, totalFaltantes, totalSobrantes);
      const partidaId =
        lineas.length > 0
          ? await unidad.crearPartidaTomaFisica(empresaId, toma.id, toma.sucursalId, toma.fecha, lineas)
          : null;
      await unidad.finalizarTomaFisica(empresaId, toma.id, partidaId, usuarioId, valores);
      const aprobada = await unidad.leerTomaFisica(empresaId, toma.id);
      if (!aprobada) throw new TomaFisicaNoEncontradaError();
      return presentar(unidad, aprobada);
    });
  }

  private async lineasPartida(
    unidad: UnidadInventario,
    empresaId: string,
    datos: AprobarTomaFisica,
    faltantes: Dinero,
    sobrantes: Dinero,
  ): Promise<LineaPartidaTomaFisica[]> {
    if (!faltantes.mayorQue(0) && !sobrantes.mayorQue(0)) return [];
    const inventario = await unidad.cuentaTomaFisicaPorCodigo(empresaId, "1109");
    if (!inventario || !inventario.activa || !inventario.imputable) {
      throw new ReglaProductoError("La cuenta de inventario 1109 debe estar activa y ser imputable.");
    }
    if (faltantes.mayorQue(0) && !datos.cuentaFaltantesId) {
      throw new ReglaProductoError("Elige la cuenta contra inventario para los faltantes.");
    }
    if (sobrantes.mayorQue(0) && !datos.cuentaSobrantesId) {
      throw new ReglaProductoError("Elige la cuenta contra inventario para los sobrantes.");
    }
    const ids = [
      ...new Set(
        [datos.cuentaFaltantesId, datos.cuentaSobrantesId].filter((id): id is string => Boolean(id)),
      ),
    ];
    const cuentas = await unidad.cuentasTomaFisica(empresaId, ids);
    if (cuentas.length !== ids.length)
      throw new ReglaProductoError("Elige cuentas del catálogo de esta empresa.");
    for (const cuenta of cuentas) {
      if (!cuenta.activa || !cuenta.imputable || cuenta.codigo === "1109") {
        throw new ReglaProductoError(
          "Las cuentas contra inventario deben estar activas, ser imputables y distintas de 1109.",
        );
      }
    }
    const lineas: LineaPartidaTomaFisica[] = [];
    if (faltantes.mayorQue(0)) {
      const cuentaFaltantesId = datos.cuentaFaltantesId;
      if (!cuentaFaltantesId)
        throw new ReglaProductoError("Elige la cuenta contra inventario para los faltantes.");
      lineas.push(
        {
          cuentaId: cuentaFaltantesId,
          debe: faltantes.aTexto(),
          haber: "0.00",
          concepto: "Pérdida por faltantes de inventario",
        },
        {
          cuentaId: inventario.id,
          debe: "0.00",
          haber: faltantes.aTexto(),
          concepto: "Disminución de inventario por faltantes",
        },
      );
    }
    if (sobrantes.mayorQue(0)) {
      const cuentaSobrantesId = datos.cuentaSobrantesId;
      if (!cuentaSobrantesId)
        throw new ReglaProductoError("Elige la cuenta contra inventario para los sobrantes.");
      lineas.push(
        {
          cuentaId: inventario.id,
          debe: sobrantes.aTexto(),
          haber: "0.00",
          concepto: "Aumento de inventario por sobrantes",
        },
        {
          cuentaId: cuentaSobrantesId,
          debe: "0.00",
          haber: sobrantes.aTexto(),
          concepto: "Ingreso por sobrantes de inventario",
        },
      );
    }
    return lineas;
  }
}

async function presentar(unidad: UnidadInventario, toma: TomaFisicaRegistro): Promise<TomaFisicaVista> {
  const detalles: DetalleTomaFisicaVista[] = [];
  let haySobranteSinValorar = false;
  let productosConDiferencia = 0;
  const faltantes: string[] = [];
  const sobrantes: string[] = [];

  for (const detalle of toma.detalles) {
    const diferencia =
      detalle.cantidadContada === null
        ? null
        : diferenciaCantidadToma(detalle.cantidadContada, detalle.existenciaSistema);
    let valorFaltante = detalle.valorFaltante;
    let valorSobrante = detalle.valorSobrante;
    let cantidadFaltante = detalle.cantidadFaltante;
    let cantidadSobrante = detalle.cantidadSobrante;
    let cambioSeries = false;
    if (detalle.controlaSeries && detalle.cantidadContada !== null) {
      const disponibles = await unidad.series(
        toma.empresaId,
        detalle.productoId,
        toma.sucursalId,
        "en_existencia",
      );
      const contadas = detalle.seriesContadas ?? [];
      const actuales = disponibles.map((serie) => serie.numeroSerie);
      cambioSeries =
        actuales.length !== contadas.length || actuales.some((serie) => !contadas.includes(serie));
      if (toma.estado === "en_conteo") {
        const faltan = disponibles.filter((serie) => !contadas.includes(serie.numeroSerie));
        const sobran = contadas.filter((serie) => !actuales.includes(serie));
        cantidadFaltante = cantidadUnidades(faltan.length);
        cantidadSobrante = cantidadUnidades(sobran.length);
        valorFaltante = costoTotalDeSeries(faltan.map((serie) => serie.costoUnitario));
        valorSobrante = sobran.length ? null : "0.00";
      }
    } else if (toma.estado === "en_conteo" && diferencia !== null) {
      if (diferencia.startsWith("-")) {
        cantidadFaltante = diferencia.slice(1);
        const movimientos = await unidad.movimientos(detalle.productoId, toma.sucursalId);
        const metodo = detalle.metodoValuacion ?? (await unidad.metodoDeEmpresa(toma.empresaId));
        valorFaltante = existenciaDesdeMovimientos(movimientos, metodo).salida(diferencia.slice(1));
        valorSobrante = "0.00";
      } else if (cantidadTomaEsCero(diferencia)) {
        cantidadFaltante = "0.0000";
        cantidadSobrante = "0.0000";
        valorFaltante = "0.00";
        valorSobrante = "0.00";
      } else {
        cantidadFaltante = "0.0000";
        cantidadSobrante = diferencia;
        valorFaltante = "0.00";
        valorSobrante = null;
      }
    }

    if (diferencia !== null) {
      if (cantidadFaltante !== null) faltantes.push(cantidadFaltante);
      if (cantidadSobrante !== null) sobrantes.push(cantidadSobrante);
    }
    if (
      (cantidadFaltante !== null && !cantidadTomaEsCero(cantidadFaltante)) ||
      (cantidadSobrante !== null && !cantidadTomaEsCero(cantidadSobrante)) ||
      cambioSeries
    ) {
      productosConDiferencia += 1;
    }
    if (valorSobrante === null) haySobranteSinValorar = true;
    detalles.push({
      productoId: detalle.productoId,
      codigo: detalle.codigo,
      nombre: detalle.nombre,
      unidadMedida: detalle.unidadMedida,
      controlaSeries: detalle.controlaSeries,
      existenciaSistema: detalle.existenciaSistema,
      cantidadContada: detalle.cantidadContada,
      diferencia,
      cantidadFaltante,
      cantidadSobrante,
      seriesContadas: detalle.seriesContadas,
      valorFaltante,
      valorSobrante,
      valorFinal: detalle.valorFinal,
    });
  }

  return {
    id: toma.id,
    sucursalId: toma.sucursalId,
    fecha: toma.fecha,
    estado: toma.estado,
    partidaId: toma.partidaId,
    creadoEn: toma.creadoEn.toISOString(),
    aprobadoEn: toma.aprobadoEn?.toISOString() ?? null,
    detalles,
    resumen: {
      productosConDiferencia,
      cantidadFaltante: sumarCantidadesToma(faltantes),
      cantidadSobrante: sumarCantidadesToma(sobrantes),
      valorFaltante: Dinero.sumar(detalles.map((detalle) => detalle.valorFaltante ?? "0.00")).aTexto(),
      valorSobrante: haySobranteSinValorar
        ? null
        : Dinero.sumar(detalles.map((detalle) => detalle.valorSobrante ?? "0.00")).aTexto(),
    },
  };
}
