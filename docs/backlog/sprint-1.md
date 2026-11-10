# Sprint 1

**Objetivo:** Tener el sistema publicado en internet, con inicio de sesión, empresas, sucursales, usuarios y permisos, el catálogo de cuentas y el registro y contabilización de partidas funcionando de punta a punta.

**Fechas:** Del lunes 10 al domingo 16 de noviembre de 2026.

**Compromiso:** 19 historias, 80 puntos.

## Ceremonias

| Ceremonia | Cuándo | Propósito |
|---|---|---|
| Planificación | Lunes 10 de noviembre | Revisión de este backlog, asignación de tareas y acuerdos técnicos |
| Daily | Todos los días (15 min, presencial o por mensaje) | Qué hice, qué haré, qué me bloquea |
| Revisión | Domingo 16 de noviembre | Demostración en el ambiente publicado; el PO acepta o rechaza cada historia |
| Retrospectiva | Domingo 16 de noviembre | Qué funcionó, qué no y qué cambiamos en el sprint 2 |

## Tareas

### HU-01 Monorepo y calidad de código (5 pts)

- [ ] Crear el monorepo con pnpm, apps/web, apps/api y packages/shared — Carlos (3 h)
- [ ] Configurar ESLint, Prettier, Vitest y scripts comunes — Lenin (3 h)
- [ ] Workflow de GitHub Actions (lint, test, build) — Carlos (2 h)
- [ ] README y guía de contribución (ramas, commits, PR) — René (2 h)

### HU-02 Despliegue continuo (3 pts)

- [ ] Proyecto en Supabase y conexión de Prisma — Carlos (2 h)
- [ ] Despliegue de la API en Render con /health — Kevin (2 h)
- [ ] Despliegue de la web en Vercel — Nelson (2 h)

### HU-03 Modelo de datos base (8 pts)

- [ ] Esquema Prisma de organización, catálogo, períodos y partidas — Carlos (5 h)
- [ ] Triggers de cuadre y bloqueo de período — Carlos (3 h)
- [ ] Trigger y tabla de bitácora inmutable — Carlos (3 h)
- [ ] Semilla con datos de prueba — Lenin (2 h)

### HU-04 Base de interfaz e idiomas (3 pts)

- [ ] Layout principal adaptable (menú, encabezado, tema) — Bremond (5 h)
- [ ] Componentes base de shadcn/ui — Nelson (3 h)
- [ ] Configuración de react-i18next y archivos es/en — Bremond (2 h)

### HU-05 Inicio de sesión (3 pts)

- [ ] Pantallas de inicio de sesión y recuperación — Nelson (3 h)
- [ ] Verificación del JWT de Supabase en la API — Kevin (3 h)

### HU-06 Registro de empresas (5 pts)

- [ ] API de empresas con validación de NIT y NRC — Lenin (3 h)
- [ ] Pantalla de registro y edición de empresa con logotipo — René (4 h)

### HU-07 Sucursales (3 pts)

- [ ] API de sucursales — Lenin (2 h)
- [ ] Pantalla de sucursales — René (2 h)

### HU-08 Usuarios y roles (5 pts)

- [ ] API de invitación y asignación de roles y sucursales — Kevin (4 h)
- [ ] Pantalla de usuarios y roles — Bremond (3 h)

### HU-09 Empresa y sucursal activa (3 pts)

- [ ] Selector de empresa y sucursal activa — Nelson (3 h)
- [ ] Middleware de empresa activa en la API — Kevin (2 h)

### HU-10 Control de permisos (5 pts)

- [ ] Tablas y semilla de la matriz de permisos — Carlos (2 h)
- [ ] Guard de permisos en NestJS — Kevin (3 h)
- [ ] Ocultar opciones en la interfaz según permisos — René (2 h)
- [ ] Pruebas por rol — Lenin (3 h)

### HU-11 Consulta de bitácora (3 pts)

- [ ] API de consulta de bitácora con filtros — Lenin (2 h)
- [ ] Pantalla de bitácora con exportación — Bremond (3 h)

### HU-15 Mantenimiento de cuentas (5 pts)

- [ ] API de cuentas con validación jerárquica — Kevin (4 h)
- [ ] Pantalla de mantenimiento de cuentas — Nelson (4 h)

### HU-16 Catálogo empresarial precargado (3 pts)

- [ ] Catálogo empresarial (persona natural y sociedad) como semilla — Carlos (3 h)

### HU-17 Importación desde Excel (5 pts)

- [ ] Importación de catálogo y saldos con ExcelJS y validación — Lenin (4 h)
- [ ] Pantalla de importación con reporte de errores — Bremond (3 h)

### HU-18 Vista en árbol del catálogo (2 pts)

- [ ] Vista en árbol con búsqueda — Nelson (3 h)

### HU-19 Ejercicios y períodos (3 pts)

- [ ] API de ejercicios y períodos — Kevin (2 h)
- [ ] Pantalla de ejercicios y períodos — René (2 h)

### HU-20 Registro de partidas manuales (8 pts)

- [ ] Reglas de dominio de partidas (cuadre, cuentas válidas) con pruebas — Carlos (4 h)
- [ ] API de partidas — Lenin (4 h)
- [ ] Formulario de partida con detalle dinámico — René (6 h)

### HU-21 Borradores y bandeja de pendientes (3 pts)

- [ ] Bandeja de pendientes de cuadre — Bremond (3 h)

### HU-22 Contabilización de partidas (5 pts)

- [ ] Caso de uso contabilizar con correlativo bloqueado — Carlos (3 h)
- [ ] Acción de contabilizar individual y por lote en la interfaz — René (2 h)

## Definición de terminado

- El código está en main mediante pull request revisado por otro integrante.
- Lint y pruebas pasan en GitHub Actions.
- La funcionalidad está publicada y se probó en el ambiente en línea.
- Se respetan los permisos de la matriz.
- Los textos de la interfaz están en los archivos de idioma.
- El Product Owner aceptó la historia en la revisión del sprint.
