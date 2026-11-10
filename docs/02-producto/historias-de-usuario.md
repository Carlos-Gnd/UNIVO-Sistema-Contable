# Historias de usuario

91 historias en 16 épicas · 384 puntos. Versión con portada: [Historias_de_Usuario.pdf](Historias_de_Usuario.pdf).

Formato: *Como [rol], quiero [funcionalidad], para [beneficio]*. Prioridad MoSCoW (Debe / Debería / Podría); puntos en escala Fibonacci.

## EP-00 Base técnica

Dominio: `transversal`

### HU-01 Monorepo y calidad de código

Como equipo de desarrollo, quiero el monorepo configurado (web, api y shared) con linters, formato, pruebas e integración continua, para trabajar todos con las mismas reglas.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 1

- pnpm workspaces con apps/web (React + Vite), apps/api (NestJS) y packages/shared.
- ESLint, Prettier y Vitest funcionando en los tres paquetes.
- GitHub Actions ejecuta lint, pruebas y build en cada pull request.
- README con instrucciones para levantar el proyecto en local.

### HU-02 Despliegue continuo

Como equipo de desarrollo, quiero el despliegue automático en Vercel, Render y Supabase, para tener el sistema publicado desde la primera semana.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- La rama main se publica sola en Vercel (web) y Render (api).
- Las variables de entorno están documentadas y fuera del repositorio.
- La API expone /health y la web muestra la versión desplegada.

### HU-03 Modelo de datos base

Como equipo de desarrollo, quiero el modelo de datos base con migraciones versionadas, para construir los módulos sobre una estructura estable.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 1

- Tablas de empresas, sucursales, usuarios, roles, permisos, cuentas, ejercicios, períodos, partidas y detalle de partidas.
- Montos en NUMERIC(14,2) y empresa_id en todas las tablas de negocio.
- Trigger que impide contabilizar partidas descuadradas o en períodos cerrados.
- Trigger de bitácora con valores anteriores y nuevos; la tabla no admite UPDATE ni DELETE.

### HU-04 Base de interfaz e idiomas

Como equipo de desarrollo, quiero el diseño general de la interfaz (menú, encabezado, tema) con soporte de idiomas, para que todas las pantallas sigan el mismo patrón.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- Layout adaptable a computadora, tableta y celular.
- react-i18next configurado; ningún texto queda escrito directo en los componentes.
- Componentes base de shadcn/ui: tabla, formulario, diálogo y notificaciones.

## EP-01 Organización y seguridad

Dominio: `organizacion / auditoria / respaldo`

### HU-05 Inicio de sesión

Como usuario, quiero iniciar sesión con correo y contraseña y poder recuperarla, para acceder al sistema de forma segura.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- Inicio y cierre de sesión con Supabase Auth.
- Recuperación de contraseña por correo.
- La API rechaza peticiones sin token válido (401).

### HU-06 Registro de empresas

Como administrador, quiero registrar una empresa con su NIT, NRC, tipo de contribuyente, actividad económica y logotipo, para llevar su contabilidad en el sistema.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 1

- Validación de formato de NIT y NRC.
- Tipo de contribuyente: persona natural o sociedad.
- Quien crea la empresa queda como su administrador.
- El logotipo se muestra en la interfaz y en los reportes.

### HU-07 Sucursales

Como administrador, quiero registrar las sucursales de la empresa con su código de establecimiento, para identificar a cuál pertenece cada registro.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- Cada empresa tiene al menos una sucursal (casa matriz).
- Código de establecimiento y punto de venta según Hacienda.
- Una sucursal con movimientos solo se puede inactivar.

### HU-08 Usuarios y roles

Como administrador, quiero invitar usuarios y asignarles un rol y sucursales en mi empresa, para controlar qué puede hacer cada persona.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 1

- Roles: administrador, contador, auxiliar contable y solo consulta.
- Un usuario puede tener roles distintos en empresas distintas.
- El auxiliar y el usuario de consulta quedan limitados a sus sucursales asignadas.
- Los cambios de rol quedan en la bitácora.

### HU-09 Empresa y sucursal activa

