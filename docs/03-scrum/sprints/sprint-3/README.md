# Sprint 3

Versión oficial con portada: [Sprint_3.pdf](Sprint_3.pdf).

**Sprint Goal:** Completar los módulos operativos del sistema: cierre anual, estados financieros completos, libros de IVA, compras y ventas, inventario, planilla, bancos y activos fijos, todos verificados con el caso CheroPhonex.

**Fechas:** Del domingo 22 al lunes 23 de noviembre de 2026 (adelantado respecto del calendario original).

**Compromiso:** 44 historias · 181 puntos · 132 tareas · 319 horas.

## Historias comprometidas

| ID | Historia | Prioridad | Pts |
|---|---|---|---:|
| HU-13 | Respaldo y restauración por empresa | Debe | 8 |
| HU-26 | Partidas recurrentes | Podría | 3 |
| HU-34 | Cálculo del impuesto sobre la renta | Debe | 5 |
| HU-35 | Partida de cierre anual | Debe | 8 |
| HU-36 | Partida de reapertura | Debe | 3 |
| HU-39 | Exportación de estados con firmas | Debe | 3 |
| HU-40 | Estado de cambios en el patrimonio | Debe | 3 |
| HU-41 | Estado de flujo de efectivo | Debe | 8 |
| HU-42 | Formato de clase o NIIF para las PYMES | Debe | 3 |
| HU-43 | Estados comparativos | Debe | 3 |
| HU-44 | Notas a los estados financieros | Debería | 3 |
| HU-45 | Libro de compras | Debe | 5 |
| HU-46 | Libro de ventas a contribuyentes | Debe | 3 |
| HU-47 | Libro de ventas a consumidor final | Debe | 3 |
| HU-48 | Liquidación del IVA (F-07) | Debe | 5 |
| HU-49 | Pago a cuenta y retenciones de renta | Debe | 5 |
| HU-50 | Retención y percepción del 1 % de IVA | Debe | 3 |
| HU-51 | Anexos del F-07 en CSV | Podría | 3 |
| HU-52 | Calendario tributario | Podría | 2 |
| HU-58 | Clientes y proveedores | Debe | 3 |
| HU-59 | Registro de compras | Debe | 8 |
| HU-60 | Registro de ventas | Debe | 8 |
| HU-61 | Devoluciones y rebajas | Debe | 5 |
| HU-62 | Abonos de cuentas por cobrar y por pagar | Debe | 3 |
| HU-63 | Antigüedad de saldos | Debe | 3 |
| HU-64 | Productos y categorías | Debe | 3 |
| HU-65 | Kardex con costo promedio y PEPS | Debe | 8 |
| HU-66 | Costo específico por número de serie | Debería | 5 |
| HU-67 | Alertas de reabastecimiento | Debería | 2 |
| HU-68 | Toma física de inventario | Debería | 3 |
| HU-69 | Sistema de inventario analítico | Podría | 3 |
| HU-70 | Empleados | Debe | 3 |
| HU-71 | Tasas y tabla de retención configurables | Debe | 2 |
| HU-72 | Cálculo de planilla | Debe | 8 |
| HU-73 | Boletas de pago | Debe | 3 |
| HU-74 | Vacaciones, aguinaldo e indemnización | Debe | 5 |
| HU-75 | Planillas de ISSS y AFP | Debería | 3 |
| HU-76 | Caja general y cuentas bancarias | Debe | 2 |
| HU-77 | Caja chica | Debe | 3 |
| HU-78 | Cheques, remesas y notas bancarias | Debe | 3 |
| HU-79 | Conciliación bancaria | Debe | 5 |
| HU-80 | Importación del estado de cuenta | Podría | 3 |
| HU-81 | Registro de activos fijos | Debe | 3 |
| HU-82 | Depreciación automática | Debe | 5 |

## Tareas

### HU-13 Respaldo y restauración por empresa

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T01 | Respaldo y restauración por empresa: exportación y restauración en una transacción | @Carlos-Gnd | Base de datos | 6 |
| S3-T02 | Pantalla de respaldos: crear, listar y restaurar con confirmación | @Carlos-Gnd | Frontend | 6 |
| S3-T03 | Pruebas: restaurar devuelve los mismos datos y respeta el aislamiento por empresa | @Carlos-Gnd | QA | 2 |

