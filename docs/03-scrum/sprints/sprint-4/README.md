# Sprint 4

Versión oficial con portada: [Sprint_4.pdf](Sprint_4.pdf).

**Sprint Goal:** Completar el sistema para la entrega: facturación electrónica, firma y verificación de estados, tablero y razones financieras, empresa de demostración y modo didáctico, con la documentación y la defensa listas.

**Fechas:** Del martes 24 de noviembre al viernes 4 de diciembre de 2026.

**Compromiso:** 14 historias · 64 puntos · 42 tareas · 113 horas.

## Historias comprometidas

| ID | Historia | Prioridad | Pts |
|---|---|---|---:|
| HU-14 | Interfaz en inglés | Debería | 3 |
| HU-53 | Factura electrónica | Debería | 8 |
| HU-54 | Comprobante de crédito fiscal electrónico | Debería | 5 |
| HU-55 | Notas de crédito y débito electrónicas | Debería | 3 |
| HU-56 | Firma, sello simulado y representación gráfica | Debería | 5 |
| HU-57 | Invalidación de DTE | Debería | 2 |
| HU-83 | Tablero con gráficas | Debería | 5 |
| HU-84 | Razones financieras | Debería | 3 |
| HU-85 | Proyecciones de meses siguientes | Debería | 8 |
| HU-86 | Empresa de demostración | Debería | 3 |
| HU-87 | Firma digital de estados financieros | Debería | 8 |
| HU-88 | Portal de verificación | Debería | 3 |
| HU-89 | Modo didáctico | Podría | 3 |
| HU-91 | Caso de una sociedad | Podría | 5 |

## Tareas

### HU-14 Interfaz en inglés

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T01 | Textos en inglés y preferencia de idioma por usuario | @kevinguardad | Backend | 2 |
| S4-T02 | Selector de idioma y revisión de todos los textos | @Carlos-Gnd | Frontend | 2 |
| S4-T03 | Pruebas: cada pantalla tiene su traducción y el idioma persiste | @NelsonDev10 | QA | 1 |

### HU-53 Factura electrónica

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T04 | Generar el DTE de factura con el esquema del Ministerio de Hacienda | @leninalejan | Backend | 6 |
| S4-T05 | Pantalla de emisión de factura electrónica | @bremondhernandez7 | Frontend | 6 |
| S4-T06 | Pruebas: el JSON de la factura valida contra el esquema y coincide con la venta | @Carlos-Gnd | QA | 2 |

### HU-54 Comprobante de crédito fiscal electrónico

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T07 | Generar el DTE de comprobante de crédito fiscal | @leninalejan | Backend | 4 |
| S4-T08 | Pantalla de emisión del CCF electrónico | @bremondhernandez7 | Frontend | 4 |
| S4-T09 | Pruebas: el CCF electrónico coincide con los CCF de CheroPhonex | @Carlos-Gnd | QA | 1 |

### HU-55 Notas de crédito y débito electrónicas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T10 | Generar las notas de crédito y débito electrónicas | @leninalejan | Backend | 2 |
| S4-T11 | Pantalla de notas de crédito y débito electrónicas | @bremondhernandez7 | Frontend | 2 |
| S4-T12 | Pruebas: la nota referencia el documento original y ajusta el IVA | @Carlos-Gnd | QA | 1 |

### HU-56 Firma, sello simulado y representación gráfica

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T13 | Firma, sello simulado y representación gráfica del DTE | @leninalejan | Backend | 4 |
| S4-T14 | Visor de la representación gráfica con su código QR | @bremondhernandez7 | Frontend | 4 |
| S4-T15 | Pruebas: la firma se verifica y un cambio al documento la invalida | @Carlos-Gnd | QA | 1 |

### HU-57 Invalidación de DTE

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T16 | Invalidación de DTE con motivo y evento de invalidación | @leninalejan | Backend | 2 |
| S4-T17 | Diálogo de invalidación de un documento | @NelsonDev10 | Frontend | 2 |
| S4-T18 | Pruebas: un documento invalidado no se puede volver a emitir | @ReneAraniva | QA | 1 |

### HU-83 Tablero con gráficas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T19 | Consultas del tablero: ventas, utilidad, efectivo e inventario por período | @kevinguardad | Backend | 4 |
| S4-T20 | Tablero con gráficas | @NelsonDev10 | Frontend | 4 |
| S4-T21 | Pruebas: las cifras del tablero coinciden con los estados de CheroPhonex | @ReneAraniva | QA | 1 |

