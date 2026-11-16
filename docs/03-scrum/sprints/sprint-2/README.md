# Sprint 2

Versión oficial con portada: [Sprint_2.pdf](Sprint_2.pdf).

**Sprint Goal:** Llevar el ciclo contable desde la partida hasta los estados: corregir y anular partidas, cerrar períodos y obtener libro diario, libro mayor, balanzas, hoja de trabajo, estado de resultados y balance general, verificados al centavo con el caso CheroPhonex.

**Fechas:** Del lunes 17 al domingo 23 de noviembre de 2026.

**Compromiso:** 14 historias · 59 puntos · 52 tareas · 98 horas (más 7 tareas arrastradas del sprint 1, 13 horas).

## Historias comprometidas

| ID | Historia | Prioridad | Pts |
|---|---|---|---:|
| HU-12 | Parámetros de la empresa | Debe | 3 |
| HU-23 | Edición con historial | Debe | 5 |
| HU-24 | Anulación por reversión | Debe | 3 |
| HU-25 | Libro diario en formato de clase | Debe | 8 |
| HU-27 | Libro mayor columnar | Debe | 5 |
| HU-28 | Mayor en esquemas T | Debe | 3 |
| HU-29 | Alertas de saldo contrario | Debería | 2 |
| HU-30 | Balanzas de comprobación | Debe | 5 |
| HU-31 | Hoja de trabajo de 10 columnas | Debe | 5 |
| HU-32 | Cierre de período mensual | Debe | 3 |
| HU-33 | Reapertura excepcional de período | Debe | 2 |
| HU-37 | Estado de resultados | Debe | 5 |
| HU-38 | Balance general | Debe | 5 |
| HU-90 | Caso CheroPhonex reproducible | Debe | 5 |

## Tareas

### HU-12 Parámetros de la empresa

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T01 | Esquema y migración de parámetros de la empresa con bloqueo si hay movimientos | @Carlos-Gnd | Base de datos | 2 |
| S2-T02 | API: consultar y actualizar parámetros, con bitácora | @leninalejan | Backend | 2 |
| S2-T03 | Pantalla de parámetros de la empresa | @NelsonDev10 | Frontend | 2 |
| S2-T04 | Pruebas: parámetros bloqueados cuando ya hay partidas | @leninalejan | QA | 1 |

### HU-23 Edición con historial

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T05 | Esquema de versiones de la partida (historial) y trigger | @Carlos-Gnd | Base de datos | 2 |
| S2-T06 | API: editar una partida contabilizada creando una versión nueva | @kevinguardad | Backend | 3 |
| S2-T07 | API: consultar las versiones anteriores de una partida | @kevinguardad | Backend | 1 |
| S2-T08 | Pantalla: editar una partida contabilizada de un período abierto | @ReneAraniva | Frontend | 2 |
| S2-T09 | Pantalla: historial de versiones de la partida | @ReneAraniva | Frontend | 2 |
| S2-T10 | Pruebas: versiones, bitácora y bloqueo en período cerrado | @kevinguardad | QA | 1 |

### HU-24 Anulación por reversión

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T11 | Caso de uso: partida de reversión que referencia la original y la marca anulada | @Carlos-Gnd | Backend | 2 |
| S2-T12 | API: anular con motivo obligatorio y permiso de contador | @leninalejan | Backend | 1 |
| S2-T13 | Diálogo de anulación con motivo | @bremondhernandez7 | Frontend | 1 |
| S2-T14 | Pruebas: la reversión invierte debe y haber, cuadra y queda en bitácora | @Carlos-Gnd | QA | 1 |

### HU-25 Libro diario en formato de clase

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T15 | Consulta del libro diario con filtros de fechas, tipo de partida y sucursal | @leninalejan | Backend | 3 |
| S2-T16 | Folios y totales Vienen y Pasan por página | @leninalejan | Backend | 2 |
| S2-T17 | Pantalla del libro diario con filtros | @bremondhernandez7 | Frontend | 3 |
| S2-T18 | Exportación a PDF en el formato de clase | @NelsonDev10 | Frontend | 3 |
| S2-T19 | Exportación a Excel | @NelsonDev10 | Frontend | 1 |
| S2-T20 | Pruebas: totales y paginación contra el caso CheroPhonex | @leninalejan | QA | 2 |