### HU-26 Partidas recurrentes

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T04 | Plantillas de partidas recurrentes y generación del borrador del período | @Carlos-Gnd | Backend | 2 |
| S3-T05 | Pantalla de partidas recurrentes | @Carlos-Gnd | Frontend | 2 |
| S3-T06 | Pruebas: la recurrente genera el borrador del mes y no duplica | @Carlos-Gnd | QA | 1 |

### HU-34 Cálculo del impuesto sobre la renta

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T07 | Cálculo del ISR del ejercicio con pagos a cuenta acreditables | @Carlos-Gnd | Backend | 4 |
| S3-T08 | Pantalla del cálculo del impuesto con su detalle | @Carlos-Gnd | Frontend | 4 |
| S3-T09 | Pruebas: tramos del ISR y pagos a cuenta acreditados | @Carlos-Gnd | QA | 1 |

### HU-35 Partida de cierre anual

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T10 | Partida de cierre anual: resultados, impuesto y utilidad al patrimonio, con bloqueo del ejercicio | @Carlos-Gnd | Base de datos | 6 |
| S3-T11 | Pantalla de cierre anual con vista previa de la partida | @Carlos-Gnd | Frontend | 6 |
| S3-T12 | Pruebas: el cierre deja las cuentas de resultado en cero y conserva el balance | @Carlos-Gnd | QA | 2 |

### HU-36 Partida de reapertura

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T13 | Partida de reapertura con los saldos de balance del ejercicio cerrado | @Carlos-Gnd | Backend | 2 |
| S3-T14 | Pantalla de reapertura del ejercicio | @Carlos-Gnd | Frontend | 2 |
| S3-T15 | Pruebas: la reapertura traslada exactamente los saldos del cierre | @Carlos-Gnd | QA | 1 |

### HU-39 Exportación de estados con firmas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T16 | Datos de firmas del contador y del representante para los estados | @ReneAraniva | Backend | 2 |
| S3-T17 | Exportación de estados a PDF y Excel con espacios de firma | @ReneAraniva | Frontend | 2 |
| S3-T18 | Pruebas: la exportación incluye firmas y respeta el formato | @ReneAraniva | QA | 1 |

### HU-40 Estado de cambios en el patrimonio

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T19 | Estado de cambios en el patrimonio: capital, utilidad y retiros del período | @ReneAraniva | Backend | 2 |
| S3-T20 | Pantalla del estado de cambios en el patrimonio | @ReneAraniva | Frontend | 2 |
| S3-T21 | Pruebas: el patrimonio final de CheroPhonex coincide con el balance general | @ReneAraniva | QA | 1 |

### HU-41 Estado de flujo de efectivo

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T22 | Estado de flujo de efectivo por método indirecto | @ReneAraniva | Backend | 6 |
| S3-T23 | Pantalla del estado de flujo de efectivo | @ReneAraniva | Frontend | 6 |
| S3-T24 | Pruebas: el efectivo final de CheroPhonex coincide con el balance | @ReneAraniva | QA | 2 |

### HU-42 Formato de clase o NIIF para las PYMES

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T25 | Formato de estados según el parámetro de la empresa: de clase o NIIF para las PYMES | @ReneAraniva | Backend | 2 |
| S3-T26 | Selector de formato en las pantallas de estados | @ReneAraniva | Frontend | 2 |
| S3-T27 | Pruebas: el mismo ejercicio se presenta en los dos formatos con las mismas cifras | @ReneAraniva | QA | 1 |

### HU-43 Estados comparativos

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T28 | Estados comparativos de dos períodos con variación | @ReneAraniva | Backend | 2 |
| S3-T29 | Pantalla de estados comparativos | @ReneAraniva | Frontend | 2 |
| S3-T30 | Pruebas: la variación es la diferencia exacta entre períodos | @ReneAraniva | QA | 1 |

