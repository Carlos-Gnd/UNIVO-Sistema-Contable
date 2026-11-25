import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { comoUsuario, Prisma, type Tx } from "@contable/db";
import type {
  CrearRespaldo,
  ResultadoRestauracionRespaldo,
  RespaldoVista,
  RestaurarRespaldo,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import {
  RespaldoSinSecretoError,
  EmpresaRespaldoNoEncontradaError,
  EmpresaRespaldoNoVaciaError,
  FORMATO_RESPALDO,
  RespaldoInvalidoError,
  RespaldoNoEncontradoError,
  RespaldoSucursalNoRestaurableError,
  SinPermisoRespaldoError,
  SucursalRespaldoNoAutorizadaError,
  type ArchivoRespaldo,
  type ContenidoRespaldo,
  type RepositorioRespaldos,
} from "../domain/respaldo.js";

interface AccesoFila {
  todas_sucursales: boolean;
  sucursales: string[];
  permisos: string[];
}

interface RespaldoGuardado {
  id: string;
  tipo: "empresa" | "sucursal";
  sucursalId: string | null;
  nombreArchivo: string;
  sha256: string;
  creadoEn: Date;
  sucursal?: { nombre: string } | null;
  contenido?: Prisma.JsonValue;
}

type FilaJson = Record<string, unknown>;

function canonizar(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(canonizar).join(",")}]`;
  const objeto = valor as Record<string, unknown>;
  return `{${Object.keys(objeto)
    .sort()
    .map((clave) => `${JSON.stringify(clave)}:${canonizar(objeto[clave])}`)
    .join(",")}}`;
}

/** HMAC-SHA256 con un secreto del servidor: prueba que el contenido lo generó esta API y no fue alterado. */
function huella(contenido: ContenidoRespaldo): string {
  const secreto = process.env["RESPALDO_HMAC_SECRETO"];
  if (!secreto || secreto.length < 32) throw new RespaldoSinSecretoError();
  return createHmac("sha256", secreto).update(canonizar(contenido)).digest("hex");
}

function huellaValida(contenido: ContenidoRespaldo, guardada: string): boolean {
  const esperada = Buffer.from(huella(contenido), "hex");
  const recibida = Buffer.from(guardada.trim(), "hex");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

function serializarFilas(filas: readonly object[]): FilaJson[] {
  const json = JSON.stringify(filas, (_clave, valor: unknown) =>
    typeof valor === "bigint" ? valor.toString() : valor,
  );
  const normalizadas = JSON.parse(json) as Record<string, unknown>[];
  return normalizadas.map((fila) =>
    Object.fromEntries(
      Object.entries(fila).map(([clave, valor]) => [
        clave.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`),
        valor,
      ]),
    ),
  );
}