Como usuario con acceso a varias empresas, quiero elegir la empresa y la sucursal con la que trabajo, para ver solo su información.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- Selector visible en el encabezado.
- Todas las consultas se filtran por la empresa activa.
- Se recuerda la última selección del usuario.

### HU-10 Control de permisos

Como administrador, quiero que el sistema aplique la matriz de permisos en cada acción, para que nadie haga lo que su rol no permite.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 1

- Guard de NestJS que valida módulo y acción en cada endpoint.
- La interfaz oculta las opciones no permitidas.
- Prueba automatizada por cada rol con al menos un caso permitido y uno denegado.

### HU-11 Consulta de bitácora

Como administrador, quiero consultar la bitácora de auditoría filtrando por usuario, fecha y módulo, para saber quién hizo cada cambio.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- Muestra usuario, fecha y hora, acción, registro afectado, valores anteriores y nuevos.
- Filtros por usuario, rango de fechas, módulo y acción.
- Exportación a Excel.

### HU-12 Parámetros de la empresa

Como administrador, quiero configurar los parámetros contables de la empresa, para adaptar el sistema a su forma de trabajo.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- Numeración de partidas: por mes, por ejercicio o por tipo.
- Formato de estados: de clase o NIIF para las PYMES.
- Método de valuación por defecto y sistema perpetuo o analítico.
- Los parámetros que afectan cálculos se bloquean cuando ya hay movimientos.

### HU-13 Respaldo y restauración por empresa

Como administrador, quiero respaldar y restaurar los datos de mi empresa, para recuperarme ante errores sin afectar a otras empresas.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 3

- El respaldo genera un archivo descargable con todos los datos de la empresa.
- Se puede exportar la información de una sola sucursal.
- La restauración es por empresa completa y pide confirmación.
- Restaurar queda registrado en la bitácora.

### HU-14 Interfaz en inglés

Como usuario, quiero cambiar el idioma de la interfaz entre español e inglés, para usar el sistema en el idioma que prefiera.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- Selector de idioma en el perfil.
- Todas las pantallas y reportes traducidos.
- El formato de fecha y moneda se mantiene (dd/mm/aaaa, US$).

## EP-02 Catálogo de cuentas

Dominio: `catalogo`

### HU-15 Mantenimiento de cuentas

Como contador, quiero crear, editar e inactivar cuentas con código jerárquico y naturaleza, para adaptar el catálogo a la empresa.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 1

- Niveles: 1 clase, 2 rubro, 4 cuenta de mayor, 6 subcuenta, 8 detalle, 10 analítica.
- El código de una cuenta hija empieza con el de su cuenta padre.
- Naturaleza deudora o acreedora obligatoria.
- Una cuenta con movimientos no se elimina, solo se inactiva.

### HU-16 Catálogo empresarial precargado

Como contador, quiero que cada empresa nueva reciba un catálogo empresarial completo, para empezar a registrar sin crear todas las cuentas a mano.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- Incluye las cuentas vistas en clase más 4104 Costo de Ventas y 3108 Retiros del Titular.
- Variante para persona natural y para sociedad (patrimonio y reserva legal).
- El usuario puede modificarlo libremente después.

### HU-17 Importación desde Excel

Como contador, quiero importar el catálogo y los saldos iniciales desde Excel, para cargar la información de una empresa existente.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 1

- Plantillas descargables.
- Validación previa con reporte de errores por fila; no se carga nada si hay errores.
- Los saldos iniciales generan la partida de apertura en borrador.

### HU-18 Vista en árbol del catálogo

Como contador, quiero ver el catálogo en forma de árbol con búsqueda, para encontrar rápidamente una cuenta.

**Prioridad:** Debería · **Puntos:** 2 · **Sprint:** 1

- Expandir y contraer por nivel.
- Búsqueda por código o nombre.
- Indica si la cuenta es de último nivel (imputable).

## EP-03 Partidas y libro diario

Dominio: `contabilidad / reportes`

### HU-19 Ejercicios y períodos

Como administrador, quiero crear ejercicios con sus doce períodos mensuales, para registrar partidas en el período correcto.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- Al crear un ejercicio se generan sus períodos.
- Estado de cada período: abierto o cerrado.
- No se registran partidas fuera de un período abierto.

### HU-20 Registro de partidas manuales