### HU-44 Notas a los estados financieros

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T31 | Notas a los estados financieros: texto editable por empresa y período | @ReneAraniva | Backend | 2 |
| S3-T32 | Editor de notas en los estados | @ReneAraniva | Frontend | 2 |
| S3-T33 | Pruebas: las notas se guardan, se versionan y aparecen al exportar | @ReneAraniva | QA | 1 |

### HU-45 Libro de compras

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T34 | Libro de compras desde las compras registradas | @ReneAraniva | Backend | 4 |
| S3-T35 | Pantalla y exportación del libro de compras | @ReneAraniva | Frontend | 4 |
| S3-T36 | Pruebas: el libro de compras de CheroPhonex coincide con el ejercicio | @ReneAraniva | QA | 1 |

### HU-46 Libro de ventas a contribuyentes

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T37 | Libro de ventas a contribuyentes desde las ventas con CCF | @ReneAraniva | Backend | 2 |
| S3-T38 | Pantalla y exportación del libro de ventas a contribuyentes | @ReneAraniva | Frontend | 2 |
| S3-T39 | Pruebas: el total coincide con los ocho CCF de CheroPhonex | @ReneAraniva | QA | 1 |

### HU-47 Libro de ventas a consumidor final

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T40 | Libro de ventas a consumidor final con el resumen por rango de facturas | @ReneAraniva | Backend | 2 |
| S3-T41 | Pantalla y exportación del libro de ventas a consumidor final | @ReneAraniva | Frontend | 2 |
| S3-T42 | Pruebas: el total coincide con los resúmenes de consumidor final de CheroPhonex | @ReneAraniva | QA | 1 |

### HU-48 Liquidación del IVA (F-07)

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T43 | Liquidación del IVA (F-07): débito, crédito, remanente y saldo por pagar | @ReneAraniva | Backend | 4 |
| S3-T44 | Pantalla de la liquidación del IVA | @ReneAraniva | Frontend | 4 |
| S3-T45 | Pruebas: IVA por pagar de CheroPhonex US$ 643.67 | @ReneAraniva | QA | 1 |

### HU-49 Pago a cuenta y retenciones de renta

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T46 | Pago a cuenta del 1.75 % y retenciones de renta con sus partidas | @ReneAraniva | Backend | 4 |
| S3-T47 | Pantalla de pago a cuenta y retenciones | @ReneAraniva | Frontend | 4 |
| S3-T48 | Pruebas: pago a cuenta de CheroPhonex US$ 805.90 | @ReneAraniva | QA | 1 |

### HU-50 Retención y percepción del 1 % de IVA

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T49 | Retención y percepción del 1 % de IVA en compras y ventas | @ReneAraniva | Backend | 2 |
| S3-T50 | Indicadores de retención y percepción en los registros | @ReneAraniva | Frontend | 2 |
| S3-T51 | Pruebas: la retención y la percepción se calculan sobre la base correcta | @ReneAraniva | QA | 1 |

### HU-51 Anexos del F-07 en CSV

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T52 | Anexos del F-07 en CSV desde los libros de IVA | @ReneAraniva | Backend | 2 |
| S3-T53 | Descarga de anexos en CSV | @ReneAraniva | Frontend | 2 |
| S3-T54 | Pruebas: el CSV coincide con los libros del período | @ReneAraniva | QA | 1 |

### HU-52 Calendario tributario

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T55 | Calendario tributario con vencimientos por obligación | @ReneAraniva | Backend | 2 |
| S3-T56 | Pantalla del calendario tributario | @ReneAraniva | Frontend | 2 |
| S3-T57 | Pruebas: los vencimientos caen en el día hábil que corresponde | @ReneAraniva | QA | 1 |

### HU-58 Clientes y proveedores

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T58 | Clientes y proveedores con NIT, NRC y giro: esquema y API | @ReneAraniva | Base de datos | 2 |
| S3-T59 | Pantalla de clientes y proveedores | @ReneAraniva | Frontend | 2 |
| S3-T60 | Pruebas: NIT y NRC únicos por empresa y permisos | @ReneAraniva | QA | 1 |

