import { Download } from "lucide-react";
import {
  Dinero,
  saldoContrarioANaturaleza,
  type LibroMayor,
  type MovimientoLibroMayor,
} from "@contable/shared";
import { Button } from "@/components/ui/button";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { imprimirDocumento } from "./imprimir-documento";
import { AlertaSaldoContrario } from "./alerta-saldo-contrario";
import { TEXTOS_ESQUEMA_T as T } from "./textos";

export interface DatosEsquemaT {
  empresa: string;
  sucursal?: string | null;
  nota?: string | null;
}

/** Mayor contable en esquema T: débitos y créditos se muestran a lados opuestos (S2-T25, HU-28). */
export function EsquemaT({ libro, datos }: { libro: LibroMayor; datos: DatosEsquemaT }) {
  const debitos = libro.movimientos.filter((movimiento) => montoPositivo(movimiento.debe));
  const creditos = libro.movimientos.filter((movimiento) => montoPositivo(movimiento.haber));
  const inicial = saldoInicialPorLado(libro);
  const totalDebe = Dinero.de(libro.totalDebe)
    .mas(inicial.debe ?? "0.00")
    .aTexto();
  const totalHaber = Dinero.de(libro.totalHaber)
    .mas(inicial.haber ?? "0.00")
    .aTexto();
  const saldo = saldoEnEsquemaT(libro);
  const saldoContrario = saldoContrarioANaturaleza(libro.naturaleza, libro.saldoFinal);

  return (
    <section
      aria-labelledby="esquema-t-titulo"
      className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
    >
      {saldoContrario && (
        <AlertaSaldoContrario
          cuentas={[{ id: libro.cuentaId, codigo: libro.codigo, nombre: libro.nombre }]}
        />
      )}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{datos.empresa}</p>
          <h2 id="esquema-t-titulo" className="mt-1 text-base font-semibold">
            {T.titulo(libro.codigo, libro.nombre)}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {periodo(libro)} · {datos.sucursal ?? T.consolidado}
            {datos.nota ? ` · ${datos.nota}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-full px-4"
          onClick={() => imprimirEsquemaT(libro, datos)}
        >
          <Download aria-hidden="true" />
          {T.exportarPdf}
        </Button>
      </header>

      <div className="border-b border-border px-4 py-3 text-center text-sm font-semibold sm:px-5">
        <span className="text-muted-foreground">{libro.codigo}</span> {libro.nombre}
      </div>

      <div className="grid grid-cols-2 divide-x divide-border" aria-label={T.esquema}>
        <LadoEsquema titulo={T.debe} movimientos={debitos} saldoInicial={inicial.debe} total={totalDebe} />
        <LadoEsquema
          titulo={T.haber}
          movimientos={creditos}
          saldoInicial={inicial.haber}
          total={totalHaber}
        />
      </div>

      <div className="grid grid-cols-2 border-t border-border">
        <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-sm font-semibold sm:px-4">
          {saldo.lado === "debe" && (
            <>
              <span>{T.saldo}</span>
              <Importe valor={saldo.valor} />
            </>
          )}
        </div>
        <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-sm font-semibold sm:px-4">
          {saldo.lado === "haber" && (
            <>
              <span>{T.saldo}</span>
              <Importe valor={saldo.valor} />
            </>
          )}
        </div>
      </div>

      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">{T.nota}</p>
    </section>
  );
}

function LadoEsquema({
  titulo,
  movimientos,
  saldoInicial,
  total,
}: {
  titulo: "Debe" | "Haber";
  movimientos: MovimientoLibroMayor[];
  saldoInicial: string | null;
  total: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="border-b border-border px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:px-4">
        {titulo}
      </h3>
      <ol aria-label={T.movimientosDe(titulo)} className="min-h-12 divide-y divide-border">
        {saldoInicial !== null && (
          <li className="flex min-h-10 items-center justify-between gap-2 px-3 py-2 text-xs sm:px-4 sm:text-sm">
            <span className="text-muted-foreground">{T.saldoInicial}</span>
            <Importe valor={saldoInicial} />
          </li>
        )}
        {movimientos.map((movimiento, indice) => (
          <li
            key={`${movimiento.partidaId}-${indice}`}
            className="flex min-h-10 items-center justify-between gap-2 px-3 py-2 text-xs sm:px-4 sm:text-sm"
          >
            <span className="shrink-0 text-muted-foreground">{movimiento.numero}</span>
            <Importe valor={titulo === "Debe" ? movimiento.debe : movimiento.haber} />
          </li>
        ))}
      </ol>
      <div className="flex min-h-12 items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm font-semibold sm:px-4">
        <span>{T.suma}</span>
        <Importe valor={total} />
      </div>
    </div>
  );
}

function Importe({ valor }: { valor: string }) {
  return (
    <span className="whitespace-nowrap text-right tabular-nums">
      {formatearDinero(valor, { simbolo: false })}
    </span>
  );
}

function saldoEnEsquemaT(libro: LibroMayor): { lado: "debe" | "haber"; valor: string } {
  const saldo = Dinero.de(libro.saldoFinal);
  const saldoNormal = !saldo.esNegativo();
  const ladoNatural = libro.naturaleza === "deudora" ? "debe" : "haber";
  const lado = saldoNormal ? ladoNatural : ladoNatural === "debe" ? "haber" : "debe";
  return { lado, valor: saldo.abs().aTexto() };
}

function montoPositivo(valor: string): boolean {
  return !Dinero.de(valor).esCero();
}

function periodo(libro: LibroMayor): string {
  return T.periodo(
    libro.desde ? formatearFecha(libro.desde) : T.inicio,
    libro.hasta ? formatearFecha(libro.hasta) : T.actualidad,
  );
}

function saldoInicialPorLado(libro: LibroMayor): { debe: string | null; haber: string | null } {
  const saldo = Dinero.de(libro.saldoInicial);
  if (saldo.esCero()) return { debe: null, haber: null };
  const natural = libro.naturaleza === "deudora" ? "debe" : "haber";
  const lado = saldo.esNegativo() ? (natural === "debe" ? "haber" : "debe") : natural;
  return {
    debe: lado === "debe" ? saldo.abs().aTexto() : null,
    haber: lado === "haber" ? saldo.abs().aTexto() : null,
  };
}

function imprimirEsquemaT(libro: LibroMayor, datos: DatosEsquemaT): void {
  const saldo = saldoEnEsquemaT(libro);
  const inicial = saldoInicialPorLado(libro);
  const totalDebe = Dinero.de(libro.totalDebe)
    .mas(inicial.debe ?? "0.00")
    .aTexto();
  const totalHaber = Dinero.de(libro.totalHaber)
    .mas(inicial.haber ?? "0.00")
    .aTexto();
  const filas = (movimientos: MovimientoLibroMayor[], lado: "Debe" | "Haber") =>
    movimientos
      .map(
        (movimiento) =>
          `<tr><td>${movimiento.numero}</td><td>${escapar(formatearDinero(lado === "Debe" ? movimiento.debe : movimiento.haber, { simbolo: false }))}</td></tr>`,
      )
      .join("");
  const contenido = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(T.titulo(libro.codigo, libro.nombre))}</title>
    <style>
      :root{color-scheme:dark;font-family:Arial,Helvetica,sans-serif;color:#f4f4f5;background:#090909}*{box-sizing:border-box}body{margin:0;padding:24px;background:#090909;color:#f4f4f5}.hoja{max-width:190mm;margin:0 auto;padding:18px;border:1px solid #292929;border-radius:12px;background:#191919}.empresa{color:#888;font-size:9pt;letter-spacing:.08em;text-transform:uppercase}h1{margin:6px 0;font-size:16pt}.meta{color:#aaa;font-size:9pt}.cuenta{margin-top:18px;border-bottom:1px solid #292929;padding:12px;text-align:center;font-weight:600}.columnas,.saldo{display:grid;grid-template-columns:1fr 1fr}.lado{min-width:0}.lado+ .lado{border-left:1px solid #333}.lado h2{border-bottom:1px solid #333;padding:10px;text-align:center;font-size:9pt;text-transform:uppercase;color:#999}.lado table{width:100%;border-collapse:collapse}.lado td{padding:9px;border-bottom:1px solid #303030}.lado td:last-child{text-align:right;font-variant-numeric:tabular-nums}.total{font-weight:bold;border-top:1px solid #555}.saldo{border-top:1px solid #555;padding:12px;font-weight:bold}.saldo>div{display:flex;justify-content:space-between}.nota{margin-top:16px;color:#999;font-size:8pt}@page{size:A4 portrait;margin:12mm}@media print{body{padding:0;background:#fff;color:#111;print-color-adjust:economy;-webkit-print-color-adjust:economy}.hoja{max-width:none;border:0;border-radius:0;background:#fff}.meta,.empresa,.nota,.lado h2{color:#555}.cuenta,.lado+ .lado,.lado h2,.lado td,.total,.saldo{border-color:#ccc}}
    </style></head><body><main class="hoja"><div class="empresa">${escapar(datos.empresa)}</div><h1>${escapar(T.titulo(libro.codigo, libro.nombre))}</h1><p class="meta">${escapar(periodo(libro))} · ${escapar(datos.sucursal ?? T.consolidado)}${datos.nota ? ` · ${escapar(datos.nota)}` : ""}</p><div class="cuenta">${escapar(libro.codigo)} ${escapar(libro.nombre)}</div><div class="columnas">${ladoPdf(T.debe, debitos(libro), inicial.debe, totalDebe)}${ladoPdf(T.haber, creditos(libro), inicial.haber, totalHaber)}</div><div class="saldo"><div>${saldo.lado === "debe" ? `<span>${T.saldo}</span><span>${escapar(formatearDinero(saldo.valor, { simbolo: false }))}</span>` : ""}</div><div>${saldo.lado === "haber" ? `<span>${T.saldo}</span><span>${escapar(formatearDinero(saldo.valor, { simbolo: false }))}</span>` : ""}</div></div><p class="nota">${T.nota}</p></main></body></html>`;
  imprimirDocumento(contenido);

  function ladoPdf(
    titulo: "Debe" | "Haber",
    movimientos: MovimientoLibroMayor[],
    saldoInicial: string | null,
    total: string,
  ): string {
    const renglonInicial = saldoInicial
      ? `<tr><td>${T.saldoInicial}</td><td>${escapar(formatearDinero(saldoInicial, { simbolo: false }))}</td></tr>`
      : "";
    return `<section class="lado"><h2>${titulo}</h2><table><tbody>${renglonInicial}${filas(movimientos, titulo)}<tr class="total"><td>${T.suma}</td><td>${escapar(formatearDinero(total, { simbolo: false }))}</td></tr></tbody></table></section>`;
  }
}

function debitos(libro: LibroMayor): MovimientoLibroMayor[] {
  return libro.movimientos.filter((movimiento) => montoPositivo(movimiento.debe));
}

function creditos(libro: LibroMayor): MovimientoLibroMayor[] {
  return libro.movimientos.filter((movimiento) => montoPositivo(movimiento.haber));
}

function escapar(valor: string): string {
  return valor.replace(
    /[&<>"']/g,
    (caracter) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[caracter] ?? caracter,
  );
}