Como auxiliar contable, quiero registrar una partida con fecha, tipo, concepto, documento de soporte y detalle de cuentas, para dejar constancia de una operación.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 1

- Tipos: apertura, operación, ajuste, cierre, reapertura y reversión.
- Solo se usan cuentas de último nivel y activas.
- Montos con dos decimales; los totales se calculan con decimal.js.
- Concepto y documento de soporte opcionales.

### HU-21 Borradores y bandeja de pendientes

Como auxiliar contable, quiero guardar una partida aunque no cuadre, para completarla después sin perder lo registrado.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 1

- La partida queda en estado Borrador y aparece en la bandeja de pendientes.
- Se muestra la diferencia entre debe y haber.
- Los borradores no afectan el mayor, las balanzas ni los estados.

### HU-22 Contabilización de partidas

Como contador, quiero contabilizar las partidas que cuadran, para que pasen a los libros con su número correlativo.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 1

- Solo se contabiliza si debe es igual a haber y el período está abierto.
- El número correlativo se asigna al contabilizar, sin saltos ni duplicados.
- El auxiliar no puede contabilizar.
- Se puede contabilizar por lote desde la bandeja.

### HU-23 Edición con historial

Como contador, quiero editar una partida contabilizada de un período abierto, para corregir errores conservando el historial.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Cada edición crea una nueva versión; las anteriores se pueden consultar.
- En períodos cerrados la edición está bloqueada.
- La edición queda en la bitácora.

### HU-24 Anulación por reversión

Como contador, quiero anular una partida mediante una partida de reversión, para corregir sin borrar registros.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- La reversión invierte debe y haber y referencia a la partida original.
- La partida original queda marcada como anulada.
- Se exige un motivo.

### HU-25 Libro diario en formato de clase

Como contador, quiero imprimir el libro diario en el formato de clase, para presentarlo como libro legal.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 2

- Folio, columnas Parcial, Debe y Haber.
- Totales Vienen y Pasan en cada página.
- Exportación a PDF y Excel.
- Filtros por fechas, tipo de partida y sucursal.

### HU-26 Partidas recurrentes

Como contador, quiero guardar partidas como plantillas recurrentes, para no repetir registros que se hacen cada mes.

**Prioridad:** Podría · **Puntos:** 3 · **Sprint:** 4

- Crear una plantilla desde una partida existente.
- Generar la partida del mes desde la plantilla, en borrador.

## EP-04 Libro mayor y balanzas

Dominio: `reportes`

### HU-27 Libro mayor columnar

Como contador, quiero consultar el libro mayor en formato columnar, para revisar los movimientos y el saldo de cada cuenta.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Columnas fecha, partida, concepto, debe, haber y saldo.
- Filtros por cuenta, fechas, tipo de partida y sucursal.
- Exportación a PDF y Excel.

### HU-28 Mayor en esquemas T

Como contador, quiero ver el mayor en esquemas T, para analizarlo como en clase.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- Débitos a la izquierda y créditos a la derecha con referencia a la partida.
- Totales y saldo al pie.
- Exportación a PDF.

### HU-29 Alertas de saldo contrario

Como contador, quiero ser alertado cuando una cuenta tenga saldo contrario a su naturaleza, para detectar errores de registro.

**Prioridad:** Debería · **Puntos:** 2 · **Sprint:** 2

- Indicador visible en el mayor y en las balanzas.
- Listado de cuentas con saldo contrario.

### HU-30 Balanzas de comprobación

Como contador, quiero generar las balanzas de comprobación antes de ajustes, ajustada y posterior al cierre, para verificar que los libros cuadran.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Saldos iniciales, movimientos y saldos finales.
- Totales de debe y haber iguales; si no, se indica la diferencia.
- Por sucursal o consolidada; exportación a PDF y Excel.

### HU-31 Hoja de trabajo de 10 columnas

Como contador, quiero la hoja de trabajo de 10 columnas, para preparar los estados financieros.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Balanza, ajustes, balanza ajustada, estado de resultados y balance general.
- Utilidad o pérdida cuadrada entre las dos últimas secciones.
- Exportación a Excel.

## EP-05 Ajustes y cierre

