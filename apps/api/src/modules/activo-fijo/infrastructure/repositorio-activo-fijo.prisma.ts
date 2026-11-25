import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import {
  Dinero,
  tasaAnual,
  type ActivoFijoVista,
  type CategoriaActivo,
  type PartidaGenerada,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  ORIGEN_ACTIVO_FIJO,
  ReglaContableError,
  type CuentaCatalogo,
  type DatosNuevoActivo,
  type DatosPartida,
} from "../domain/activo-fijo.js";
import type {
  AccesoActivos,
  RepositorioActivoFijo,
  UnidadActivoFijo,
} from "../domain/repositorio-activo-fijo.js";

/** Ejecuta una escritura y traduce el rechazo de un trigger o restricción (período cerrado…) a ReglaContableError. */
export async function conReglas<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const mensaje = mensajeDeRegla(e);
    if (mensaje === null) throw e;
    throw new ReglaContableError(mensaje);
  }
}

interface FilaActivo {
  id: string;
  codigo: string;
  nombre: string;
  categoria: CategoriaActivo;
  sucursal_id: string;
  sucursal_nombre: string;
  costo: string;
  valor_residual: string;
  fecha_adquisicion: string;
  vida_util_anios: number;
  depreciacion_acumulada: string;
  ultimo_mes_depreciado: string | null;
  estado: "activo" | "de_baja";
  fecha_baja: string | null;
  partida_alta_id: string | null;
  partida_baja_id: string | null;
  ca_id: string;
  ca_codigo: string;
  ca_nombre: string;
  cd_id: string;
  cd_codigo: string;
  cd_nombre: string;
  cg_id: string;
  cg_codigo: string;
  cg_nombre: string;
}

const aVista = (f: FilaActivo): ActivoFijoVista => ({
  id: f.id,
  codigo: f.codigo,
  nombre: f.nombre,
  categoria: f.categoria,
  sucursalId: f.sucursal_id,
  sucursalNombre: f.sucursal_nombre,
  costo: Dinero.de(f.costo).aTexto(),
  valorResidual: Dinero.de(f.valor_residual).aTexto(),
  fechaAdquisicion: f.fecha_adquisicion,
  vidaUtilAnios: f.vida_util_anios,
  tasaAnual: tasaAnual(f.vida_util_anios),
  depreciacionAcumulada: Dinero.de(f.depreciacion_acumulada).aTexto(),
  valorEnLibros: Dinero.de(f.costo).menos(f.depreciacion_acumulada).aTexto(),
  estado: f.estado,
  ultimoMesDepreciado: f.ultimo_mes_depreciado,
  fechaBaja: f.fecha_baja,
  cuentaActivo: { id: f.ca_id, codigo: f.ca_codigo, nombre: f.ca_nombre },
  cuentaDepreciacion: { id: f.cd_id, codigo: f.cd_codigo, nombre: f.cd_nombre },
  cuentaGasto: { id: f.cg_id, codigo: f.cg_codigo, nombre: f.cg_nombre },
  partidaAltaId: f.partida_alta_id,
  partidaBajaId: f.partida_baja_id,
});

/** Columnas de un activo con su sucursal y sus tres cuentas; el WHERE lo agrega cada consulta. */
const SELECT_ACTIVO = `
  SELECT a.id::text, a.codigo, a.nombre, a.categoria, a.sucursal_id::text, s.nombre AS sucursal_nombre,
         a.costo::text, a.valor_residual::text, to_char(a.fecha_adquisicion, 'YYYY-MM-DD') AS fecha_adquisicion,
         a.vida_util_anios::int, a.depreciacion_acumulada::text,
         to_char(a.ultimo_mes_depreciado, 'YYYY-MM-DD') AS ultimo_mes_depreciado, a.estado,
         to_char(a.fecha_baja, 'YYYY-MM-DD') AS fecha_baja, a.partida_alta_id::text, a.partida_baja_id::text,
         ca.id::text AS ca_id, ca.codigo AS ca_codigo, ca.nombre AS ca_nombre,
         cd.id::text AS cd_id, cd.codigo AS cd_codigo, cd.nombre AS cd_nombre,
         cg.id::text AS cg_id, cg.codigo AS cg_codigo, cg.nombre AS cg_nombre
  FROM activos_fijos a
  JOIN sucursales s ON s.id = a.sucursal_id
  JOIN cuentas ca ON ca.id = a.cuenta_activo_id
  JOIN cuentas cd ON cd.id = a.cuenta_depreciacion_id
  JOIN cuentas cg ON cg.id = a.cuenta_gasto_id`;