### HU-59 Registro de compras

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T61 | Registro de compras con IVA, entrada al kardex y partida automática | @ReneAraniva | Backend | 6 |
| S3-T62 | Pantalla de registro de compras | @ReneAraniva | Frontend | 6 |
| S3-T63 | Pruebas: las compras de CheroPhonex generan las partidas y el kardex esperados | @ReneAraniva | QA | 2 |

### HU-60 Registro de ventas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T64 | Registro de ventas (CCF y consumidor final) con costo de ventas y partida automática | @ReneAraniva | Backend | 6 |
| S3-T65 | Pantalla de registro de ventas | @ReneAraniva | Frontend | 6 |
| S3-T66 | Pruebas: las ventas de CheroPhonex coinciden al centavo con el ejercicio | @ReneAraniva | QA | 2 |

### HU-61 Devoluciones y rebajas

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T67 | Devoluciones y rebajas sobre compras y ventas con su partida | @ReneAraniva | Backend | 4 |
| S3-T68 | Pantalla de devoluciones y rebajas | @ReneAraniva | Frontend | 4 |
| S3-T69 | Pruebas: la devolución revierte IVA, inventario y saldo | @ReneAraniva | QA | 1 |

### HU-62 Abonos de cuentas por cobrar y por pagar

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T70 | Abonos de cuentas por cobrar y por pagar con su partida | @ReneAraniva | Backend | 2 |
| S3-T71 | Pantalla de abonos | @ReneAraniva | Frontend | 2 |
| S3-T72 | Pruebas: el saldo del cliente y proveedor baja exactamente con cada abono | @ReneAraniva | QA | 1 |

### HU-63 Antigüedad de saldos

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T73 | Antigüedad de saldos por cliente y proveedor | @ReneAraniva | Backend | 2 |
| S3-T74 | Pantalla de antigüedad de saldos | @ReneAraniva | Frontend | 2 |
| S3-T75 | Pruebas: los tramos suman el saldo total | @ReneAraniva | QA | 1 |

### HU-64 Productos y categorías

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T76 | Esquema y API de productos y categorías con código único por empresa | @Carlos-Gnd | Base de datos | 2 |
| S3-T77 | Pantalla de productos y categorías | @Carlos-Gnd | Frontend | 2 |
| S3-T78 | Pruebas: código único por empresa, permisos y bitácora de productos | @Carlos-Gnd | QA | 1 |

### HU-65 Kardex con costo promedio y PEPS

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T79 | Kardex con costo promedio ponderado y PEPS: movimientos, saldos y valuación | @Carlos-Gnd | Base de datos | 6 |
| S3-T80 | Pantalla del kardex por producto con entradas, salidas y saldo | @Carlos-Gnd | Frontend | 6 |
| S3-T81 | Pruebas: el kardex coincide con el costo de ventas de CheroPhonex y cambia según el método de valuación | @Carlos-Gnd | QA | 2 |

### HU-66 Costo específico por número de serie

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T82 | Costo específico por número de serie: esquema y API | @Carlos-Gnd | Base de datos | 4 |
| S3-T83 | Pantalla de series por producto | @Carlos-Gnd | Frontend | 4 |
| S3-T84 | Pruebas: una serie no se vende dos veces y su costo es el de su compra | @Carlos-Gnd | QA | 1 |

### HU-67 Alertas de reabastecimiento

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T85 | Punto de reorden por producto y consulta de alertas | @Carlos-Gnd | Backend | 2 |
| S3-T86 | Indicador y lista de productos por reabastecer | @Carlos-Gnd | Frontend | 2 |
| S3-T87 | Pruebas: la alerta aparece al llegar al punto de reorden | @Carlos-Gnd | QA | 1 |

### HU-68 Toma física de inventario

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T88 | Toma física de inventario: conteo, diferencias y partida de ajuste | @Carlos-Gnd | Backend | 2 |
| S3-T89 | Pantalla de toma física con diferencias | @Carlos-Gnd | Frontend | 2 |
| S3-T90 | Pruebas: la partida de ajuste cuadra y deja el kardex igual al conteo | @Carlos-Gnd | QA | 1 |