Dominio: `contabilidad / tributario`

### HU-32 Cierre de período mensual

Como contador, quiero cerrar un período mensual, para que nadie registre más partidas en él.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- No se cierra si hay borradores en el período (se listan).
- Un período cerrado no acepta partidas ni ediciones.
- El cierre queda en la bitácora.

### HU-33 Reapertura excepcional de período

Como administrador, quiero reabrir un período cerrado con una justificación, para corregir un error detectado tarde.

**Prioridad:** Debe · **Puntos:** 2 · **Sprint:** 2

- Solo el administrador puede hacerlo.
- Exige un motivo, que queda en la bitácora.

### HU-34 Cálculo del impuesto sobre la renta

Como contador, quiero que el sistema calcule el impuesto sobre la renta anual según el tipo de contribuyente, para provisionarlo en el cierre.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Persona natural: tabla progresiva configurable.
- Sociedad: tasa configurable; reserva legal del 7 % hasta la quinta parte del capital.
- Muestra el detalle del cálculo y genera la partida de provisión.

### HU-35 Partida de cierre anual

Como contador, quiero generar automáticamente las partidas de cierre del ejercicio, para liquidar los resultados sin hacerlo a mano.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 2

- Liquida ingresos, costos y gastos contra Pérdidas y Ganancias.
- Traslada la utilidad o pérdida al patrimonio.
- La partida se genera en borrador para su revisión y luego se contabiliza.

### HU-36 Partida de reapertura

Como contador, quiero generar la partida de reapertura del ejercicio siguiente, para iniciar el nuevo año con los saldos de balance.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- Toma los saldos de las cuentas de balance al cierre.
- Se registra en el primer período del ejercicio nuevo.

## EP-06 Estados financieros

Dominio: `reportes`

### HU-37 Estado de resultados

Como contador, quiero generar el estado de resultados de un período, para conocer la utilidad o pérdida.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Ventas, costo de ventas, utilidad bruta, gastos de operación, otros ingresos y gastos, ISR y utilidad neta.
- Por sucursal o consolidado.
- Coincide al centavo con la hoja de trabajo.

### HU-38 Balance general

Como contador, quiero generar el balance general a una fecha, para conocer la situación financiera.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Activo corriente y no corriente, pasivo y patrimonio.
- Activo igual a pasivo más patrimonio; si no, se indica la diferencia.
- Por sucursal o consolidado.

### HU-39 Exportación de estados con firmas

Como contador, quiero exportar los estados financieros a PDF y Excel con espacios de firma, para presentarlos formalmente.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- Encabezado con nombre de la empresa, estado, período y moneda.
- Firmas de propietario o representante legal y contador.
- Logotipo de la empresa.

### HU-40 Estado de cambios en el patrimonio

Como contador, quiero generar el estado de cambios en el patrimonio, para mostrar la variación del capital en el ejercicio.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Saldo inicial, aportes, retiros o dividendos, reserva legal, resultado y saldo final.
- Columnas según el tipo de contribuyente.

### HU-41 Estado de flujo de efectivo

Como contador, quiero generar el estado de flujo de efectivo por el método indirecto, para explicar la variación del efectivo.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 3

- Actividades de operación, inversión y financiamiento.
- La variación neta coincide con la de caja y bancos.

### HU-42 Formato de clase o NIIF para las PYMES

Como contador, quiero elegir entre el formato de clase y el formato NIIF para las PYMES, para presentar los estados según se requiera.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- El formato se elige al generar el estado.
- Ambos formatos dan las mismas cifras.

### HU-43 Estados comparativos

Como contador, quiero comparar estados entre meses o ejercicios, para analizar la evolución de la empresa.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Dos o más períodos lado a lado.
- Variación absoluta y porcentual.

### HU-44 Notas a los estados financieros

Como contador, quiero redactar las notas a los estados financieros, con datos que el sistema llena solo, para completar el juego de estados.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- Plantilla de notas con datos de la empresa y políticas contables.
- Tablas automáticas (por ejemplo, detalle de activo fijo o inventario).
- Exportación a PDF junto con los estados.

## EP-07 IVA y obligaciones tributarias

Dominio: `tributario`

### HU-45 Libro de compras

