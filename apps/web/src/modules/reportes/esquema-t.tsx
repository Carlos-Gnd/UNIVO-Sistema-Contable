import { Download } from "lucide-react";
import type { LibroMayor, MovimientoLibroMayor } from "@contable/shared";
import { Button } from "@/components/ui/button";

export interface DatosEsquemaT {
  empresa: string;
  sucursal?: string | null;
  nota?: string | null;
  alertaSaldoContrario?: string | null;
}

/** Mayor contable en esquema T: débitos y créditos se muestran a lados opuestos (S2-T25, HU-28). */
export function EsquemaT({ libro, datos }: { libro: LibroMayor; datos: DatosEsquemaT }) {
  const debitos = libro.movimientos.filter((movimiento) => montoPositivo(movimiento.debe));
  const creditos = libro.movimientos.filter((movimiento) => montoPositivo(movimiento.haber));
  const saldo = saldoEnEsquemaT(libro);

  return (
    <section
      aria-labelledby="esquema-t-titulo"
      className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
    >
      {datos.alertaSaldoContrario && (
        <div
          role="status"
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {datos.alertaSaldoContrario}
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{datos.empresa}</p>
          <h2 id="esquema-t-titulo" className="mt-1 text-base font-semibold">
            Mayor · {libro.codigo} {libro.nombre}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {periodo(libro)} · {datos.sucursal ?? "Consolidado"}
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
          Exportar PDF
        </Button>
      </header>

      <div className="border-b border-border px-4 py-3 text-center text-sm font-semibold sm:px-5">
        <span className="text-muted-foreground">{libro.codigo}</span> {libro.nombre}
      </div>

      <div className="grid grid-cols-2 divide-x divide-border" aria-label="Esquema T">
        <LadoEsquema titulo="Debe" movimientos={debitos} total={libro.totalDebe} />
        <LadoEsquema titulo="Haber" movimientos={creditos} total={libro.totalHaber} />
      </div>

      <div className="grid grid-cols-2 border-t border-border">
        <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-sm font-semibold sm:px-4">
          <span>Saldo</span>
          {saldo.lado === "debe" && <Importe valor={saldo.valor} />}
        </div>
        <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-sm font-semibold sm:px-4">
          {saldo.lado === "haber" && <Importe valor={saldo.valor} />}
        </div>
      </div>

      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
        En el esquema T cada renglón es el número de partida y su monto. Incluye partidas anuladas, nunca
        borradores.
      </p>
    </section>
  );
}

function LadoEsquema({
  titulo,
  movimientos,
  total,
}: {
  titulo: "Debe" | "Haber";
  movimientos: MovimientoLibroMayor[];
  total: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="border-b border-border px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:px-4">
        {titulo}
      </h3>
      <ol aria-label={`Movimientos de ${titulo}`} className="min-h-12 divide-y divide-border">
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
        <span>Suma</span>
        <Importe valor={total} />
      </div>
    </div>
  );
}

function Importe({ valor }: { valor: string }) {
  return <span className="whitespace-nowrap text-right tabular-nums">{formatearImporte(valor)}</span>;
}

function saldoEnEsquemaT(libro: LibroMayor): { lado: "debe" | "haber"; valor: string } {
  const saldo = Number(libro.saldoFinal);
  const saldoNormal = Number.isFinite(saldo) ? saldo >= 0 : true;
  const ladoNatural = libro.naturaleza === "deudora" ? "debe" : "haber";
  const lado = saldoNormal ? ladoNatural : ladoNatural === "debe" ? "haber" : "debe";
  const valor = Number.isFinite(saldo) ? Math.abs(saldo).toFixed(2) : libro.saldoFinal.replace(/^-/, "");
  return { lado, valor };
}

function montoPositivo(valor: string): boolean {
  return Number(valor) > 0;
}

function formatearImporte(valor: string): string {
  const monto = Number(valor);
  return Number.isFinite(monto)
    ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto)
    : valor;
}

function periodo(libro: LibroMayor): string {
  const desde = libro.desde ? fecha(libro.desde) : "Inicio";
  const hasta = libro.hasta ? fecha(libro.hasta) : "Actualidad";
  return `Del ${desde} al ${hasta}`;
}

function fecha(valor: string): string {
  const partes = valor.slice(0, 10).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor;
}

function imprimirEsquemaT(libro: LibroMayor, datos: DatosEsquemaT): void {
  const ventana = window.open("", "_blank");
  if (!ventana) return;
  const saldo = saldoEnEsquemaT(libro);
  const filas = (movimientos: MovimientoLibroMayor[], lado: "Debe" | "Haber") =>
    movimientos
      .map(
        (movimiento) =>
          `<tr><td>${movimiento.numero}</td><td>${escapar(formatearImporte(lado === "Debe" ? movimiento.debe : movimiento.haber))}</td></tr>`,
      )
      .join("");
  const contenido = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mayor · ${escapar(libro.codigo)} ${escapar(libro.nombre)}</title>
    <style>
      :root{color-scheme:dark;font-family:Arial,Helvetica,sans-serif;color:#f4f4f5;background:#090909}*{box-sizing:border-box}body{margin:0;padding:24px;background:#090909;color:#f4f4f5}.hoja{max-width:190mm;margin:0 auto;padding:18px;border:1px solid #292929;border-radius:12px;background:#191919}.empresa{color:#888;font-size:9pt;letter-spacing:.08em;text-transform:uppercase}h1{margin:6px 0;font-size:16pt}.meta{color:#aaa;font-size:9pt}.cuenta{margin-top:18px;border-bottom:1px solid #292929;padding:12px;text-align:center;font-weight:600}.columnas,.saldo{display:grid;grid-template-columns:1fr 1fr}.lado{min-width:0}.lado+ .lado{border-left:1px solid #333}.lado h2{border-bottom:1px solid #333;padding:10px;text-align:center;font-size:9pt;text-transform:uppercase;color:#999}.lado table{width:100%;border-collapse:collapse}.lado td{padding:9px;border-bottom:1px solid #303030}.lado td:last-child{text-align:right;font-variant-numeric:tabular-nums}.total{font-weight:bold;border-top:1px solid #555}.saldo{border-top:1px solid #555;padding:12px;font-weight:bold}.saldo>div{display:flex;justify-content:space-between}.nota{margin-top:16px;color:#999;font-size:8pt}@page{size:A4 portrait;margin:12mm}@media print{body{padding:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.hoja{max-width:none;border-radius:0}}
    </style></head><body><main class="hoja"><div class="empresa">${escapar(datos.empresa)}</div><h1>Mayor · ${escapar(libro.codigo)} ${escapar(libro.nombre)}</h1><p class="meta">${escapar(periodo(libro))} · ${escapar(datos.sucursal ?? "Consolidado")}${datos.nota ? ` · ${escapar(datos.nota)}` : ""}</p><div class="cuenta">${escapar(libro.codigo)} ${escapar(libro.nombre)}</div><div class="columnas">${ladoPdf("Debe", debitos(libro), libro.totalDebe)}${ladoPdf("Haber", creditos(libro), libro.totalHaber)}</div><div class="saldo"><div><span>Saldo</span>${saldo.lado === "debe" ? `<span>${escapar(formatearImporte(saldo.valor))}</span>` : ""}</div><div>${saldo.lado === "haber" ? `<span>${escapar(formatearImporte(saldo.valor))}</span>` : ""}</div></div><p class="nota">En el esquema T cada renglón es el número de partida y su monto. Incluye partidas anuladas, nunca borradores.</p></main><script>window.addEventListener('load',()=>window.print(),{once:true})</script></body></html>`;
  ventana.opener = null;
  ventana.document.open();
  ventana.document.write(contenido);
  ventana.document.close();

  function ladoPdf(titulo: "Debe" | "Haber", movimientos: MovimientoLibroMayor[], total: string): string {
    return `<section class="lado"><h2>${titulo}</h2><table><tbody>${filas(movimientos, titulo)}<tr class="total"><td>Suma</td><td>${escapar(formatearImporte(total))}</td></tr></tbody></table></section>`;
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
