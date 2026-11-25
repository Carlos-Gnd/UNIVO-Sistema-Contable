import { ISOLOGO } from "./trazos";

/**
 * Isologo EQUUS (`Logos/isologo_fondo_oscuro.svg`). Solo existe la versión clara sobre fondo oscuro, que es el único
 * tema del sistema: no se recolorea ni se deforma.
 */
export function Isologo({ alto = 28, className }: { alto?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 603 595"
      role="img"
      aria-label="EQUUS"
      height={alto}
      style={{ height: alto, width: "auto" }}
      className={className}
    >
      <g transform="translate(0 595) scale(0.1 -0.1)" fill="#E2E2E2">
        <path d={ISOLOGO} />
      </g>
    </svg>
  );
}