Como contador, quiero que el libro de compras se llene solo con las compras registradas, para cumplir con el Art. 141 del Código Tributario.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 3

- Columnas según el formato legal (fecha, documento, NRC, proveedor, compras exentas y gravadas, crédito fiscal, retenciones).
- Exportación a PDF y Excel.

### HU-46 Libro de ventas a contribuyentes

Como contador, quiero el libro de ventas a contribuyentes generado automáticamente, para declarar el débito fiscal.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Lista los CCF y notas emitidos con su débito fiscal.
- Exportación a PDF y Excel.

### HU-47 Libro de ventas a consumidor final

Como contador, quiero el libro de ventas a consumidor final generado automáticamente, para declarar las ventas al detalle.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Resumen diario por rango de facturas.
- Exportación a PDF y Excel.

### HU-48 Liquidación del IVA (F-07)

Como contador, quiero la liquidación mensual del IVA con su remanente, para preparar la declaración F-07.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 3

- Débito fiscal menos crédito fiscal, retenciones y percepciones.
- Remanente trasladado automáticamente al mes siguiente.
- Genera la partida de liquidación (con confirmación).

### HU-49 Pago a cuenta y retenciones de renta

Como contador, quiero calcular el pago a cuenta del 1.75 % y las retenciones de renta, para preparar la declaración F-14.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 3

- Pago a cuenta sobre ingresos brutos del mes.
- Retenciones de planilla y de servicios.
- Genera sus partidas.

### HU-50 Retención y percepción del 1 % de IVA

Como contador, quiero que el sistema aplique la retención o percepción del 1 % según la clasificación del contribuyente, para cumplir con la ley.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Se aplica según la clasificación de la empresa y del cliente o proveedor.
- Se refleja en los libros de IVA y en la liquidación.

### HU-51 Anexos del F-07 en CSV

Como contador, quiero generar los anexos del F-07 en CSV, para cargarlos directo en el portal de Hacienda.

**Prioridad:** Podría · **Puntos:** 3 · **Sprint:** 4

- Archivos con la estructura de columnas exigida por Hacienda.
- Validación de campos obligatorios antes de exportar.

### HU-52 Calendario tributario

Como contador, quiero un calendario con las fechas de vencimiento tributarias, para no presentar tarde las declaraciones.

**Prioridad:** Podría · **Puntos:** 2 · **Sprint:** 4

- Vencimientos de F-07, F-14 y planillas de ISSS y AFP.
- Alerta en el tablero cuando faltan cinco días o menos.

## EP-08 Facturación electrónica (DTE)

Dominio: `facturacion`

### HU-53 Factura electrónica

Como auxiliar contable, quiero emitir facturas de consumidor final como DTE, para facturar según el esquema de Hacienda.

**Prioridad:** Debería · **Puntos:** 8 · **Sprint:** 4

- JSON validado contra el esquema oficial con ajv.
- Código de generación (UUID) y número de control con códigos de establecimiento y punto de venta.
- La venta y su partida se registran automáticamente.

### HU-54 Comprobante de crédito fiscal electrónico

Como auxiliar contable, quiero emitir CCF como DTE, para vender a otros contribuyentes.

**Prioridad:** Debería · **Puntos:** 5 · **Sprint:** 4

- Exige NIT y NRC del cliente.
- Calcula IVA y, si aplica, retención o percepción.

### HU-55 Notas de crédito y débito electrónicas

Como contador, quiero emitir notas de crédito y débito como DTE, para documentar devoluciones y ajustes de precio.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- Referencian al DTE original.
- Ajustan IVA, inventario y cuentas por cobrar.

### HU-56 Firma, sello simulado y representación gráfica

Como auxiliar contable, quiero que cada DTE quede firmado, con sello de recepción simulado y su PDF con QR, para entregarlo al cliente.

**Prioridad:** Debería · **Puntos:** 5 · **Sprint:** 4

- Firma JWS con el certificado de la empresa.
- Sello de recepción simulado con fecha y hora.
- PDF de representación gráfica con QR de consulta.

### HU-57 Invalidación de DTE

Como contador, quiero invalidar un DTE emitido por error, para dejarlo sin efecto como establece Hacienda.