function fechaArchivo(fecha: Date): string {
  return fecha
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function vista(respaldo: RespaldoGuardado): RespaldoVista {
  return {
    id: respaldo.id,
    tipo: respaldo.tipo,
    sucursalId: respaldo.sucursalId,
    sucursal: respaldo.sucursal?.nombre ?? null,
    nombreArchivo: respaldo.nombreArchivo,
    sha256: respaldo.sha256.trim(),
    creadoEn: respaldo.creadoEn.toISOString(),
  };
}

async function acceso(tx: Tx, usuarioId: string, empresaId: string, permiso: string): Promise<AccesoFila> {
  const [fila] = await tx.$queryRaw<AccesoFila[]>`
    SELECT m.todas_sucursales,
           ARRAY(SELECT ms.sucursal_id::text FROM membresia_sucursales ms WHERE ms.membresia_id = m.id)
             AS sucursales,
           ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                 WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos
    FROM membresias m
    JOIN usuarios u ON u.id = m.usuario_id AND u.activo
    JOIN empresas e ON e.id = m.empresa_id AND e.activa
    WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa
  `;
  if (!fila) throw new EmpresaRespaldoNoEncontradaError();
  if (!fila.permisos.includes(permiso)) throw new SinPermisoRespaldoError();
  return fila;
}

interface TablaExtra {
  tabla: string;
  /** Condición para un respaldo de sucursal; omitida, la tabla solo entra en el respaldo de la empresa. */
  filtroSucursal?: string;
}

const POR_CONCILIACION = `t.conciliacion_id IN (
  SELECT c.id FROM public.conciliaciones_bancarias c
  JOIN public.cuentas_tesoreria ct ON ct.id = c.cuenta_tesoreria_id
  WHERE ct.sucursal_id = $2::uuid)`;

/** Tablas de módulos posteriores: se vuelcan con to_jsonb, en el orden en que se restauran (padres primero). */
const TABLAS_EXTRA: readonly TablaExtra[] = [
  { tabla: "plantillas_recurrentes", filtroSucursal: "t.sucursal_id = $2::uuid" },
  {
    tabla: "plantilla_recurrente_lineas",
    filtroSucursal:
      "t.plantilla_id IN (SELECT id FROM public.plantillas_recurrentes WHERE sucursal_id = $2::uuid)",
  },
  { tabla: "configuraciones_isr" },
  { tabla: "tramos_isr" },
  { tabla: "cajas_chicas", filtroSucursal: "t.sucursal_id = $2::uuid" },
  {
    tabla: "vales_caja_chica",
    filtroSucursal: "t.caja_chica_id IN (SELECT id FROM public.cajas_chicas WHERE sucursal_id = $2::uuid)",
  },
  { tabla: "movimientos_bancarios", filtroSucursal: "t.sucursal_id = $2::uuid" },
  {
    tabla: "conciliaciones_bancarias",
    filtroSucursal:
      "t.cuenta_tesoreria_id IN (SELECT id FROM public.cuentas_tesoreria WHERE sucursal_id = $2::uuid)",
  },
  { tabla: "detalles_conciliacion_bancaria", filtroSucursal: POR_CONCILIACION },
  { tabla: "lineas_estado_cuenta", filtroSucursal: POR_CONCILIACION },
  { tabla: "series_inventario", filtroSucursal: "t.sucursal_id = $2::uuid" },
  { tabla: "tomas_fisicas", filtroSucursal: "t.sucursal_id = $2::uuid" },
  {
    tabla: "tomas_fisicas_detalles",
    filtroSucursal: "t.toma_fisica_id IN (SELECT id FROM public.tomas_fisicas WHERE sucursal_id = $2::uuid)",
  },
];

async function volcarTablaExtra(
  tx: Tx,
  extra: TablaExtra,
  empresaId: string,
  sucursalId: string | undefined,
): Promise<FilaJson[]> {
  if (sucursalId && !extra.filtroSucursal) return [];
  if (!/^[a-z_]+$/.test(extra.tabla)) throw new RespaldoInvalidoError();
  const filtro = sucursalId && extra.filtroSucursal ? `AND (${extra.filtroSucursal})` : "";
  const filas = await tx.$queryRawUnsafe<{ fila: FilaJson }[]>(
    `SELECT to_jsonb(t) AS fila FROM public."${extra.tabla}" t
     WHERE t.empresa_id = $1::uuid ${filtro} ORDER BY t.id`,
    ...(sucursalId ? [empresaId, sucursalId] : [empresaId]),
  );
  return serializarFilas(filas.map((f) => f.fila));
}

async function crearContenido(
  tx: Tx,
  empresaId: string,
  sucursalId: string | undefined,
): Promise<ContenidoRespaldo> {
  const empresa = await tx.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) throw new EmpresaRespaldoNoEncontradaError();
  const filtroSucursal = sucursalId ? { empresaId, sucursalId } : { empresaId };
  const esEmpresa = sucursalId === undefined;

  const [sucursales, cuentas, ejercicios, periodos, partidas, cuentaTesoreria, movimientos, empleados] =
    await Promise.all([
      tx.sucursal.findMany({
        where: sucursalId ? { id: sucursalId, empresaId } : { empresaId },
        orderBy: { id: "asc" },
      }),
      tx.cuenta.findMany({ where: { empresaId }, orderBy: [{ nivel: "asc" }, { codigo: "asc" }] }),
      esEmpresa
        ? tx.ejercicio.findMany({ where: { empresaId }, orderBy: { anio: "asc" } })
        : Promise.resolve([]),
      esEmpresa
        ? tx.periodo.findMany({ where: { empresaId }, orderBy: [{ fechaInicio: "asc" }] })
        : Promise.resolve([]),
      tx.partida.findMany({ where: filtroSucursal, orderBy: [{ fecha: "asc" }, { id: "asc" }] }),
      tx.cuentaTesoreria.findMany({ where: sucursalId ? { empresaId, sucursalId } : { empresaId } }),
      tx.movimientoInventario.findMany({
        where: filtroSucursal,
        orderBy: [{ fecha: "asc" }, { secuencia: "asc" }],
      }),
      tx.empleado.findMany({ where: filtroSucursal, orderBy: [{ apellidos: "asc" }, { nombres: "asc" }] }),
    ]);
  const partidaIds = partidas.map((partida) => partida.id);
  const productoIds = [...new Set(movimientos.map((movimiento) => movimiento.productoId))];
  const categoriasProductos = await tx.categoriaProducto.findMany({
    where: esEmpresa ? { empresaId } : { empresaId, productos: { some: { id: { in: productoIds } } } },
    orderBy: { nombre: "asc" },
  });
  const [
    detalles,
    versiones,
    productos,
    planillasCalculadas,
    presentaciones,
    configuraciones,
    tramos,
    correlativos,
    bitacora,
  ] = await Promise.all([
    tx.partidaDetalle.findMany({
      where: { empresaId, partidaId: { in: partidaIds } },
      orderBy: [{ partidaId: "asc" }, { orden: "asc" }],
    }),
    tx.partidaVersion.findMany({
      where: { empresaId, partidaId: { in: partidaIds } },
      orderBy: [{ partidaId: "asc" }, { version: "asc" }],
    }),
    tx.producto.findMany({
      where: esEmpresa ? { empresaId } : { empresaId, id: { in: productoIds } },
      orderBy: { codigo: "asc" },
    }),
    tx.planillaCalculada.findMany({ where: filtroSucursal, orderBy: [{ periodo: "asc" }, { id: "asc" }] }),
    esEmpresa
      ? tx.presentacionPlanilla.findMany({
          where: { empresaId },
          orderBy: [{ periodo: "asc" }, { tipo: "asc" }],
        })
      : Promise.resolve([]),
    esEmpresa
      ? tx.configuracionPlanilla.findMany({ where: { empresaId }, orderBy: { vigenteDesde: "asc" } })
      : Promise.resolve([]),
    esEmpresa
      ? tx.tramoRetencionPlanilla.findMany({
          where: { empresaId },
          orderBy: [{ configuracionId: "asc" }, { orden: "asc" }],
        })
      : Promise.resolve([]),
    esEmpresa
      ? tx.correlativo.findMany({ where: { empresaId }, orderBy: { ambito: "asc" } })
      : Promise.resolve([]),
    esEmpresa
      ? tx.bitacora.findMany({ where: { empresaId, tabla: { not: "respaldos" } }, orderBy: { id: "asc" } })
      : Promise.resolve([]),
  ]);

  const tablas: Record<string, FilaJson[]> = {
    sucursales: serializarFilas(sucursales),
    cuentas: serializarFilas(cuentas),
    ejercicios: serializarFilas(ejercicios),
    periodos: serializarFilas(periodos),
    partidas: serializarFilas(partidas),
    partida_detalles: serializarFilas(detalles),
    partida_versiones: serializarFilas(versiones),
    correlativos: serializarFilas(correlativos),
    cuentas_tesoreria: serializarFilas(cuentaTesoreria),
    categorias_producto: serializarFilas(categoriasProductos),
    productos: serializarFilas(productos),
    movimientos_inventario: serializarFilas(movimientos),
    empleados: serializarFilas(empleados),
    planillas_calculadas: serializarFilas(planillasCalculadas),
    planillas_presentaciones: serializarFilas(presentaciones),
    configuraciones_planilla: serializarFilas(configuraciones),
    tramos_retencion_planilla: serializarFilas(tramos),
    bitacora: serializarFilas(bitacora),
  };
  for (const extra of TABLAS_EXTRA) {
    tablas[extra.tabla] = await volcarTablaExtra(tx, extra, empresaId, sucursalId);
  }
  return {
    formato: FORMATO_RESPALDO,
    empresaId,
    tipo: sucursalId ? "sucursal" : "empresa",
    sucursalId: sucursalId ?? null,
    generadoEn: new Date().toISOString(),
    empresa: serializarFilas([empresa])[0]!,
    tablas,
  };
}