### HU-69 Sistema de inventario analítico

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T91 | Sistema de inventario analítico: costo por documento sin kardex perpetuo | @Carlos-Gnd | Backend | 2 |
| S3-T92 | Pantalla de inventario analítico | @Carlos-Gnd | Frontend | 2 |
| S3-T93 | Pruebas: el costo de ventas analítico coincide con el kardex perpetuo | @Carlos-Gnd | QA | 1 |

### HU-70 Empleados

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T94 | Esquema y API de empleados con puesto, área, salario y fecha de ingreso | @Carlos-Gnd | Base de datos | 2 |
| S3-T95 | Pantalla de empleados | @Carlos-Gnd | Frontend | 2 |
| S3-T96 | Pruebas: validaciones del empleado y permisos | @Carlos-Gnd | QA | 1 |

### HU-71 Tasas y tabla de retención configurables

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T97 | Tasas de ISSS y AFP y tabla de retención de renta como parámetros editables con bitácora | @Carlos-Gnd | Base de datos | 2 |
| S3-T98 | Pantalla de tasas y tabla de retención | @Carlos-Gnd | Frontend | 2 |
| S3-T99 | Pruebas: cambiar una tasa cambia el cálculo y queda en bitácora | @Carlos-Gnd | QA | 1 |

### HU-72 Cálculo de planilla

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T100 | Cálculo de planilla: ISSS, AFP, renta, neto y partida contable con Dinero | @Carlos-Gnd | Backend | 6 |
| S3-T101 | Pantalla de planilla con el cálculo por empleado y su partida | @Carlos-Gnd | Frontend | 6 |
| S3-T102 | Pruebas: la planilla de CheroPhonex coincide al centavo con el ejercicio | @Carlos-Gnd | QA | 2 |

### HU-73 Boletas de pago

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T103 | Boleta de pago por empleado con ingresos y descuentos | @Carlos-Gnd | Backend | 2 |
| S3-T104 | Boleta de pago en PDF | @Carlos-Gnd | Frontend | 2 |
| S3-T105 | Pruebas: la boleta coincide con el cálculo de la planilla | @Carlos-Gnd | QA | 1 |

### HU-74 Vacaciones, aguinaldo e indemnización

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T106 | Vacaciones, aguinaldo e indemnización: cálculo y partidas de provisión | @Carlos-Gnd | Backend | 4 |
| S3-T107 | Pantalla de prestaciones por empleado | @Carlos-Gnd | Frontend | 4 |
| S3-T108 | Pruebas: provisiones de CheroPhonex al centavo | @Carlos-Gnd | QA | 1 |

### HU-75 Planillas de ISSS y AFP

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T109 | Planillas de ISSS y AFP para declarar | @Carlos-Gnd | Backend | 2 |
| S3-T110 | Pantalla y exportación de las planillas legales | @Carlos-Gnd | Frontend | 2 |
| S3-T111 | Pruebas: totales de cuota laboral y patronal contra la planilla | @Carlos-Gnd | QA | 1 |

### HU-76 Caja general y cuentas bancarias

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T112 | Caja general y cuentas bancarias: esquema, API y cuentas del catálogo | @Carlos-Gnd | Base de datos | 2 |
| S3-T113 | Pantalla de caja y cuentas bancarias | @Carlos-Gnd | Frontend | 2 |
| S3-T114 | Pruebas: saldo por cuenta y acceso por sucursal | @Carlos-Gnd | QA | 1 |

### HU-77 Caja chica

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T115 | Caja chica como fondo fijo: apertura, gastos y reintegro con sus partidas | @Carlos-Gnd | Backend | 2 |
| S3-T116 | Pantalla de caja chica | @Carlos-Gnd | Frontend | 2 |
| S3-T117 | Pruebas: el saldo vuelve al fondo al reintegrar y no queda negativo | @Carlos-Gnd | QA | 1 |

### HU-78 Cheques, remesas y notas bancarias

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T118 | Cheques, remesas y notas bancarias con su partida contable | @Carlos-Gnd | Backend | 2 |
| S3-T119 | Pantalla de movimientos bancarios | @Carlos-Gnd | Frontend | 2 |
| S3-T120 | Pruebas: el saldo bancario del libro coincide con los movimientos | @Carlos-Gnd | QA | 1 |

