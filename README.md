# Sistema Contable UNIVO

Sistema contable web **multiempresa y multisucursal** para empresas salvadoreñas (persona natural y sociedades).
Proyecto final de la cátedra _Aplicación de Técnicas Contables_ — Universidad de Oriente (UNIVO), San Miguel.

## Alcance

- **Núcleo contable:** catálogo de cuentas, partidas (borradores, contabilización, reversión), libro diario en formato de clase, mayor (columnar y esquemas T), balanzas, hoja de trabajo, estados financieros, cierre y reapertura.
- **Módulos operativos:** IVA (libros, F-07, pago a cuenta, retenciones), compras y ventas, inventario con kardex, cuentas por cobrar y por pagar, planilla, bancos y activo fijo.
- **Valor agregado:** facturación electrónica (DTE) simulada con el esquema de Hacienda, firma digital de estados financieros, tablero con gráficas y proyecciones financieras.

## En línea

| Servicio | URL                                                                                               | Se despliega                        |
| -------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Web      | [univo-sistema-contable.vercel.app](https://univo-sistema-contable.vercel.app)                    | Vercel, en cada push a `main`       |
| API      | [univo-sistema-contable-api.onrender.com](https://univo-sistema-contable-api.onrender.com/health) | Render, cuando el CI de `main` pasa |

El pie de la web muestra la versión y el commit desplegado (por ejemplo `v0.1.0+d2d2759`). La API gratuita de Render se duerme tras 15 minutos sin uso: la primera petición tarda cerca de un minuto. Detalles en la [guía de despliegue](docs/06-manuales/despliegue.md).

## Stack

| Capa          | Tecnología                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| Interfaz      | React + Vite + TypeScript, TanStack Router/Query/Table, Tailwind, shadcn/ui |
| API           | NestJS + TypeScript, Prisma                                                 |
| Base de datos | PostgreSQL (Supabase)                                                       |
| Hosting       | Vercel (web), Render (API), Supabase (BD)                                   |
| Pruebas       | Vitest, Playwright                                                          |

## Estructura (monolito modular por dominios)

```
apps/web/src/modules/<dominio>   interfaz por dominio
apps/api/src/modules/<dominio>   API por dominio (contabilidad con capas domain/application/infrastructure)
packages/shared                  Dinero (decimal.js), reglas de partidas, esquemas Zod y tipos
packages/db                      esquema y migraciones de Prisma, triggers contables y pruebas
docs/                            requerimientos, producto, scrum, arquitectura, BD, manuales y defensa
```

Dominios: `organizacion`, `catalogo`, `contabilidad`, `reportes`, `tributario`, `facturacion`, `inventario`, `comercial`, `planilla`, `tesoreria`, `activo-fijo`, `auditoria`, `respaldo`, `firma`, `analitica`.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env        # pedir los valores al Scrum Master
pnpm db:generate            # genera el cliente de Prisma
pnpm test                   # pruebas (las de la base necesitan PostgreSQL local, ver packages/db)
```

## Planificación

Scrum con sprints semanales. Avance: **27 de noviembre de 2026**. Entrega y defensa: **4 de diciembre de 2026**.

- [Documentación](docs/README.md)
- [Product Backlog](docs/02-producto/product-backlog.md) · [Historias de usuario](docs/02-producto/historias-de-usuario.md)
- [Sprint 1](docs/03-scrum/sprints/sprint-1/README.md) · [Marco Scrum](docs/03-scrum/README.md)
- [Tablero de GitHub Projects](https://github.com/users/Carlos-Gnd/projects/9)

## Equipo

| Integrante                        | Rol principal            |
| --------------------------------- | ------------------------ |
| Granados Amaya Carlos Alberto     | Scrum Master y DBA       |
| Pacheco Araniva René Francisco    | Product Owner y frontend |
| Hernández Coreas Lenin Alejandro  | Backend                  |
| Guardado Ortez Kevin Bladimir     | Backend                  |
| Hernández Coreas Bremond Antony   | Frontend                 |
| Rodríguez Quintanilla Nelson René | Frontend                 |

## Flujo de trabajo

- Una rama por historia: `feat/HU-XX-descripcion-corta` (o `fix/…`, `docs/…`).
- Commits en español con prefijo convencional: `feat(contabilidad): contabilizar partidas por lote (HU-21)`.
- Todo cambio entra a `main` por pull request revisado por otro integrante y con la integración continua en verde.
- El pull request cierra su issue con `Closes #N`.
