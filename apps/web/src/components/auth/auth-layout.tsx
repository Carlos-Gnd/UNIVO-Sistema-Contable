import type { ReactNode } from "react";

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

function AuthLayout({ branding, children }: AuthLayoutProps) {
  return (
    <main className="grid flex-1 p-0 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
      <aside className="hidden flex-col justify-between border-r border-sidebar-border bg-sidebar px-10 py-9 text-sidebar-foreground lg:flex xl:px-14 2xl:px-20">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-[4.5rem] place-items-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground"
          >
            SC
          </span>
          <span className="text-xl font-semibold tracking-tight">{branding.brand}</span>
        </div>

        <div className="max-w-2xl space-y-6 py-12">
          <h1 className="text-5xl leading-[1.12] font-medium tracking-tight xl:text-6xl">
            {branding.tagline}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground xl:text-xl">
            {branding.supportingText}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{branding.contextLine}</p>
      </aside>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="w-full max-w-[520px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground"
            >
              SC
            </span>
            <span className="font-semibold text-foreground">{branding.brand}</span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export { AuthLayout };
