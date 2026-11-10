# Sprint 1

Versión oficial con portada: [Sprint_1.pdf](Sprint_1.pdf).

**Sprint Goal:** Tener el sistema publicado en internet, con inicio de sesión, empresas, sucursales, usuarios y permisos, el catálogo de cuentas y el registro y contabilización de partidas funcionando de punta a punta.

**Fechas:** Del lunes 10 al domingo 16 de noviembre de 2026.

**Compromiso:** 19 historias · 80 puntos · 88 tareas · 146 horas.

## Historias comprometidas

| ID | Historia | Prioridad | Pts |
|---|---|---|---:|
| HU-01 | Monorepo y calidad de código | Debe | 5 |
| HU-02 | Despliegue continuo | Debe | 3 |
| HU-03 | Modelo de datos base | Debe | 8 |
| HU-04 | Base de interfaz e idiomas | Debe | 3 |
| HU-05 | Inicio de sesión | Debe | 3 |
| HU-06 | Registro de empresas | Debe | 5 |
| HU-07 | Sucursales | Debe | 3 |
| HU-08 | Usuarios y roles | Debe | 5 |
| HU-09 | Empresa y sucursal activa | Debe | 3 |
| HU-10 | Control de permisos | Debe | 5 |
| HU-11 | Consulta de bitácora | Debe | 3 |
| HU-15 | Mantenimiento de cuentas | Debe | 5 |
| HU-16 | Catálogo empresarial precargado | Debe | 3 |
| HU-17 | Importación desde Excel | Debe | 5 |
| HU-18 | Vista en árbol del catálogo | Debería | 2 |
| HU-19 | Ejercicios y períodos | Debe | 3 |
| HU-20 | Registro de partidas manuales | Debe | 8 |
| HU-21 | Borradores y bandeja de pendientes | Debe | 3 |
| HU-22 | Contabilización de partidas | Debe | 5 |

## Tareas

### HU-01 Monorepo y calidad de código

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T01 | Inicializar monorepo pnpm con apps/ y packages/ | @Carlos-Gnd | DevOps | 1 |
| S1-T02 | Crear apps/web con Vite, React y TypeScript estricto | @NelsonDev10 | Frontend | 1 |
| S1-T03 | Crear apps/api con NestJS y TypeScript estricto | @kevinguardad | Backend | 1 |
| S1-T04 | Crear packages/shared con Zod y exportación de tipos | @leninalejan | Backend | 1 |
| S1-T05 | Configurar ESLint y Prettier compartidos | @leninalejan | DevOps | 2 |
| S1-T06 | Configurar Vitest en los tres paquetes | @leninalejan | QA | 1 |
| S1-T07 | Workflow de GitHub Actions: lint, pruebas y build | @Carlos-Gnd | DevOps | 2 |
| S1-T08 | Proteger la rama main (PR y CI obligatorios) | @Carlos-Gnd | DevOps | 1 |
| S1-T09 | Guía de contribución: ramas, commits y pull requests | @ReneAraniva | Documentación | 1 |
| S1-T10 | README con instalación local | @ReneAraniva | Documentación | 1 |

### HU-02 Despliegue continuo

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T11 | Crear proyecto en Supabase y variables de entorno | @Carlos-Gnd | DevOps | 1 |
| S1-T12 | Conectar Prisma a Supabase y primera migración | @Carlos-Gnd | Base de datos | 1 |
| S1-T13 | Endpoint /health en la API | @kevinguardad | Backend | 1 |
| S1-T14 | Desplegar la API en Render | @kevinguardad | DevOps | 1 |
| S1-T15 | Desplegar la web en Vercel con la URL de la API | @NelsonDev10 | DevOps | 1 |
| S1-T16 | Mostrar la versión desplegada en el pie de la web | @NelsonDev10 | Frontend | 1 |
| S1-T17 | Documentar variables en .env.example | @kevinguardad | Documentación | 1 |

### HU-03 Modelo de datos base

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T18 | Diagrama entidad-relación inicial | @Carlos-Gnd | Base de datos | 2 |
| S1-T19 | Esquema: empresas, sucursales, usuarios y membresías | @Carlos-Gnd | Base de datos | 2 |
| S1-T20 | Esquema: cuentas, ejercicios y períodos | @Carlos-Gnd | Base de datos | 1 |
| S1-T21 | Esquema: partidas, detalle y correlativos | @Carlos-Gnd | Base de datos | 2 |
| S1-T22 | Trigger: impedir contabilizar descuadradas o en período cerrado | @Carlos-Gnd | Base de datos | 2 |
| S1-T23 | Tabla y trigger de bitácora inmutable | @Carlos-Gnd | Base de datos | 2 |
| S1-T24 | Pruebas SQL de los triggers | @leninalejan | QA | 2 |
| S1-T25 | Semilla con datos de prueba | @leninalejan | Base de datos | 1 |