function esContenido(valor: unknown): valor is ContenidoRespaldo {
  if (typeof valor !== "object" || valor === null) return false;
  const contenido = valor as Partial<ContenidoRespaldo>;
  return (
    contenido.formato === FORMATO_RESPALDO &&
    typeof contenido.empresaId === "string" &&
    ((contenido.tipo === "empresa" && contenido.sucursalId === null) ||
      (contenido.tipo === "sucursal" && typeof contenido.sucursalId === "string")) &&
    typeof contenido.generadoEn === "string" &&
    typeof contenido.empresa === "object" &&
    contenido.empresa !== null &&
    typeof contenido.tablas === "object" &&
    contenido.tablas !== null &&
    Object.values(contenido.tablas).every(
      (filas) => Array.isArray(filas) && filas.every((fila) => typeof fila === "object" && fila !== null),
    )
  );
}

async function destinoVacio(tx: Tx, empresaId: string): Promise<boolean> {
  const [
    partidas,
    detalles,
    versiones,
    movimientos,
    productos,
    categorias,
    cajas,
    empleados,
    calculos,
    presentaciones,
    correlativos,
    ejercicios,
    configuraciones,
    periodosCerrados,
  ] = await Promise.all([
    tx.partida.count({ where: { empresaId } }),
    tx.partidaDetalle.count({ where: { empresaId } }),
    tx.partidaVersion.count({ where: { empresaId } }),
    tx.movimientoInventario.count({ where: { empresaId } }),
    tx.producto.count({ where: { empresaId } }),
    tx.categoriaProducto.count({ where: { empresaId } }),
    tx.cuentaTesoreria.count({ where: { empresaId } }),
    tx.empleado.count({ where: { empresaId } }),
    tx.planillaCalculada.count({ where: { empresaId } }),
    tx.presentacionPlanilla.count({ where: { empresaId } }),
    tx.correlativo.count({ where: { empresaId } }),
    tx.ejercicio.count({ where: { empresaId } }),
    tx.configuracionPlanilla.count({ where: { empresaId } }),
    tx.periodo.count({ where: { empresaId, estado: { not: "abierto" } } }),
  ]);
  // Cualquier otra tabla con datos de la empresa (por ejemplo las de módulos posteriores) también debe estar vacía.
  const otras = await tx.$queryRaw<{ tabla: string }[]>`
    SELECT DISTINCT table_name AS tabla FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'empresa_id'
      AND table_name NOT IN ('empresas', 'sucursales', 'cuentas', 'ejercicios', 'periodos', 'membresias',
        'permisos_usuario', 'respaldos', 'bitacora', 'configuraciones_planilla', 'tramos_retencion_planilla',
        'configuraciones_isr', 'tramos_isr')`;
  for (const { tabla } of otras) {
    if (!IDENTIFICADOR.test(tabla)) return false;
    const [fila] = await tx.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM public."${tabla}" WHERE empresa_id = $1::uuid`,
      empresaId,
    );
    if ((fila?.n ?? 0) > 0) return false;
  }
  // Una empresa recién creada conserva la sucursal matriz, el ejercicio abierto y las tasas iniciales.
  return (
    partidas === 0 &&
    detalles === 0 &&
    versiones === 0 &&
    movimientos === 0 &&
    productos === 0 &&
    categorias === 0 &&
    cajas === 0 &&
    empleados === 0 &&
    calculos === 0 &&
    presentaciones === 0 &&
    correlativos === 0 &&
    ejercicios <= 1 &&
    configuraciones <= 1 &&
    periodosCerrados === 0
  );
}

const ORDEN_RESTAURACION = [
  "empresas",
  "sucursales",
  "cuentas",
  "ejercicios",
  "periodos",
  "configuraciones_planilla",
  "tramos_retencion_planilla",
  "categorias_producto",
  "productos",
  "cuentas_tesoreria",
  "empleados",
  "partidas",
  "partida_detalles",
  "partida_versiones",
  "movimientos_inventario",
  "planillas_calculadas",
  "planillas_presentaciones",
  "plantillas_recurrentes",
  "plantilla_recurrente_lineas",
  "configuraciones_isr",
  "tramos_isr",
  "cajas_chicas",
  "vales_caja_chica",
  "movimientos_bancarios",
  "conciliaciones_bancarias",
  "detalles_conciliacion_bancaria",
  "lineas_estado_cuenta",
  "series_inventario",
  "tomas_fisicas",
  "tomas_fisicas_detalles",
  "correlativos",
  "bitacora",
] as const;

const TABLAS_INSERTABLES = new Set<string>(ORDEN_RESTAURACION.filter((tabla) => tabla !== "empresas"));
const TABLAS_ACTUALIZABLES = new Set(["sucursales", "cuentas", "periodos"]);

function validarEmpresaEnFilas(contenido: ContenidoRespaldo): void {
  for (const [tabla, filas] of Object.entries(contenido.tablas)) {
    if (!TABLAS_INSERTABLES.has(tabla)) continue;
    for (const fila of filas) {
      if (typeof fila["empresa_id"] === "string" && fila["empresa_id"] !== contenido.empresaId) {
        throw new RespaldoInvalidoError();
      }
    }
  }
  if (contenido.empresa["id"] !== contenido.empresaId) throw new RespaldoInvalidoError();
}

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/;
/** Columnas de control de la empresa que una restauración nunca debe sobrescribir. */
const COLUMNAS_EMPRESA_PROTEGIDAS = new Set(["id", "nit", "activa", "creado_en"]);

/** Columnas reales de una tabla pública: el contenido de un respaldo no puede nombrar otras. */
async function columnasDe(tx: Tx, tabla: string): Promise<Set<string>> {
  const filas = await tx.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tabla}`;
  return new Set(filas.map((f) => f.column_name));
}

async function validarColumnas(tx: Tx, tabla: string, columnas: readonly string[]): Promise<void> {
  const validas = await columnasDe(tx, tabla);
  if (!columnas.every((c) => IDENTIFICADOR.test(c) && validas.has(c))) throw new RespaldoInvalidoError();
}

async function insertarTabla(tx: Tx, tabla: string, filas: FilaJson[]): Promise<number> {
  if (filas.length === 0) return 0;
  const nombresColumnas = [...new Set(filas.flatMap((fila) => Object.keys(fila)))];
  await validarColumnas(tx, tabla, nombresColumnas);
  if (tabla === "bitacora") nombresColumnas.splice(nombresColumnas.indexOf("id"), 1);
  const json = filas.map((fila) => {
    const clon = { ...fila };
    if (tabla === "bitacora") delete clon["id"];
    return clon;
  });
  const columnas = nombresColumnas.map((columna) => `"${columna}"`).join(", ");
  const actualizar = TABLAS_ACTUALIZABLES.has(tabla)
    ? ` ON CONFLICT ("id") DO UPDATE SET ${nombresColumnas
        .filter((columna) => columna !== "id" && columna !== "empresa_id")
        .map((columna) => `"${columna}" = EXCLUDED."${columna}"`)
        .join(", ")} WHERE public."${tabla}"."empresa_id" = EXCLUDED."empresa_id"`
    : " ON CONFLICT DO NOTHING";
  const sentencia =
    tabla === "ejercicios"
      ? `INSERT INTO public."${tabla}" (${columnas}) SELECT ${columnas} FROM jsonb_populate_recordset(NULL::public."${tabla}", $1::jsonb) AS origen WHERE NOT EXISTS (SELECT 1 FROM public."${tabla}" actual WHERE actual."id" = origen."id") ON CONFLICT DO NOTHING`
      : `INSERT INTO public."${tabla}" (${columnas}) SELECT ${columnas} FROM jsonb_populate_recordset(NULL::public."${tabla}", $1::jsonb)${actualizar}`;
  return tx.$executeRawUnsafe(sentencia, JSON.stringify(json));
}

@Injectable()
export class RepositorioRespaldosPrisma implements RepositorioRespaldos {
  constructor(private readonly baseDatos: BaseDatos) {}

  listar(usuarioId: string, empresaId: string): Promise<RespaldoVista[]> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const autorizacion = await acceso(tx, usuarioId, empresaId, "respaldo.crear");
      const filas = await tx.respaldo.findMany({
        where: autorizacion.todas_sucursales
          ? { empresaId }
          : { empresaId, tipo: "sucursal", sucursalId: { in: autorizacion.sucursales } },
        include: { sucursal: { select: { nombre: true } } },
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      });
      return filas.map(vista);
    });
  }

  crear(usuarioId: string, empresaId: string, datos: CrearRespaldo): Promise<RespaldoVista> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const autorizacion = await acceso(tx, usuarioId, empresaId, "respaldo.crear");
      let sucursalNombre: string | null = null;
      if (!datos.sucursalId && !autorizacion.todas_sucursales) {
        throw new SucursalRespaldoNoAutorizadaError();
      }
      if (datos.sucursalId) {
        const sucursal = await tx.sucursal.findFirst({
          where: { id: datos.sucursalId, empresaId, activa: true },
          select: { nombre: true },
        });
        if (!sucursal) throw new EmpresaRespaldoNoEncontradaError();
        if (!autorizacion.todas_sucursales && !autorizacion.sucursales.includes(datos.sucursalId)) {
          throw new SucursalRespaldoNoAutorizadaError();
        }
        sucursalNombre = sucursal.nombre;
      }
      const contenido = await crearContenido(tx, empresaId, datos.sucursalId);
      const hash = huella(contenido);
      const fecha = new Date(contenido.generadoEn);
      const sufijo = datos.sucursalId ? `sucursal_${datos.sucursalId.slice(0, 8)}` : "empresa";
      const fila = await tx.respaldo.create({
        data: {
          empresaId,
          sucursalId: datos.sucursalId ?? null,
          tipo: datos.sucursalId ? "sucursal" : "empresa",
          nombreArchivo: `respaldo_${sufijo}_${fechaArchivo(fecha)}.json`,
          contenido: contenido as unknown as Prisma.InputJsonValue,
          sha256: hash,
          creadoPor: usuarioId,
          creadoEn: fecha,
        },
      });
      return vista({ ...fila, sucursal: sucursalNombre ? { nombre: sucursalNombre } : null });
    });
  }

  descargar(usuarioId: string, empresaId: string, respaldoId: string): Promise<ArchivoRespaldo> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const autorizacion = await acceso(tx, usuarioId, empresaId, "respaldo.restaurar");
      const fila = await tx.respaldo.findFirst({ where: { id: respaldoId, empresaId } });
      if (!fila) throw new RespaldoNoEncontradoError();
      if (
        (!autorizacion.todas_sucursales && fila.tipo === "empresa") ||
        (fila.sucursalId !== null &&
          !autorizacion.todas_sucursales &&
          !autorizacion.sucursales.includes(fila.sucursalId))
      ) {
        throw new SucursalRespaldoNoAutorizadaError();
      }
      if (!esContenido(fila.contenido) || !huellaValida(fila.contenido, fila.sha256)) {
        throw new RespaldoInvalidoError();
      }
      await tx.bitacora.create({
        data: {
          empresaId,
          usuarioId,
          tabla: "respaldos",
          registroId: respaldoId,
          accion: "DESCARGAR",
          datosNuevos: { tipo: fila.tipo, nombreArchivo: fila.nombreArchivo },
        },
      });
      return {
        contenido: fila.contenido,
        sha256: fila.sha256.trim(),
        nombreArchivo: fila.nombreArchivo,
      };
    });
  }

  restaurar(
    usuarioId: string,
    empresaId: string,
    respaldoId: string,
    datos: RestaurarRespaldo,
  ): Promise<ResultadoRestauracionRespaldo> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const autorizacion = await acceso(tx, usuarioId, empresaId, "respaldo.restaurar");
      if (!autorizacion.todas_sucursales) throw new SucursalRespaldoNoAutorizadaError();
      const fila = await tx.respaldo.findFirst({ where: { id: respaldoId, empresaId } });
      if (!fila) throw new RespaldoNoEncontradoError();
      if (fila.tipo !== "empresa") throw new RespaldoSucursalNoRestaurableError();
      if (!esContenido(fila.contenido) || !huellaValida(fila.contenido, fila.sha256)) {
        throw new RespaldoInvalidoError();
      }
      const contenido = fila.contenido;
      if (contenido.empresaId !== empresaId) throw new RespaldoInvalidoError();
      if (contenido.tipo !== "empresa" || contenido.sucursalId !== null) throw new RespaldoInvalidoError();
      if (datos.confirmacion !== "RESTAURAR") throw new RespaldoInvalidoError();
      validarEmpresaEnFilas(contenido);
      if (!(await destinoVacio(tx, empresaId))) throw new EmpresaRespaldoNoVaciaError();

      let filasRestauradas = 0;
      let tablasRestauradas = 0;
      const filaEmpresa = contenido.empresa;
      const columnasEmpresa = Object.keys(filaEmpresa);
      await validarColumnas(tx, "empresas", columnasEmpresa);
      const columnasActualizar = columnasEmpresa.filter(
        (columna) => !COLUMNAS_EMPRESA_PROTEGIDAS.has(columna),
      );
      const sqlEmpresa = `INSERT INTO public."empresas" (${columnasEmpresa.map((col) => `"${col}"`).join(", ")}) SELECT ${columnasEmpresa.map((col) => `"${col}"`).join(", ")} FROM jsonb_populate_record(NULL::public."empresas", $1::jsonb) ON CONFLICT ("id") DO UPDATE SET ${columnasActualizar.map((col) => `"${col}" = EXCLUDED."${col}"`).join(", ")}`;
      await tx.$executeRawUnsafe(sqlEmpresa, JSON.stringify(filaEmpresa));

      for (const tabla of ORDEN_RESTAURACION) {
        if (tabla === "empresas") continue;
        const filas = contenido.tablas[tabla] ?? [];
        if (tabla === "cuentas") filas.sort((a, b) => Number(a["nivel"] ?? 0) - Number(b["nivel"] ?? 0));
        const cantidad = await insertarTabla(tx, tabla, filas);
        if (cantidad > 0) {
          tablasRestauradas += 1;
          filasRestauradas += cantidad;
        }
      }
      await tx.bitacora.create({
        data: {
          empresaId,
          usuarioId,
          tabla: "respaldos",
          registroId: respaldoId,
          accion: "RESTAURAR",
          datosNuevos: { tipo: "empresa", sha256: fila.sha256.trim(), filasRestauradas },
        },
      });
      return { tablasRestauradas, filasRestauradas };
    });
  }
}