**Prioridad:** Debería · **Puntos:** 2 · **Sprint:** 4

- Exige motivo y genera el evento de invalidación.
- Revierte la partida asociada.

## EP-09 Compras, ventas, clientes y proveedores

Dominio: `comercial`

### HU-58 Clientes y proveedores

Como auxiliar contable, quiero registrar clientes y proveedores con NIT, NRC, actividad económica y clasificación, para usarlos en compras, ventas y libros de IVA.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- Validación de NIT y NRC.
- Clasificación: grande, mediano u otro contribuyente.
- Importación desde Excel.

### HU-59 Registro de compras

Como auxiliar contable, quiero registrar una compra con su documento, para que actualice inventario, IVA, cuentas por pagar y contabilidad en un solo paso.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 3

- Datos del CCF o factura del proveedor (obligatorios).
- Genera la partida en borrador para el contador.
- Actualiza kardex, libro de compras y cuentas por pagar si es al crédito.

### HU-60 Registro de ventas

Como auxiliar contable, quiero registrar una venta, para que actualice inventario, IVA, cuentas por cobrar y contabilidad en un solo paso.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 3

- Genera la partida de venta y la de costo de ventas.
- Actualiza kardex, libro de ventas y cuentas por cobrar si es al crédito.
- No permite vender sin existencias.

### HU-61 Devoluciones y rebajas

Como contador, quiero registrar devoluciones y rebajas sobre compras y ventas, para reflejar sus efectos en IVA, inventario y saldos.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 3

- Mediante notas de crédito y débito.
- Generan sus partidas automáticamente.

### HU-62 Abonos de cuentas por cobrar y por pagar

Como auxiliar contable, quiero registrar abonos de clientes y pagos a proveedores, para mantener sus saldos al día.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Abonos parciales o totales a uno o varios documentos.
- Generan la partida contra caja o bancos.

### HU-63 Antigüedad de saldos

Como contador, quiero el reporte de antigüedad de saldos, para gestionar cobros y pagos atrasados.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Rangos de 0–30, 31–60, 61–90 y más de 90 días.
- Por cliente o proveedor; exportación a PDF y Excel.

## EP-10 Inventario

Dominio: `inventario`

### HU-64 Productos y categorías

Como auxiliar contable, quiero registrar productos con categoría, existencia mínima y método de valuación, para controlar el inventario.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- Código, nombre, categoría, unidad, mínimo y método.
- El método se bloquea cuando el producto tiene movimientos.
- Importación desde Excel.

### HU-65 Kardex con costo promedio y PEPS

Como contador, quiero el kardex de cada producto por sucursal, para conocer existencias y costo según el método elegido.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 3

- Entradas, salidas y saldo en unidades y valores.
- Costo promedio y PEPS calculados exactamente.
- Exportación a PDF y Excel.

### HU-66 Costo específico por número de serie

Como contador, quiero controlar productos por número de serie o IMEI, para aplicar el costo específico de cada unidad.

**Prioridad:** Debería · **Puntos:** 5 · **Sprint:** 4

- Se registra la serie en la compra y se elige en la venta.
- El costo de ventas usa el costo exacto de esa unidad.

### HU-67 Alertas de reabastecimiento

Como auxiliar contable, quiero ver los productos por debajo de su existencia mínima, para pedirlos a tiempo.

**Prioridad:** Debería · **Puntos:** 2 · **Sprint:** 4

- Listado y aviso en el tablero.

### HU-68 Toma física de inventario

Como contador, quiero registrar el conteo físico y generar el ajuste por diferencias, para que el inventario contable coincida con el real.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- El auxiliar registra el conteo; el contador aprueba.
- Genera la partida de faltantes o sobrantes.

### HU-69 Sistema de inventario analítico

Como contador, quiero llevar el inventario por el sistema analítico, para empresas que no usan el perpetuo.

**Prioridad:** Podría · **Puntos:** 3 · **Sprint:** 4

- Cuentas de compras, rebajas y devoluciones.
- Costo de ventas determinado al cierre con el inventario final.

## EP-11 Planilla y prestaciones

Dominio: `planilla`

### HU-70 Empleados