### HU-04 Base de interfaz e idiomas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T26 | Layout principal: menú lateral y encabezado | @bremondhernandez7 | Frontend | 3 |
| S1-T27 | Diseño adaptable a tableta y celular | @bremondhernandez7 | Frontend | 2 |
| S1-T28 | Tema: colores, tipografía y modo oscuro | @NelsonDev10 | Frontend | 2 |
| S1-T29 | Instalar componentes base de shadcn/ui | @NelsonDev10 | Frontend | 1 |
| S1-T30 | Configurar react-i18next con archivos es y en | @bremondhernandez7 | Frontend | 1 |
| S1-T31 | Tabla reutilizable con paginación y filtros | @NelsonDev10 | Frontend | 3 |

### HU-05 Inicio de sesión

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T32 | Pantalla de inicio de sesión | @NelsonDev10 | Frontend | 2 |
| S1-T33 | Pantallas de recuperación y cambio de contraseña | @NelsonDev10 | Frontend | 2 |
| S1-T34 | Cliente de Supabase Auth y manejo de sesión en la web | @bremondhernandez7 | Frontend | 2 |
| S1-T35 | Guard de la API que verifica el JWT de Supabase | @kevinguardad | Backend | 2 |
| S1-T36 | Pruebas del guard de autenticación | @leninalejan | QA | 1 |

### HU-06 Registro de empresas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T37 | Validadores de NIT y NRC en packages/shared | @leninalejan | Backend | 1 |
| S1-T38 | API: crear y editar empresa | @leninalejan | Backend | 2 |
| S1-T39 | Asignar al creador como administrador | @leninalejan | Backend | 1 |
| S1-T40 | Subida del logotipo a Supabase Storage | @kevinguardad | Backend | 2 |
| S1-T41 | Formulario de empresa | @ReneAraniva | Frontend | 3 |
| S1-T42 | Mostrar el logotipo en el encabezado | @ReneAraniva | Frontend | 1 |

### HU-07 Sucursales

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T43 | API de sucursales: crear, editar e inactivar | @leninalejan | Backend | 2 |
| S1-T44 | Crear la casa matriz al registrar la empresa | @leninalejan | Backend | 1 |
| S1-T45 | Pantalla de sucursales | @ReneAraniva | Frontend | 2 |

### HU-08 Usuarios y roles

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T46 | API: invitar usuario por correo | @kevinguardad | Backend | 2 |
| S1-T47 | API: asignar rol y sucursales por empresa | @kevinguardad | Backend | 2 |
| S1-T48 | Pantalla de usuarios con invitación | @bremondhernandez7 | Frontend | 2 |
| S1-T49 | Diálogo de asignación de rol y sucursales | @bremondhernandez7 | Frontend | 2 |

### HU-09 Empresa y sucursal activa

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T50 | Middleware de empresa activa en la API | @kevinguardad | Backend | 2 |
| S1-T51 | Selector de empresa y sucursal en el encabezado | @NelsonDev10 | Frontend | 2 |
| S1-T52 | Recordar la última selección | @NelsonDev10 | Frontend | 1 |

### HU-10 Control de permisos

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T53 | Tablas y semilla de la matriz de permisos | @Carlos-Gnd | Base de datos | 2 |
| S1-T54 | Decorador @Permiso y guard en NestJS | @kevinguardad | Backend | 2 |
| S1-T55 | Endpoint de permisos del usuario actual | @kevinguardad | Backend | 1 |
| S1-T56 | Hook usePermiso para ocultar opciones | @ReneAraniva | Frontend | 2 |
| S1-T57 | Pruebas por rol: casos permitidos y denegados | @leninalejan | QA | 3 |

### HU-11 Consulta de bitácora

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T58 | API de bitácora con filtros y paginación | @leninalejan | Backend | 2 |
| S1-T59 | Pantalla de bitácora con filtros | @bremondhernandez7 | Frontend | 2 |
| S1-T60 | Exportación de la bitácora a Excel | @bremondhernandez7 | Frontend | 1 |

### HU-15 Mantenimiento de cuentas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T61 | Reglas de código jerárquico y naturaleza, con pruebas | @kevinguardad | Backend | 2 |
| S1-T62 | API de cuentas: crear, editar e inactivar | @kevinguardad | Backend | 2 |
| S1-T63 | Formulario de cuenta | @NelsonDev10 | Frontend | 2 |
| S1-T64 | Listado de cuentas | @NelsonDev10 | Frontend | 2 |

### HU-16 Catálogo empresarial precargado

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T65 | Catálogo empresarial para persona natural | @Carlos-Gnd | Base de datos | 2 |
| S1-T66 | Variante del catálogo para sociedad | @Carlos-Gnd | Base de datos | 1 |
| S1-T67 | Copiar el catálogo al crear la empresa | @leninalejan | Backend | 1 |