### HU-84 Razones financieras

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T22 | Cálculo de razones financieras de liquidez, endeudamiento y rentabilidad | @kevinguardad | Backend | 2 |
| S4-T23 | Pantalla de razones financieras con su interpretación | @NelsonDev10 | Frontend | 2 |
| S4-T24 | Pruebas: las razones de CheroPhonex coinciden con el cálculo manual | @ReneAraniva | QA | 1 |

### HU-85 Proyecciones de meses siguientes

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T25 | Proyección de ventas, costos y utilidad de los meses siguientes | @kevinguardad | Backend | 6 |
| S4-T26 | Pantalla de proyecciones con supuestos editables | @NelsonDev10 | Frontend | 6 |
| S4-T27 | Pruebas: la proyección respeta los supuestos y no modifica datos reales | @ReneAraniva | QA | 2 |

### HU-86 Empresa de demostración

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T28 | Empresa de demostración con el caso CheroPhonex precargado y reinicio | @kevinguardad | Backend | 2 |
| S4-T29 | Acceso a la empresa de demostración desde el inicio | @Carlos-Gnd | Frontend | 2 |
| S4-T30 | Pruebas: reiniciar la demostración devuelve exactamente el caso | @NelsonDev10 | QA | 1 |

### HU-87 Firma digital de estados financieros

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T31 | Firma digital de los estados financieros con huella y sello | @leninalejan | Backend | 6 |
| S4-T32 | Pantalla para firmar y descargar los estados firmados | @ReneAraniva | Frontend | 6 |
| S4-T33 | Pruebas: un estado firmado se verifica y un cambio lo invalida | @bremondhernandez7 | QA | 2 |

### HU-88 Portal de verificación

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T34 | Portal público de verificación de estados firmados | @leninalejan | Backend | 2 |
| S4-T35 | Página de verificación por código | @ReneAraniva | Frontend | 2 |
| S4-T36 | Pruebas: el portal confirma un estado firmado y rechaza uno alterado | @bremondhernandez7 | QA | 1 |

### HU-89 Modo didáctico

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T37 | Modo didáctico: explicaciones de cada partida y regla contable | @kevinguardad | Backend | 2 |
| S4-T38 | Panel didáctico en las pantallas de partidas | @ReneAraniva | Frontend | 2 |
| S4-T39 | Pruebas: el modo didáctico no cambia ningún dato | @bremondhernandez7 | QA | 1 |

### HU-91 Caso de una sociedad

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S4-T40 | Caso de una sociedad: reserva legal, impuesto y capital social | @kevinguardad | Backend | 4 |
| S4-T41 | Pantalla del caso de sociedad con sus estados | @Carlos-Gnd | Frontend | 4 |
| S4-T42 | Pruebas: la reserva legal y el impuesto de la sociedad coinciden con el cálculo manual | @NelsonDev10 | QA | 1 |

## Plan de ejecución

| Día | Enfoque |
|---|---|
| Martes 24 | Planning del sprint 4 con todo el equipo y arranque de las tareas. |
| Miércoles 25 | Notas electrónicas, firma e invalidación de DTE. |
| Jueves 26 | Preparación del avance del jueves 27: demostración con CheroPhonex. |
| Viernes 27 | Presentación de avance al docente. |
| Sábado 28 al lunes 30 | Tablero, razones, proyecciones e idiomas. |
| Martes 1 al miércoles 2 | Firma digital, verificación, modo didáctico y caso de sociedad. |
| Jueves 3 y viernes 4 | Corrección de errores, manuales, ensayo de la defensa y entrega el viernes 4. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Firma y sello de DTE más complejos de lo estimado | Media | Medio | Se simulan el sello y el ambiente de pruebas; se valida contra el esquema publicado. |
| Cierre del proyecto con poco margen | Media | Alto | Dejar el jueves 3 y el viernes 4 solo para correcciones, manuales y ensayo de la defensa. |
| Integración de muchos cambios al final | Alta | Medio | Fusionar a main a diario y mantener el orden de fusión en el grupo. |
| Defensa sin ensayar | Media | Alto | Ensayo completo el miércoles 2 con las preguntas probables del docente. |

## Guion de demostración (Sprint Review)

1. Emitir una factura y un CCF electrónicos, firmarlos y mostrar su representación gráfica.
2. Invalidar un documento y emitir una nota de crédito.
3. Firmar los estados financieros y verificarlos en el portal público.
4. Tablero con gráficas, razones financieras y proyecciones de CheroPhonex.
5. Empresa de demostración con el modo didáctico y la interfaz en inglés.

## Sprint Review

_Se completa el 3 de diciembre._

## Sprint Retrospective

_Se completa el 3 de diciembre._
