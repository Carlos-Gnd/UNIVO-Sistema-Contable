import { useId, type CSSProperties } from "react";
import { CABALLO, ESLOGAN, NOMBRE } from "./trazos";

/**
 * Logotipo EQUUS animado, igual al del prototipo: el caballo se dibuja de un trazo, entra el nombre y se descubre
 * el eslogan (~2.9 s). `parte` separa el isologo (caballo) del nombre con eslogan; con la misma escala puestos en
 * fila se ven como el logotipo completo. Los estilos `eq-*` están en index.css.
 * Nombre y eslogan son trazos vectoriales (`Logos/Equus_fondo_oscuro.svg`), no texto: no dependen de ninguna fuente.
 */
const VISTA = { completo: { vb: "40 185 680 250", w: 680, h: 250 }, caballo: { vb: "62 205 208 205", w: 208, h: 205 }, nombre: { vb: "300 205 330 205", w: 330, h: 205 } };

/** Nombre y eslogan se escalan a las cajas del prototipo (nombre x 310–610, línea base 316; eslogan x 311–611, línea base 346). */
const AJUSTE_NOMBRE = "translate(27.6 168.6) scale(0.4754)";
const AJUSTE_ESLOGAN = "translate(39.8 172.3) scale(0.4644)";

/**
 * El SVG de `Logos/` trae el nombre en Regular y el eslogan en Light; el prototipo los dibuja en Medium y Regular.
 * Un contorno del mismo color (en unidades del trazo, antes de escalar) les da ese peso: así las letras no se ven
 * delgadas ni rasposas al aparecer con transparencia.
 */
const PESO_NOMBRE = 2;
const PESO_ESLOGAN = 1.1;

type Parte = keyof typeof VISTA;

const ETIQUETA: Record<Parte, string> = {
  completo: "EQUUS · Tu mejor movimiento contable",
  caballo: "Isologo de EQUUS",
  nombre: "EQUUS · Tu mejor movimiento contable",
};

export function LogoAnimado({ parte = "completo", ancho = 340, escala, className = "" }: { parte?: Parte; ancho?: number; escala?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const v = VISTA[parte];
  const w = escala ? v.w * escala : ancho;
  return (
    <svg
      viewBox={v.vb}
      width={w}
      height={escala ? v.h * escala : undefined}
      style={{ width: w, maxWidth: "100%", height: escala ? v.h * escala : "auto" }}
      className={`eq-logo ${className}`}
      role="img"
      aria-label={ETIQUETA[parte]}
    >
      <defs>
        <mask id={`r${id}`} maskUnits="userSpaceOnUse" x="250" y="150" width="300" height="300">
          <path className="eq-mk" pathLength={1} style={{ "--d": "0s", "--t": "0.8s" } as CSSProperties} d="M308 386 L308 340 L310 310 L320 280 L335 255 L355 235 L385 218 L420 209 L452 207" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.5s", "--t": "0.25s" } as CSSProperties} d="M308 386 L362 386" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.55s", "--t": "0.25s" } as CSSProperties} d="M308 349 L354 349" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.6s", "--t": "0.2s" } as CSSProperties} d="M322 314 L342 314" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.65s", "--t": "0.2s" } as CSSProperties} d="M322 281 L340 281" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.7s", "--t": "0.2s" } as CSSProperties} d="M345 243 L362 243" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.25s", "--t": "0.7s" } as CSSProperties} d="M452 229 L415 232 L390 245 L372 270 L360 298 L372 312 L384 345 L390 386 L468 386" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.7s", "--t": "0.5s" } as CSSProperties} d="M471 386 L470 372 L455 350 L435 335 L422 315 L430 296 L442 296 L448 312 L450 330 L462 335" />
          <path className="eq-mk" pathLength={1} style={{ "--d": "0.75s", "--t": "0.45s" } as CSSProperties} d="M473 216 L472 250 L480 285 L493 315 L485 327 L460 335" />
        </mask>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0.88" stopColor="#fff" /><stop offset="1" stopColor="#000" /></linearGradient>
        <mask id={`w${id}`} maskUnits="userSpaceOnUse" x="290" y="322" width="420" height="36"><rect className="eq-wipe" x="-200" y="320" width="500" height="40" fill={`url(#g${id})`} /></mask>
      </defs>
      {parte !== "nombre" && (
        <g transform="translate(-233 12)">
          <g mask={`url(#r${id})`}>
            <path className="eq-caballo" d={CABALLO} />
          </g>
        </g>
      )}
      {parte !== "caballo" && (
        <>
          <g className="eq-nombre">
            <path transform={AJUSTE_NOMBRE} fill="#E6E6E6" stroke="#E6E6E6" strokeWidth={PESO_NOMBRE} strokeLinejoin="round" d={NOMBRE} />
          </g>
          <g mask={`url(#w${id})`}>
            <g className="eq-eslogan">
              <path transform={AJUSTE_ESLOGAN} fill="#A9A9A9" stroke="#A9A9A9" strokeWidth={PESO_ESLOGAN} strokeLinejoin="round" d={ESLOGAN} />
            </g>
          </g>
        </>
      )}
    </svg>
  );
}