export class UnidadActivoFijoPrisma implements UnidadActivoFijo {
  constructor(protected readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoActivos | null> {
    const [fila] = await this.tx.$queryRaw<
      { todas_sucursales: boolean; permisos: string[]; sucursales: string[] }[]
    >`
      SELECT m.todas_sucursales,
             ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                   WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos,
             ARRAY(SELECT ms.sucursal_id::text FROM membresia_sucursales ms
                   WHERE ms.membresia_id = m.id) AS sucursales
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    return fila
      ? {
          permisos: new Set(fila.permisos),
          todasSucursales: fila.todas_sucursales,
          sucursales: fila.sucursales,
        }
      : null;
  }

  async listar(empresaId: string, sucursales: readonly string[] | null): Promise<ActivoFijoVista[]> {
    const filas = await this.tx.$queryRawUnsafe<FilaActivo[]>(
      `${SELECT_ACTIVO}
       WHERE a.empresa_id = $1::uuid AND ($2::uuid[] IS NULL OR a.sucursal_id = ANY($2::uuid[]))
       ORDER BY a.codigo`,
      empresaId,
      sucursales === null ? null : [...sucursales],
    );
    return filas.map(aVista);
  }

  async obtener(empresaId: string, activoId: string, bloquear = false): Promise<ActivoFijoVista | null> {
    const [fila] = await this.tx.$queryRawUnsafe<FilaActivo[]>(
      `${SELECT_ACTIVO} WHERE a.id = $1::uuid AND a.empresa_id = $2::uuid ${bloquear ? "FOR UPDATE OF a" : ""}`,
      activoId,
      empresaId,
    );
    return fila ? aVista(fila) : null;
  }

  async existeSucursal(empresaId: string, sucursalId: string): Promise<boolean> {
    const filas = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM sucursales WHERE id = ${sucursalId}::uuid AND empresa_id = ${empresaId}::uuid AND activa`;
    return filas.length > 0;
  }

  private consultarCuentas(
    empresaId: string,
    columna: "id" | "codigo",
    valores: readonly string[],
  ): Promise<CuentaCatalogo[]> {
    return this.tx.$queryRawUnsafe<CuentaCatalogo[]>(
      `SELECT c.id::text, c.codigo, c.nombre, c.activa,
              NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS imputable
       FROM cuentas c
       WHERE c.empresa_id = $1::uuid AND c.${columna}::text = ANY($2::text[])`,
      empresaId,
      [...valores],
    );
  }

  cuentasPorCodigo(empresaId: string, codigos: readonly string[]): Promise<CuentaCatalogo[]> {
    return this.consultarCuentas(empresaId, "codigo", codigos);
  }

  cuentasPorId(empresaId: string, ids: readonly string[]): Promise<CuentaCatalogo[]> {
    return this.consultarCuentas(empresaId, "id", ids);
  }

  insertar(empresaId: string, usuarioId: string, d: DatosNuevoActivo): Promise<string> {
    return conReglas(async () => {
      const [fila] = await this.tx.$queryRaw<{ id: string }[]>`
        INSERT INTO activos_fijos (empresa_id, sucursal_id, nombre, categoria, cuenta_activo_id,
                                   cuenta_depreciacion_id, cuenta_gasto_id, costo, valor_residual,
                                   fecha_adquisicion, vida_util_anios, creado_por)
        VALUES (${empresaId}::uuid, ${d.sucursalId}::uuid, ${d.nombre}, ${d.categoria}, ${d.cuentaActivoId}::uuid,
                ${d.cuentaDepreciacionId}::uuid, ${d.cuentaGastoId}::uuid, ${d.costo}::numeric,
                ${d.valorResidual}::numeric, ${d.fechaAdquisicion}::date, ${d.vidaUtilAnios}::smallint,
                ${usuarioId}::uuid)
        RETURNING id::text`;
      if (!fila) throw new Error("La base no devolvió el id del activo");
      return fila.id;
    });
  }

  contabilizarPartida(empresaId: string, p: DatosPartida): Promise<PartidaGenerada> {
    return conReglas(async () => {
      const [fila] = await this.tx.$queryRaw<{ id: string }[]>`
        INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
        VALUES (${empresaId}::uuid, ${p.sucursalId}::uuid, ${p.fecha}::date, ${p.tipo ?? "operacion"}::tipo_partida,
                ${p.concepto}, ${p.origen ?? ORIGEN_ACTIVO_FIJO}, ${p.origenId}::uuid)
        RETURNING id::text`;
      if (!fila) throw new Error("La base no devolvió el id de la partida");
      await this.tx.$executeRaw`
        INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, orden)
        SELECT ${fila.id}::uuid, l.cuenta_id, l.debe, l.haber, (l.n - 1)::smallint
        FROM unnest(${p.lineas.map((l) => l.cuentaId)}::uuid[], ${p.lineas.map((l) => Dinero.de(l.debe).aTexto())}::numeric[],
                    ${p.lineas.map((l) => Dinero.de(l.haber).aTexto())}::numeric[])
             WITH ORDINALITY AS l(cuenta_id, debe, haber, n)`;
      // El cuadre es una restricción diferida: se adelanta para que falle aquí y con un mensaje claro
      await this.tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      const [numero] = await this.tx.$queryRaw<{ numero: number; ambito: string }[]>`
        UPDATE partidas SET estado = 'contabilizada' WHERE id = ${fila.id}::uuid
        RETURNING numero, ambito_numeracion AS ambito`;
      if (!numero) throw new Error("La partida desapareció durante la contabilización");
      return { id: fila.id, numero: numero.numero, ambito: numero.ambito };
    });
  }

  async activosDepreciables(
    empresaId: string,
    sucursales: readonly string[] | null,
  ): Promise<ActivoFijoVista[]> {
    const filas = await this.tx.$queryRawUnsafe<FilaActivo[]>(
      `${SELECT_ACTIVO}
       WHERE a.empresa_id = $1::uuid AND a.estado = 'activo'
         AND ($2::uuid[] IS NULL OR a.sucursal_id = ANY($2::uuid[]))
       ORDER BY a.codigo
       FOR UPDATE OF a`,
      empresaId,
      sucursales === null ? null : [...sucursales],
    );
    return filas.map(aVista);
  }

  registrarDepreciacion(
    empresaId: string,
    usuarioId: string,
    d: { activoId: string; mes: string; cuota: string; acumulada: string; partidaId: string },
  ): Promise<void> {
    return conReglas(async () => {
      await this.tx.$executeRaw`
        INSERT INTO depreciaciones (empresa_id, activo_id, mes, cuota, acumulada, partida_id, creado_por)
        VALUES (${empresaId}::uuid, ${d.activoId}::uuid, ${d.mes}::date, ${d.cuota}::numeric, ${d.acumulada}::numeric,
                ${d.partidaId}::uuid, ${usuarioId}::uuid)`;
      await this.tx.$executeRaw`
        UPDATE activos_fijos SET depreciacion_acumulada = ${d.acumulada}::numeric, ultimo_mes_depreciado = ${d.mes}::date
        WHERE id = ${d.activoId}::uuid`;
    });
  }

  async partidasDeDepreciacion(empresaId: string, activoId: string): Promise<Map<string, string>> {
    const filas = await this.tx.$queryRaw<{ mes: string; partida_id: string }[]>`
      SELECT to_char(mes, 'YYYY-MM-DD') AS mes, partida_id::text
      FROM depreciaciones WHERE empresa_id = ${empresaId}::uuid AND activo_id = ${activoId}::uuid`;
    return new Map(filas.map((f) => [f.mes, f.partida_id]));
  }

  vincularAlta(activoId: string, partidaId: string): Promise<void> {
    return conReglas(async () => {
      await this.tx.$executeRaw`
        UPDATE activos_fijos SET partida_alta_id = ${partidaId}::uuid WHERE id = ${activoId}::uuid`;
    });
  }

  registrarBaja(activoId: string, fecha: string, partidaId: string): Promise<void> {
    return conReglas(async () => {
      await this.tx.$executeRaw`
        UPDATE activos_fijos SET estado = 'de_baja', fecha_baja = ${fecha}::date, partida_baja_id = ${partidaId}::uuid
        WHERE id = ${activoId}::uuid`;
    });
  }
}

@Injectable()
export class RepositorioActivoFijoPrisma implements RepositorioActivoFijo {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadActivoFijo) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadActivoFijoPrisma(tx)));
  }
}