### HU-27 Libro mayor columnar

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T21 | Consulta del libro mayor con saldo acumulado y filtros | @kevinguardad | Backend | 3 |
| S2-T22 | Pantalla del libro mayor columnar | @bremondhernandez7 | Frontend | 3 |
| S2-T23 | Exportación a PDF y Excel | @bremondhernandez7 | Frontend | 2 |
| S2-T24 | Pruebas de saldos por cuenta | @kevinguardad | QA | 1 |

### HU-28 Mayor en esquemas T

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T25 | Pantalla del mayor en esquemas T | @NelsonDev10 | Frontend | 3 |
| S2-T26 | Pruebas de la disposición de debe y haber en el esquema T | @NelsonDev10 | QA | 1 |

### HU-29 Alertas de saldo contrario

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T27 | Regla de saldo contrario a la naturaleza de la cuenta | @kevinguardad | Backend | 1 |
| S2-T28 | Indicador de alerta en el mayor y la balanza | @NelsonDev10 | Frontend | 1 |

### HU-30 Balanzas de comprobación

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T29 | Consulta de las tres balanzas (antes de ajustes, ajustada y posterior al cierre) | @Carlos-Gnd | Backend | 3 |
| S2-T30 | Pantalla de balanzas, por sucursal o consolidada | @ReneAraniva | Frontend | 3 |
| S2-T31 | Exportación a PDF y Excel | @NelsonDev10 | Frontend | 2 |
| S2-T32 | Pruebas: totales de debe y haber iguales y diferencia indicada | @Carlos-Gnd | QA | 1 |

### HU-31 Hoja de trabajo de 10 columnas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T33 | Cálculo de las 10 columnas de la hoja de trabajo | @kevinguardad | Backend | 3 |
| S2-T34 | Pantalla de la hoja de trabajo | @ReneAraniva | Frontend | 3 |
| S2-T35 | Exportación a Excel | @NelsonDev10 | Frontend | 1 |
| S2-T36 | Pruebas: utilidad o pérdida cuadrada entre las dos últimas secciones | @Carlos-Gnd | QA | 1 |

### HU-32 Cierre de período mensual

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T37 | API: cerrar un período, listando los borradores que lo impiden | @kevinguardad | Backend | 2 |
| S2-T38 | Pantalla: cerrar un período desde la lista de ejercicios | @ReneAraniva | Frontend | 1 |
| S2-T39 | Pruebas: un período cerrado rechaza partidas y ediciones, y el cierre queda en bitácora | @Carlos-Gnd | QA | 1 |

### HU-33 Reapertura excepcional de período

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T40 | API: reapertura excepcional con motivo y permiso de administrador | @kevinguardad | Backend | 1 |
| S2-T41 | Diálogo de reapertura con motivo | @ReneAraniva | Frontend | 1 |

### HU-37 Estado de resultados

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T42 | Consulta del estado de resultados por período, sucursal o consolidado | @leninalejan | Backend | 3 |
| S2-T43 | Pantalla del estado de resultados | @ReneAraniva | Frontend | 3 |
| S2-T44 | Exportación a Excel | @NelsonDev10 | Frontend | 1 |
| S2-T45 | Pruebas: coincide al centavo con la hoja de trabajo | @leninalejan | QA | 1 |

### HU-38 Balance general

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T46 | Consulta del balance general a una fecha, por sucursal o consolidado | @leninalejan | Backend | 3 |
| S2-T47 | Pantalla del balance general | @bremondhernandez7 | Frontend | 2 |
| S2-T48 | Pruebas: activo igual a pasivo más patrimonio y diferencia indicada | @leninalejan | QA | 1 |