Como contador, quiero registrar a los empleados con su salario y datos de ISSS y AFP, para calcular la planilla.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- DUI, NIT, número de ISSS, NUP de AFP, cargo, salario y fecha de ingreso.
- Asignación a sucursal.

### HU-71 Tasas y tabla de retención configurables

Como administrador, quiero configurar las tasas de ISSS y AFP, sus techos y la tabla de retención de renta, para actualizarlas si cambia la ley.

**Prioridad:** Debe · **Puntos:** 2 · **Sprint:** 2

- Valores con vigencia por fecha.
- Valores iniciales cargados con la normativa vigente.

### HU-72 Cálculo de planilla

Como contador, quiero calcular la planilla del período, para pagar a los empleados y registrar el gasto.

**Prioridad:** Debe · **Puntos:** 8 · **Sprint:** 3

- ISSS, AFP y renta del empleado; cuotas patronales.
- Horas extra, descuentos y ausencias.
- Genera la partida de planilla.

### HU-73 Boletas de pago

Como contador, quiero emitir la boleta de pago de cada empleado, para entregarle el detalle de su salario.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- PDF individual y en lote.
- Ingresos, descuentos y líquido a pagar.

### HU-74 Vacaciones, aguinaldo e indemnización

Como contador, quiero calcular y provisionar vacaciones, aguinaldo e indemnización, para reconocer estas obligaciones.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 3

- Vacación de 15 días más 30 %; aguinaldo según antigüedad.
- Provisión mensual con su partida.

### HU-75 Planillas de ISSS y AFP

Como contador, quiero generar las planillas para el ISSS y la AFP, para presentarlas cada mes.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- Formato con los datos que exige cada institución.
- Exportación a Excel.

## EP-12 Efectivo y bancos

Dominio: `tesoreria`

### HU-76 Caja general y cuentas bancarias

Como contador, quiero registrar la caja general y las cuentas bancarias de la empresa, para controlar el efectivo.

**Prioridad:** Debe · **Puntos:** 2 · **Sprint:** 2

- Cada una vinculada a su cuenta contable.
- Saldo actual visible.

### HU-77 Caja chica

Como auxiliar contable, quiero manejar la caja chica de fondo fijo con sus reintegros, para controlar los gastos menores.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Registro de vales con su comprobante.
- Reintegro que genera la partida de gastos.

### HU-78 Cheques, remesas y notas bancarias

Como auxiliar contable, quiero registrar cheques, remesas y notas de cargo y abono, para llevar el control de cada cuenta bancaria.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 3

- Cada movimiento genera su partida.
- Estado del cheque: emitido, cobrado o anulado.

### HU-79 Conciliación bancaria

Como contador, quiero conciliar cada cuenta bancaria con su estado de cuenta, para detectar diferencias.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 3

- Marcar movimientos conciliados.
- Reporte de conciliación con partidas en tránsito.
- Exportación a PDF.

### HU-80 Importación del estado de cuenta

Como contador, quiero importar el estado de cuenta del banco en CSV, para conciliar automáticamente.

**Prioridad:** Podría · **Puntos:** 3 · **Sprint:** 4

- Coincidencia automática por monto, fecha y referencia.
- Las diferencias quedan para revisión manual.

## EP-13 Activo fijo

Dominio: `activo-fijo`

### HU-81 Registro de activos fijos

Como contador, quiero registrar los activos fijos con su costo, vida útil y método, para controlarlos y depreciarlos.

**Prioridad:** Debe · **Puntos:** 3 · **Sprint:** 2

- Categoría, costo, fecha de adquisición, valor residual, vida útil, sucursal.
- Baja de activos con su partida.

### HU-82 Depreciación automática

Como contador, quiero generar la depreciación mensual automáticamente, para no calcularla a mano.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 3

- Línea recta y porcentajes fiscales del Art. 30 de la LISR.
- Partida de depreciación del mes (con confirmación).
- Cuadro de depreciación por activo.

## EP-14 Análisis y firma digital

Dominio: `analitica / firma`

### HU-83 Tablero con gráficas

Como administrador, quiero un tablero con los indicadores y gráficas principales, para conocer la situación de la empresa de un vistazo.

**Prioridad:** Debería · **Puntos:** 5 · **Sprint:** 4