### HU-17 Importación desde Excel

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T68 | Plantillas de Excel descargables | @leninalejan | Backend | 1 |
| S1-T69 | Lectura y validación del Excel con ExcelJS | @leninalejan | Backend | 2 |
| S1-T70 | Generar la partida de apertura en borrador | @kevinguardad | Backend | 2 |
| S1-T71 | Pantalla de carga con reporte de errores | @bremondhernandez7 | Frontend | 3 |

### HU-18 Vista en árbol del catálogo

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T72 | Vista en árbol expandible | @NelsonDev10 | Frontend | 2 |
| S1-T73 | Búsqueda por código o nombre | @NelsonDev10 | Frontend | 1 |

### HU-19 Ejercicios y períodos

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T74 | API de ejercicios con generación de 12 períodos | @kevinguardad | Backend | 2 |
| S1-T75 | Pantalla de ejercicios y períodos | @ReneAraniva | Frontend | 2 |

### HU-20 Registro de partidas manuales

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T76 | Reglas de dominio: cuadre y cuentas válidas con decimal.js | @Carlos-Gnd | Backend | 2 |
| S1-T77 | Pruebas unitarias del dominio de partidas | @Carlos-Gnd | QA | 2 |
| S1-T78 | API: crear y editar partida en borrador | @leninalejan | Backend | 2 |
| S1-T79 | Formulario: cabecera de la partida | @ReneAraniva | Frontend | 2 |
| S1-T80 | Formulario: detalle dinámico con búsqueda de cuentas | @ReneAraniva | Frontend | 3 |
| S1-T81 | Totales de debe y haber en vivo | @ReneAraniva | Frontend | 1 |

### HU-21 Borradores y bandeja de pendientes

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T82 | API: bandeja de borradores con su diferencia | @kevinguardad | Backend | 1 |
| S1-T83 | Pantalla de bandeja de pendientes | @bremondhernandez7 | Frontend | 2 |

### HU-22 Contabilización de partidas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S1-T84 | Caso de uso contabilizar con correlativo bloqueado | @Carlos-Gnd | Backend | 2 |
| S1-T85 | Contabilización por lote | @Carlos-Gnd | Backend | 1 |
| S1-T86 | Botones de contabilizar individual y por lote | @ReneAraniva | Frontend | 1 |
| S1-T87 | Prueba de concurrencia de correlativos | @leninalejan | QA | 1 |
| S1-T88 | Prueba E2E: registrar y contabilizar una partida | @bremondhernandez7 | QA | 2 |

## Plan de ejecución

| Día | Enfoque |
|---|---|
| Lunes 10 | Planificación. Monorepo, apps base, Supabase y despliegue inicial. |
| Martes 11 | Modelo de datos y triggers; layout e idiomas en la interfaz. |
| Miércoles 12 | Inicio de sesión, empresas, sucursales y catálogo precargado. |
| Jueves 13 | Usuarios, empresa activa, permisos, ejercicios y cuentas. |
| Viernes 14 | Partidas, borradores, árbol del catálogo e importación. |
| Sábado 15 | Contabilización, bitácora y pruebas de punta a punta. |
| Domingo 16 | Corrección de errores, revisión del sprint y retrospectiva. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El modelo de datos se retrasa y bloquea a todo el equipo | Media | Alto | Carlos lo termina el martes; mientras tanto el frontend avanza con datos simulados. |
| Integrantes nuevos en NestJS o Prisma | Alta | Medio | Plantillas de módulo de referencia y uso de asistentes de código con revisión en PR. |
| Render tarda en despertar o falla el despliegue | Media | Medio | Desplegar desde el lunes y probar en línea cada día, no solo al final. |
| Errores de cálculo en los montos | Baja | Alto | decimal.js en todo cálculo, NUMERIC en la base y pruebas unitarias del dominio. |
| Carga académica de otras materias | Alta | Medio | Daily diario para detectar atrasos; redistribuir tareas a mitad de semana. |
| Invitaciones al repositorio sin aceptar | Media | Bajo | Aceptarlas el lunes antes de la planificación. |

## Guion de demostración (Sprint Review)

1. Abrir el sistema publicado en internet e iniciar sesión.
2. Registrar la empresa CheroPhonex con su logotipo y su casa matriz.
3. Invitar a un auxiliar y a un contador con sus roles.
4. Mostrar el catálogo precargado en árbol e importar saldos iniciales desde Excel.
5. Como auxiliar, registrar una partida descuadrada y verla en la bandeja de pendientes.
6. Corregirla; como contador, contabilizarla y ver su número correlativo.
7. Comprobar que el auxiliar no puede contabilizar y revisar el cambio en la bitácora.

## Sprint Review

_Se completa el 16 de noviembre._

## Sprint Retrospective

_Se completa el 16 de noviembre._
