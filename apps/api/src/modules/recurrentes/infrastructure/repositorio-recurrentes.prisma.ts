import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type {
  CrearPlantillaRecurrente,
  EditarPlantillaRecurrente,
  GenerarPartidaRecurrente,
  PartidaGeneradaVista,
  PlantillaRecurrenteVista,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import {
  NombrePlantillaDuplicadoError,
  PartidaDelMesYaGeneradaError,
  PartidaRecurrenteNoEncontradaError,
  PlantillaRecurrenteNoEncontradaError,
  ReglaRecurrenteError,
  SucursalRecurrenteNoAutorizadaError,
  type AccesoRecurrentes,
  type RepositorioRecurrentes,
  type UnidadRecurrentes,
} from "../domain/recurrentes.js";

const TIPOS_REPETIBLES = ["operacion", "ajuste"];

const incluir = {
  sucursal: { select: { nombre: true } },
  lineas: {
    include: { cuenta: { select: { codigo: true, nombre: true } } },
    orderBy: { orden: "asc" as const },
  },
};
type Fila = Awaited<ReturnType<Tx["plantillaRecurrente"]["findFirstOrThrow"]>> & {
  sucursal: { nombre: string };
  lineas: {
    cuentaId: string;
    debe: { toString(): string };
    haber: { toString(): string };
    cuenta: { codigo: string; nombre: string };
  }[];
};

const aVista = (f: Fila, ultima: PlantillaRecurrenteVista["ultimaGeneracion"]): PlantillaRecurrenteVista => ({
  id: f.id,
  nombre: f.nombre,
  concepto: f.concepto,
  tipo: f.tipo,
  sucursalId: f.sucursalId,
  sucursalNombre: f.sucursal.nombre,
  activa: f.activa,
  lineas: f.lineas.map((l) => ({
    cuentaId: l.cuentaId,
    cuentaCodigo: l.cuenta.codigo,
    cuentaNombre: l.cuenta.nombre,
    debe: l.debe.toString(),
    haber: l.haber.toString(),
  })),
  ultimaGeneracion: ultima,
});

const puede = (acceso: AccesoRecurrentes, sucursalId: string) =>
  acceso.todasSucursales || acceso.sucursales.includes(sucursalId);

function esDuplicado(error: unknown, indice: string): boolean {
  if (!error || typeof error !== "object") return false;
  return (
    JSON.stringify((error as { meta?: unknown }).meta ?? {}).includes(indice) ||
    String((error as { message?: unknown }).message ?? "").includes(indice)
  );
}

class UnidadPrisma implements UnidadRecurrentes {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoRecurrentes | null> {
    const m = await this.tx.membresia.findFirst({
      where: { usuarioId, empresaId, activa: true },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    return m
      ? { todasSucursales: m.todasSucursales, sucursales: m.sucursales.map((s) => s.sucursalId) }
      : null;
  }

  private async vigentes(empresaId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, { partidaId: string; fecha: string; estado: string }>();
    const filas = await this.tx.$queryRaw<{ origen_id: string; id: string; fecha: string; estado: string }[]>`
      SELECT DISTINCT ON (origen_id) origen_id::text, id::text, fecha::text, estado::text
      FROM partidas
      WHERE empresa_id = ${empresaId}::uuid AND origen = 'recurrente' AND estado <> 'anulada'
        AND origen_id = ANY(${ids}::uuid[])
      ORDER BY origen_id, fecha DESC`;
    return new Map(filas.map((f) => [f.origen_id, { partidaId: f.id, fecha: f.fecha, estado: f.estado }]));
  }

  private async vista(empresaId: string, id: string): Promise<PlantillaRecurrenteVista> {
    const f = (await this.tx.plantillaRecurrente.findFirstOrThrow({
      where: { id, empresaId },
      include: incluir,
    })) as unknown as Fila;
    return aVista(f, (await this.vigentes(empresaId, [id])).get(id) ?? null);
  }

  async listar(empresaId: string, acceso: AccesoRecurrentes): Promise<PlantillaRecurrenteVista[]> {
    const filas = (await this.tx.plantillaRecurrente.findMany({
      where: { empresaId, ...(acceso.todasSucursales ? {} : { sucursalId: { in: [...acceso.sucursales] } }) },
      include: incluir,
      orderBy: [{ nombre: "asc" }],
    })) as unknown as Fila[];
    const ultimas = await this.vigentes(
      empresaId,
      filas.map((f) => f.id),
    );
    return filas.map((f) => aVista(f, ultimas.get(f.id) ?? null));
  }

  async crearDesdePartida(
    usuarioId: string,
    empresaId: string,
    datos: CrearPlantillaRecurrente,
    acceso: AccesoRecurrentes,
  ): Promise<PlantillaRecurrenteVista> {
    const partida = await this.tx.partida.findFirst({
      where: { id: datos.partidaId, empresaId },
      include: { detalles: { orderBy: { orden: "asc" } } },
    });
    if (!partida || !puede(acceso, partida.sucursalId)) throw new PartidaRecurrenteNoEncontradaError();
    if (!TIPOS_REPETIBLES.includes(partida.tipo)) {
      throw new ReglaRecurrenteError("Solo las partidas de operación o de ajuste pueden repetirse cada mes.");
    }
    if (partida.detalles.length === 0) throw new ReglaRecurrenteError("La partida no tiene líneas.");
    try {
      const creada = await this.tx.plantillaRecurrente.create({
        data: {
          empresaId,
          sucursalId: partida.sucursalId,
          nombre: datos.nombre,
          concepto: partida.concepto,
          tipo: partida.tipo,
          lineas: {
            create: partida.detalles.map((d, i) => ({
              cuentaId: d.cuentaId,
              debe: d.debe,
              haber: d.haber,
              orden: i,
            })),
          },
        },
        select: { id: true },
      });
      void usuarioId;
      return await this.vista(empresaId, creada.id);
    } catch (e) {
      if (
        esDuplicado(e, "plantillas_recurrentes_empresa_id_nombre_key") ||
        (e as { code?: string })?.code === "P2002"
      ) {
        throw new NombrePlantillaDuplicadoError();
      }
      throw e;
    }
  }

  async editar(
    empresaId: string,
    plantillaId: string,
    datos: EditarPlantillaRecurrente,
    acceso: AccesoRecurrentes,
  ): Promise<PlantillaRecurrenteVista> {
    const actual = await this.tx.plantillaRecurrente.findFirst({ where: { id: plantillaId, empresaId } });
    if (!actual) throw new PlantillaRecurrenteNoEncontradaError();
    if (!puede(acceso, actual.sucursalId)) throw new SucursalRecurrenteNoAutorizadaError();
    try {
      await this.tx.plantillaRecurrente.update({ where: { id: plantillaId }, data: datos });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") throw new NombrePlantillaDuplicadoError();
      throw e;
    }
    return this.vista(empresaId, plantillaId);
  }

  async generar(
    usuarioId: string,
    empresaId: string,
    plantillaId: string,
    datos: GenerarPartidaRecurrente,
    acceso: AccesoRecurrentes,
  ): Promise<PartidaGeneradaVista> {
    const plantilla = await this.tx.plantillaRecurrente.findFirst({
      where: { id: plantillaId, empresaId },
      include: { lineas: { orderBy: { orden: "asc" } } },
    });
    if (!plantilla) throw new PlantillaRecurrenteNoEncontradaError();
    if (!puede(acceso, plantilla.sucursalId)) throw new SucursalRecurrenteNoAutorizadaError();
    if (!plantilla.activa) throw new ReglaRecurrenteError("La plantilla está inactiva.");
    const [existente] = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM partidas
      WHERE empresa_id = ${empresaId}::uuid AND origen = 'recurrente' AND origen_id = ${plantillaId}::uuid
        AND estado <> 'anulada'
        AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM ${datos.fecha}::date)
        AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM ${datos.fecha}::date)`;
    if (existente) throw new PartidaDelMesYaGeneradaError();
    try {
      const [partida] = await this.tx.$queryRaw<{ id: string }[]>`
        INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id, creado_por)
        VALUES (${empresaId}::uuid, ${plantilla.sucursalId}::uuid, ${datos.fecha}::date, ${plantilla.tipo}::tipo_partida,
                ${plantilla.concepto}, 'recurrente', ${plantillaId}::uuid, ${usuarioId}::uuid)
        RETURNING id::text`;
      if (!partida) throw new Error("La base no devolvió el id de la partida.");
      await this.tx.$executeRaw`
        INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, concepto, orden)
        SELECT ${partida.id}::uuid, l.cuenta_id, l.debe, l.haber, ${plantilla.concepto}, (l.n - 1)::smallint
        FROM unnest(${plantilla.lineas.map((l) => l.cuentaId)}::uuid[],
                    ${plantilla.lineas.map((l) => l.debe.toString())}::numeric[],
                    ${plantilla.lineas.map((l) => l.haber.toString())}::numeric[])
             WITH ORDINALITY AS l(cuenta_id, debe, haber, n)`;
      return { partidaId: partida.id, fecha: datos.fecha, estado: "borrador" };
    } catch (e) {
      if (esDuplicado(e, "partidas_recurrente_mes_unq")) throw new PartidaDelMesYaGeneradaError();
      throw e;
    }
  }
}

@Injectable()
export class RepositorioRecurrentesPrisma implements RepositorioRecurrentes {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadRecurrentes) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