- Ventas, gastos, utilidad, efectivo y IVA por mes.
- Ventas por sucursal, productos más vendidos y antigüedad de saldos.
- Filtros por período y sucursal.

### HU-84 Razones financieras

Como contador, quiero las razones financieras calculadas automáticamente, para analizar liquidez, endeudamiento y rentabilidad.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- Liquidez corriente, prueba ácida, endeudamiento, márgenes y rentabilidad.
- Evolución mensual en gráfica.
- Punto de equilibrio.

### HU-85 Proyecciones de meses siguientes

Como administrador, quiero ver proyecciones de ventas, gastos, utilidad, flujo de efectivo e IVA para los meses siguientes, para planificar.

**Prioridad:** Debería · **Puntos:** 8 · **Sprint:** 4

- El método depende del historial: promedio móvil, regresión o Holt-Winters.
- Cada proyección muestra su rango de confianza.
- Las proyecciones no generan partidas.

### HU-86 Empresa de demostración

Como equipo de desarrollo, quiero una empresa de demostración con 24 meses de historial, para mostrar gráficas y proyecciones en la defensa.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- Datos generados con estacionalidad realista.
- Se crea con un comando y se puede reiniciar.

### HU-87 Firma digital de estados financieros

Como contador, quiero firmar digitalmente los estados financieros en PDF, para garantizar su autenticidad.

**Prioridad:** Debería · **Puntos:** 8 · **Sprint:** 4

- Autoridad certificadora simulada que emite un certificado por usuario firmante.
- Firma PAdES visible en el PDF.
- QR con enlace de verificación.

### HU-88 Portal de verificación

Como tercero que recibe un estado financiero, quiero verificar con el QR que es auténtico y no fue alterado, para confiar en él.

**Prioridad:** Debería · **Puntos:** 3 · **Sprint:** 4

- Página pública sin inicio de sesión.
- Muestra firmante, fecha y si el documento es íntegro.

### HU-89 Modo didáctico

Como usuario en formación, quiero que cada partida automática explique por qué se hizo y muestre su esquema T, para aprender con el sistema.

**Prioridad:** Podría · **Puntos:** 3 · **Sprint:** 4

- Explicación de cada línea de la partida.
- Se activa o desactiva desde el perfil.

## EP-15 Pruebas de aceptación

Dominio: `transversal`

### HU-90 Caso CheroPhonex reproducible

Como docente evaluador, quiero cargar el caso CheroPhonex y obtener exactamente los resultados del ejercicio, para comprobar que el sistema calcula bien.

**Prioridad:** Debe · **Puntos:** 5 · **Sprint:** 2

- Script que carga el caso completo.
- Prueba automatizada que compara balanza, estado de resultados y balance al centavo.
- La prueba corre en cada pull request.

### HU-91 Caso de una sociedad

Como docente evaluador, quiero un caso de prueba de una sociedad, para comprobar la reserva legal, el ISR y el patrimonio de sociedades.

**Prioridad:** Podría · **Puntos:** 5 · **Sprint:** 4

- Ejercicio completo con cierre y reapertura.
- Prueba automatizada con sus resultados esperados.

## Requerimientos no funcionales

| ID | Atributo | Requerimiento |
|---|---|---|
| RNF-01 | Precisión | Todos los montos se almacenan en NUMERIC(14,2) y se calculan con aritmética decimal exacta; los reportes cuadran al centavo. |
| RNF-02 | Seguridad | Autenticación por token, permisos validados en la API, aislamiento de datos por empresa y bitácora inmutable. |
| RNF-03 | Usabilidad | Diseño adaptable a computadora, tableta y celular; interfaz en español e inglés. |
| RNF-04 | Rendimiento | Las consultas y reportes de un mes responden en menos de 3 segundos con el volumen del caso de demostración. |
| RNF-05 | Disponibilidad | Sistema publicado en internet; respaldo por empresa descargable. |
| RNF-06 | Mantenibilidad | Código organizado por dominios, TypeScript estricto, pruebas automatizadas del motor contable e integración continua. |
| RNF-07 | Formato | Moneda US$ y fechas dd/mm/aaaa; reportes exportables a PDF y Excel. |
