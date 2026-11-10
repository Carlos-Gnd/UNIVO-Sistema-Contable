# Sistema Contable UNIVO

Sistema contable web **multiempresa y multisucursal** para empresas salvadoreñas (persona natural y sociedades).
Proyecto final de la cátedra *Aplicación de Técnicas Contables* — Universidad de Oriente (UNIVO), San Miguel.

## Alcance

- **Núcleo contable:** catálogo de cuentas, partidas (borradores, contabilización, reversión), libro diario en formato de clase, mayor (columnar y esquemas T), balanzas, hoja de trabajo, estados financieros, cierre y reapertura.
- **Módulos operativos:** IVA (libros, F-07, pago a cuenta, retenciones), compras y ventas, inventario con kardex, cuentas por cobrar y por pagar, planilla, bancos y activo fijo.
- **Valor agregado:** facturación electrónica (DTE) simulada con el esquema de Hacienda, firma digital de estados financieros, tablero con gráficas y proyecciones financieras.

## Stack

| Capa | Tecnología |
|---|---|
| Interfaz | React + Vite + TypeScript, TanStack Router/Query/Table, Tailwind, shadcn/ui |
| API | NestJS + TypeScript, Prisma |
| Base de datos | PostgreSQL (Supabase) |
| Hosting | Vercel (web), Render (API), Supabase (BD) |
| Pruebas | Vitest, Playwright |

## Estructura (monolito modular por dominios)

```
apps/web/src/modules/<dominio>   interfaz por dominio
apps/api/src/modules/<dominio>   API por dominio (contabilidad con capas domain/application/infrastructure)
packages/shared                  esquemas Zod, tipos y utilidades de dinero
docs/                            requerimientos, producto, scrum, arquitectura, BD, manuales y defensa
```

Dominios: `organizacion`, `catalogo`, `contabilidad`, `reportes`, `tributario`, `facturacion`, `inventario`, `comercial`, `planilla`, `tesoreria`, `activo-fijo`, `auditoria`, `respaldo`, `firma`, `analitica`.

## Planificación

Scrum con sprints semanales. Avance: **27 de noviembre de 2026**. Entrega y defensa: **4 de diciembre de 2026**.

- [Documentación](docs/README.md)
- [Product Backlog](docs/02-producto/product-backlog.md) · [Historias de usuario](docs/02-producto/historias-de-usuario.md)
- [Sprint 1](docs/03-scrum/sprints/sprint-1/README.md) · [Marco Scrum](docs/03-scrum/README.md)
- [Tablero de GitHub Projects](https://github.com/users/Carlos-Gnd/projects/9)

## Equipo

| Integrante | Rol principal |
|---|---|
| Granados Amaya Carlos Alberto | Scrum Master y DBA |
| Pacheco Araniva René Francisco | Product Owner y frontend |
| Hernández Coreas Lenin Alejandro | Backend |
| Guardado Ortez Kevin Bladimir | Backend |
| Hernández Coreas Bremond Antony | Frontend |
| Rodríguez Quintanilla Nelson René | Frontend |

## Flujo de trabajo

- Una rama por historia: `feat/HU-XX-descripcion-corta` (o `fix/…`, `docs/…`).
- Commits en español con prefijo convencional: `feat(contabilidad): contabilizar partidas por lote (HU-21)`.
- Todo cambio entra a `main` por pull request revisado por otro integrante y con la integración continua en verde.
- El pull request cierra su issue con `Closes #N`.