### HU-79 Conciliación bancaria

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T121 | Conciliación bancaria: movimientos conciliados, pendientes y diferencia | @Carlos-Gnd | Backend | 4 |
| S3-T122 | Pantalla de conciliación bancaria | @Carlos-Gnd | Frontend | 4 |
| S3-T123 | Pruebas: la diferencia es cero con el estado de cuenta de CheroPhonex | @Carlos-Gnd | QA | 1 |

### HU-80 Importación del estado de cuenta

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T124 | Importación del estado de cuenta desde CSV con validaciones | @Carlos-Gnd | Backend | 2 |
| S3-T125 | Pantalla de importación con vista previa y errores por fila | @Carlos-Gnd | Frontend | 2 |
| S3-T126 | Pruebas: archivo válido, con errores y duplicado | @Carlos-Gnd | QA | 1 |

### HU-81 Registro de activos fijos

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T127 | Registro de activos fijos con costo, vida útil y alta en partida | @ReneAraniva | Base de datos | 2 |
| S3-T128 | Pantalla de activos fijos | @ReneAraniva | Frontend | 2 |
| S3-T129 | Pruebas: el alta genera la partida y el activo en el balance | @ReneAraniva | QA | 1 |

### HU-82 Depreciación automática

| ID | Tarea | Responsable | Área | Horas |
|---|---|---|---|---:|
| S3-T130 | Depreciación mensual automática con partida de ajuste | @ReneAraniva | Backend | 4 |
| S3-T131 | Pantalla de depreciación por activo | @ReneAraniva | Frontend | 4 |
| S3-T132 | Pruebas: la depreciación de CheroPhonex es US$ 104.17 al mes | @ReneAraniva | QA | 1 |

## Plan de ejecución

| Día | Enfoque |
|---|---|
| Domingo 22 (mañana) | Carlos: habilitadores de René (productos, kardex, caja y bancos, empleados, tasas y planilla). |
| Domingo 22 (tarde) | René: estados financieros, que no dependen de los habilitadores. |
| Lunes 23 (mañana) | Carlos: cierre anual, planilla completa, bancos, inventario avanzado, respaldo y recurrentes. |
| Lunes 23 (tarde) | René: clientes, compras y ventas, libros de IVA, obligaciones tributarias y activos fijos, ya con los habilitadores de Carlos. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Volumen: 181 puntos en dos días | Alta | Alto | Trabajar por oleadas con los habilitadores primero, tareas gruesas de tres por historia, revisión continua de pull requests y asistentes de código para la API y las pruebas. |
| Un pull request sin revisar frena a los demás | Alta | Medio | Los demás integrantes dedican estos dos días a revisar y aprobar los pull requests de Carlos y René en menos de dos horas. |
| René depende de entregas de Carlos | Media | Alto | Carlos entrega primero productos, kardex, caja y bancos, empleados y planilla; cada historia tiene un solo responsable para no cruzar dependencias. |
| Errores de cálculo en impuestos, planilla e inventario | Media | Alto | Cada historia tiene una prueba contra el caso CheroPhonex al centavo, que corre en cada pull request. |
| Conflictos al integrar muchos cambios en poco tiempo | Alta | Medio | Una rama por historia, integración diaria con main y orden de fusión acordado en el grupo. |
| Las historias del sprint 2 sin terminar | Media | Medio | Se cierran el domingo en la tarde y no se arrastran a este sprint. |

## Guion de demostración (Sprint Review)

1. Cerrar el ejercicio: ISR, partida de cierre anual y reapertura del ejercicio siguiente.
2. Los cuatro estados financieros con firmas, en formato de clase y NIIF para las PYMES.
3. Registrar una compra y una venta y ver su partida, el kardex y los libros de IVA.
4. Liquidación del IVA y pago a cuenta de CheroPhonex contra el ejercicio del docente.
5. Calcular la planilla, la boleta, las provisiones y las planillas de ISSS y AFP.
6. Registrar movimientos bancarios y conciliar con el estado de cuenta.
7. Dar de alta un activo fijo y ver su depreciación mensual.

## Sprint Review

_Se completa el 23 de noviembre._

## Sprint Retrospective

_Se completa el 23 de noviembre._