### HU-90 Caso CheroPhonex reproducible

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S2-T49 | Script que carga el caso CheroPhonex completo | @Carlos-Gnd | Base de datos | 4 |
| S2-T50 | Prueba automatizada que compara balanza, estado de resultados y balance al centavo | @Carlos-Gnd | QA | 3 |
| S2-T51 | Ejecutar la prueba del caso en cada pull request | @Carlos-Gnd | DevOps | 1 |
| S2-T52 | Documentar el caso y cómo reproducirlo | @ReneAraniva | Documentación | 1 |

## Tareas arrastradas del sprint 1

| ID | Tarea | Responsable | Horas |
|---|---|---|---:|
| S1-T42 | Mostrar el logotipo en el encabezado (HU-06) | @ReneAraniva | 1 |
| S1-T48 | Pantalla de usuarios con invitación (HU-08) | @bremondhernandez7 | 2 |
| S1-T49 | Diálogo de asignación de rol y sucursales (HU-08) | @bremondhernandez7 | 2 |
| S1-T61 | Reglas de código jerárquico y naturaleza, con pruebas (HU-15) | @kevinguardad | 2 |
| S1-T70 | Generar la partida de apertura en borrador (HU-17) | @kevinguardad | 2 |
| S1-T83 | Pantalla de bandeja de pendientes (HU-21) | @bremondhernandez7 | 2 |
| S1-T88 | Prueba E2E: registrar y contabilizar una partida (HU-22) | @bremondhernandez7 | 2 |

## Plan de ejecución

| Día | Enfoque |
|---|---|
| Lunes 17 | Planificación. Parámetros de la empresa, anulación y cierre del sprint 1. |
| Martes 18 | Edición con historial, cierre y reapertura de períodos. |
| Miércoles 19 | Libro diario y libro mayor. |
| Jueves 20 | Esquemas T, alertas y balanzas. |
| Viernes 21 | Hoja de trabajo, estado de resultados y balance general. |
| Sábado 22 | Caso CheroPhonex reproducible y pruebas de punta a punta. |
| Domingo 23 | Corrección de errores, revisión del sprint y retrospectiva. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Errores de cálculo en balanzas y estados | Media | Alto | decimal.js en todo cálculo, la prueba CheroPhonex al centavo en cada pull request y revisión cruzada de las consultas. |
| Exportar a PDF en el formato de clase toma más de lo estimado | Media | Medio | Hacer primero la consulta y la pantalla; el PDF se prueba con el libro diario desde el miércoles. |
| Tareas del sprint 1 sin cerrar se acumulan | Media | Medio | Terminarlas el lunes y martes; quien no avance las libera en el daily para reasignarlas. |
| Variables de entorno distintas entre ambientes | Baja | Medio | Verificar producción tras cada despliegue con el inicio de sesión y una consulta real. |
| Carga académica de otras materias | Alta | Medio | Daily diario para detectar atrasos; redistribuir tareas a mitad de semana. |
| Alcance total mayor a la velocidad del equipo | Alta | Alto | Refinamiento del jueves para recortar el sprint 3 y el sprint 4 por prioridad antes del avance. |

## Guion de demostración (Sprint Review)

1. Corregir una partida contabilizada y consultar sus versiones; anular otra con motivo y ver su reversión.
2. Cerrar un período y comprobar que rechaza partidas nuevas; reabrirlo con motivo.
3. Imprimir el libro diario en el formato de clase y exportarlo a PDF y Excel.
4. Consultar el libro mayor de una cuenta, en columnas y en esquema T, con alerta de saldo contrario.
5. Generar las balanzas y la hoja de trabajo de 10 columnas y comprobar que cuadran.
6. Obtener el estado de resultados y el balance general de CheroPhonex y compararlos con el ejercicio del docente.
7. Ejecutar la prueba automatizada del caso CheroPhonex.

## Sprint Review

_Se completa el 23 de noviembre._

## Sprint Retrospective

_Se completa el 23 de noviembre._
