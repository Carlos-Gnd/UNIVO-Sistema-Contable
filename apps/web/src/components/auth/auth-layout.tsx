import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LogoAnimado } from "@/components/brand";

export type AuthBranding = {
  brand: string;
  tagline: string;
  supportingText: string;
  contextLine: string;
};

type AuthLayoutProps = {
  branding: AuthBranding;
  children: ReactNode;
};

/** La introducción se anima la primera vez que se entra; al pasar entre acceso y recuperar ya no se repite. */
let introVista = false;

/**
 * Escribe los textos uno tras otro, como una máquina de escribir, cuando termina el logotipo animado.
 * Devuelve cuántas letras lleva cada texto y cuál se está escribiendo (para el cursor).
 */
function useMaquina(textos: string[], inicio: number, ms: number[], animar: boolean) {
  const [n, setN] = useState<number[]>(() => textos.map((t) => (animar ? 0 : t.length)));
  const [fin, setFin] = useState(!animar);
  const [ini, setIni] = useState(false);
  useEffect(() => {
    if (!animar) return;
    let linea = 0;
    let car = 0;
    let cancelado = false;
    let t: ReturnType<typeof setTimeout>;
    const paso = () => {
      if (cancelado) return;
      car++;
      setIni(true);
      const l = linea;
      const c = car;
      setN((prev) => prev.map((x, i) => (i === l ? c : x)));
      if (car >= (textos[linea]?.length ?? 0)) {
        linea++;
        car = 0;
        if (linea >= textos.length) {
          t = setTimeout(() => !cancelado && setFin(true), 2500);
          return;
        }
        t = setTimeout(paso, 450);
      } else t = setTimeout(paso, ms[linea]);
    };
    t = setTimeout(paso, inicio);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
    // La animación se programa una sola vez al montar: los textos no cambian durante ella
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activa = n.findIndex((x, i) => x < (textos[i]?.length ?? 0));
  return { n, cursor: fin || !ini ? -1 : activa === -1 ? textos.length - 1 : activa };
}

/** Texto a medio escribir: lo que falta se reserva invisible para que nada se mueva ni cambie de línea. */
function Escrito({ texto, n, cursor }: { texto: string; n: number; cursor: boolean }) {
  return (
    <span aria-hidden>
      {texto.slice(0, n)}
      {cursor && <i className="eq-cursor" />}
      <span className="invisible">{texto.slice(n)}</span>
    </span>
  );
}

function AuthLayout({ branding, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  const version = t("version", { version: __APP_VERSION__ });
  const [animar] = useState(() => {
    const reducir =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    return !introVista && !reducir;
  });
  useEffect(() => {
    introVista = true;
  }, []);
  const { n, cursor } = useMaquina([branding.tagline, branding.supportingText], 4100, [46, 14], animar);
  const quieto = animar ? "" : "eq-quieto";

  return (
    <main className="grid flex-1 p-0! lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between border-r border-sidebar-border bg-sidebar p-12 text-sidebar-foreground lg:flex xl:p-16">
        <span aria-hidden />

        {/* El logotipo completo aparece; el nombre se desvanece y el titular se escribe en su lugar, junto al caballo. */}
        <div className="max-w-[472px]">
          <div className="flex items-center gap-7">
            <LogoAnimado parte="caballo" escala={0.62} className={quieto} />
            <div className="relative min-w-0 flex-1">
              <p
                aria-label={branding.tagline}
                className="text-[34px] leading-[1.12] font-light tracking-tight xl:text-[38px]"
              >
                <Escrito texto={branding.tagline} n={n[0] ?? 0} cursor={cursor === 0} />
              </p>
              <div className={`eq-sale ${quieto} absolute inset-0 flex items-center`}>
                <LogoAnimado parte="nombre" escala={0.94} className={quieto} />
              </div>
            </div>
          </div>
          <p aria-label={branding.supportingText} className="mt-9 text-lg text-muted-foreground">
            <Escrito texto={branding.supportingText} n={n[1] ?? 0} cursor={cursor === 1} />
          </p>
        </div>

        <p className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <b className="text-xs font-semibold tracking-[.28em]">{branding.brand}</b>
          <span aria-hidden className="h-3.5 w-px bg-border" />
          <span>
            {branding.contextLine} · {version}
          </span>
        </p>
      </aside>

      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-10 flex items-center justify-center gap-3 lg:hidden">
          <LogoAnimado parte="caballo" escala={0.46} className="eq-quieto" />
          <LogoAnimado parte="nombre" escala={0.68} className="eq-quieto" />
        </div>
        <div className="w-full max-w-[520px]">{children}</div>
        <p className="mt-10 text-xs text-muted-foreground lg:hidden">{version}</p>
      </section>
    </main>
  );
}

export { AuthLayout };
