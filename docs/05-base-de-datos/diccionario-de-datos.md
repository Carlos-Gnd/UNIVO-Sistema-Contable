# Diccionario de datos

Generado desde PostgreSQL con `packages/db/scripts/generar-diccionario.mjs`.

## Tipos enumerados

| Tipo | Valores |
|---|---|
| `clasificacion_contribuyente` | grande, mediano, otro |
| `estado_cheque_bancario` | emitido, cobrado, anulado |
| `estado_partida` | borrador, contabilizada, anulada |
| `estado_periodo` | abierto, cerrado |
| `estado_toma_fisica` | en_conteo, aprobada |
| `estado_vale_caja_chica` | por_reintegrar, reintegrado |
| `formato_estados` | clase, niif_pymes |
| `metodo_valuacion` | promedio_ponderado, peps |
| `modo_numeracion` | mensual, anual, por_tipo |
| `naturaleza` | deudora, acreedora |
| `sistema_inventario` | perpetuo, analitico |
| `tipo_contribuyente` | persona_natural, sociedad |
| `tipo_cuenta` | activo, pasivo, patrimonio, costos_gastos, ingresos, liquidadora, orden |
| `tipo_cuenta_tesoreria` | caja, banco |
| `tipo_movimiento_bancario` | cheque, remesa, nota_cargo, nota_abono |
| `tipo_movimiento_inventario` | entrada, salida |
| `tipo_partida` | apertura, operacion, ajuste, cierre, reapertura, reversion |
| `tipo_planilla_oficial` | isss, afp |
| `tipo_respaldo` | empresa, sucursal |

## bitacora

Registro inmutable de todos los cambios, con valores anteriores y nuevos.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | bigint | no | PK | `nextval('bitacora_id_seq')` | Identificador único del registro. |
| `empresa_id` | uuid | sí |  |  | Empresa a la que pertenece el registro. |
| `usuario_id` | uuid | sí |  |  | Usuario que hizo el cambio (tomado de la sesión de la API). |
| `tabla` | varchar(60) | no |  |  | Tabla modificada. |
| `registro_id` | varchar(60) | sí |  |  | Identificador del registro modificado. |
| `accion` | varchar(30) | no |  |  | Tipo de cambio: INSERT, UPDATE o DELETE. |
| `datos_anteriores` | jsonb | sí |  |  | Valores del registro antes del cambio. |
| `datos_nuevos` | jsonb | sí |  |  | Valores del registro después del cambio. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |

## cajas_chicas

Fondos fijos de caja chica abiertos por sucursal; la apertura se respalda con una partida en borrador.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del fondo fijo. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña del fondo. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal a la que pertenece el fondo fijo. |
| `cuenta_tesoreria_id` | uuid | no | FK → cuentas_tesoreria |  | Cuenta de tesorería tipo caja vinculada a la cuenta contable de caja chica. |
| `fondo_fijo` | numeric(14,2) | no |  |  | Monto fijo autorizado para el fondo, en dólares. |
| `partida_apertura_id` | uuid | no | FK → partidas |  | Partida en borrador que registra la apertura del fondo. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de apertura. |

## catalogo_base

Plantilla del catálogo empresarial que se copia a cada empresa nueva según su tipo de contribuyente.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `codigo` | varchar(10) | no | PK |  | Código de la cuenta en la plantilla. |
| `nombre` | varchar(200) | no |  |  | Nombre de la cuenta (variante sociedad o común). |
| `nombre_persona_natural` | varchar(200) | sí |  |  | Nombre alternativo para persona natural, si difiere. |
| `aplica` | varchar(20) | no |  | `ambos` | A qué contribuyentes aplica: ambos, sociedad o persona_natural. |
| `naturaleza` | naturaleza | no |  |  | Naturaleza calculada por clase; las cuentas (R) de activo y patrimonio y sus subcuentas se invierten. |
| `tipo` | tipo_cuenta | no |  |  | Clase de la cuenta según el primer dígito del código. |

## categorias_producto

Categorías con las que se agrupan los productos de una empresa.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la categoría. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña de la categoría. |
| `nombre` | varchar(80) | no |  |  | Nombre de la categoría, único por empresa. |
| `activa` | boolean | no |  | `true` | Una categoría inactiva no se ofrece al crear productos. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación. |

## conciliaciones_bancarias

Corte de conciliación bancaria por cuenta y fecha.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la conciliación. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña de la conciliación. |
| `cuenta_tesoreria_id` | uuid | no | FK → cuentas_tesoreria |  | Cuenta bancaria conciliada. |
| `fecha_corte` | date | no |  |  | Último día del período conciliado. |
| `saldo_estado` | numeric(14,2) | no |  |  | Saldo final informado por el banco a la fecha de corte. |
| `creado_por` | uuid | no | FK → usuarios |  | Usuario que inició el corte. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |

## configuraciones_isr

Versiones de tasas y tramos de ISR configurados para cada ejercicio de una empresa.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la versión de configuración anual del ISR. |
| `empresa_id` | uuid | no | FK → empresas, FK → ejercicios, FK → ejercicios |  | Empresa a la que pertenece la configuración. |
| `ejercicio_anio` | smallint | no | FK → ejercicios, FK → ejercicios |  | Año del ejercicio al que aplica la configuración. |
| `version` | smallint | no |  |  | Número consecutivo de versión dentro del ejercicio. |
| `tasa_sociedad` | numeric(5,2) | sí |  |  | Tasa porcentual configurable para el cálculo del ISR de sociedades. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora en que se creó la versión. |

## configuraciones_planilla

Tasas de ISSS, AFP y fecha de vigencia para el cálculo de planillas de una empresa.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la versión de tasas. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que aplican las tasas. |
| `vigente_desde` | date | no |  |  | Primer día en que esta versión de tasas puede usarse. |
| `tasa_isss_laboral` | numeric(5,2) | no |  |  | Porcentaje de cotización laboral al ISSS. |
| `tasa_isss_patronal` | numeric(5,2) | no |  |  | Porcentaje de cotización patronal al ISSS. |
| `techo_isss` | numeric(14,2) | no |  |  | Salario máximo sujeto a cotización al ISSS. |
| `tasa_afp_laboral` | numeric(5,2) | no |  |  | Porcentaje de cotización laboral a AFP. |
| `tasa_afp_patronal` | numeric(5,2) | no |  |  | Porcentaje de cotización patronal a AFP. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora en que se creó la versión. |

## correlativos

Último número de partida usado por empresa y ámbito de numeración.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `empresa_id` | uuid | no | PK, FK → empresas |  | Empresa a la que pertenece el registro. |
| `ambito` | varchar(40) | no | PK |  | Ámbito de numeración (por ejemplo 2026, 2026-11 o 2026-ajuste). |
| `ultimo` | integer | no |  | `0` | Último número asignado en el ámbito. |

## cuentas

Catálogo de cuentas de cada empresa; el nivel y la cuenta padre se calculan del código.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el registro. |
| `codigo` | varchar(10) | no |  |  | Código numérico de 1, 2, 4, 6, 8 o 10 dígitos (clase, rubro, mayor, subcuenta, detalle, analítica). |
| `nombre` | varchar(200) | no |  |  | Nombre de la cuenta. |
| `nivel` | smallint | no |  | `0` | Nivel jerárquico de 1 a 6, calculado a partir de la longitud del código. |
| `naturaleza` | naturaleza | no |  |  | Deudora o acreedora; se usa para detectar saldos contrarios. |
| `tipo` | tipo_cuenta | no |  |  | Clase de la cuenta: activo, pasivo, patrimonio, costos y gastos, ingresos, liquidadora u orden. |
| `cuenta_padre_id` | uuid | sí | FK → cuentas |  | Cuenta del nivel superior, calculada a partir del código. |
| `activa` | boolean | no |  | `true` | Indica si el registro está activo; los inactivos se conservan pero no se usan en registros nuevos. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación (la fija un trigger). |

## cuentas_tesoreria

Cajas y cuentas bancarias de la empresa, cada una vinculada a su cuenta contable de efectivo.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la caja o cuenta bancaria. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña. |
| `sucursal_id` | uuid | sí | FK → sucursales |  | Sucursal a la que pertenece; nulo si es de toda la empresa. |
| `cuenta_id` | uuid | no | FK → cuentas |  | Cuenta contable de efectivo (1101…) donde se registran sus movimientos; una sola caja o banco por cuenta. |
| `tipo` | tipo_cuenta_tesoreria | no |  |  | Caja o banco. |
| `nombre` | varchar(100) | no |  |  | Nombre con que se identifica, por ejemplo «Caja general» o «Banco Agrícola corriente». |
| `banco` | varchar(80) | sí |  |  | Entidad bancaria; solo en los bancos. |
| `numero_cuenta` | varchar(40) | sí |  |  | Número de la cuenta en el banco; único por empresa y banco. |
| `activa` | boolean | no |  | `true` | Una cuenta inactiva no se ofrece para nuevos movimientos. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación. |

## detalles_conciliacion_bancaria

Líneas del libro marcadas en una conciliación bancaria.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del detalle conciliado. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña del detalle. |
| `conciliacion_id` | uuid | no | FK → conciliaciones_bancarias |  | Corte al que pertenece la marca. |
| `partida_detalle_id` | uuid | no | FK → partida_detalles |  | Línea bancaria de una partida contabilizada. |
| `conciliado` | boolean | no |  | `false` | Indica si la línea aparece en el estado de cuenta. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Última actualización de la marca. |

## ejercicios

Años contables de cada empresa; al crear uno se generan sus doce períodos.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el registro. |
| `anio` | smallint | no |  |  | Año del ejercicio. |
| `fecha_inicio` | date | no |  |  | Primer día del ejercicio. |
| `fecha_fin` | date | no |  |  | Último día del ejercicio. |
| `estado` | estado_periodo | no |  | `abierto` | Abierto o cerrado. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |

## empleados

Personas empleadas por una empresa, asignadas a una sucursal para el cálculo de planillas.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del empleado. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el empleado. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal de la misma empresa a la que está asignado. |
| `dui` | varchar(20) | no |  |  | Documento Único de Identidad del empleado, único por empresa. |
| `nit` | varchar(20) | no |  |  | Número de Identificación Tributaria del empleado, único por empresa. |
| `numero_isss` | varchar(20) | no |  |  | Número de afiliación al ISSS, único por empresa. |
| `nup` | varchar(20) | no |  |  | Número Único Previsional de AFP, único por empresa. |
| `puesto` | varchar(100) | no |  |  | Puesto o cargo del empleado. |
| `area` | varchar(100) | sí |  |  | Área de trabajo del empleado, si aplica. |
| `salario` | numeric(14,2) | no |  |  | Salario mensual en dólares, no negativo. |
| `fecha_ingreso` | date | no |  |  | Fecha de ingreso del empleado. |
| `activo` | boolean | no |  | `true` | Indica si el empleado puede incluirse en nuevas planillas. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación. |
| `nombres` | varchar(100) | no |  |  | Nombres de la persona empleada; los registros previos se identifican como pendientes de completar. |
| `apellidos` | varchar(100) | no |  |  | Apellidos de la persona empleada; los registros previos se identifican como pendientes de completar. |

## empresas

Contribuyentes que llevan su contabilidad en el sistema (persona natural o sociedad).

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `nombre` | varchar(200) | no |  |  | Nombre o razón social del contribuyente. |
| `nombre_comercial` | varchar(200) | sí |  |  | Nombre comercial, si es distinto de la razón social. |
| `nit` | varchar(17) | no |  |  | Número de Identificación Tributaria; único en el sistema. |
| `nrc` | varchar(10) | sí |  |  | Número de Registro de Contribuyente del IVA. |
| `tipo_contribuyente` | tipo_contribuyente | no |  |  | Persona natural o sociedad; determina el cálculo del ISR, la reserva legal y el patrimonio. |
| `clasificacion` | clasificacion_contribuyente | no |  | `otro` | Grande, mediano u otro contribuyente; determina retenciones y percepciones del 1 % de IVA. |
| `actividad_economica` | varchar(200) | sí |  |  | Actividad económica registrada en Hacienda. |
| `direccion` | varchar(300) | sí |  |  | Dirección del domicilio fiscal. |
| `telefono` | varchar(20) | sí |  |  | Teléfono de contacto. |
| `correo` | varchar(150) | sí |  |  | Correo electrónico de contacto. |
| `logo_url` | text | sí |  |  | Ruta del logotipo en Supabase Storage; se muestra en la interfaz y en los reportes. |
| `modo_numeracion` | modo_numeracion | no |  | `anual` | Ámbito del correlativo de partidas: anual, mensual o por tipo de partida. |
| `activa` | boolean | no |  | `true` | Indica si el registro está activo; los inactivos se conservan pero no se usan en registros nuevos. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación (la fija un trigger). |
| `formato_estados` | formato_estados | no |  | `clase` | Formato de los estados financieros: de clase o NIIF para las PYMES. No afecta cálculos, se puede cambiar siempre. |
| `metodo_valuacion` | metodo_valuacion | no |  | `promedio_ponderado` | Método de valuación del inventario por defecto: promedio ponderado o PEPS. Se bloquea cuando ya hay movimientos. |
| `sistema_inventario` | sistema_inventario | no |  | `perpetuo` | Sistema de inventario: perpetuo o analítico. Se bloquea cuando ya hay movimientos. |

## lineas_estado_cuenta

Filas CSV conservadas para conciliación y revisión manual.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la fila importada. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña de la fila. |
| `conciliacion_id` | uuid | no | FK → conciliaciones_bancarias |  | Conciliación a la que pertenece el estado de cuenta. |
| `numero_fila` | smallint | no |  |  | Número original de fila en el CSV, incluye encabezado. |
| `fecha` | date | no |  |  | Fecha de la operación en el estado de cuenta. |
| `referencia` | varchar(60) | no |  |  | Referencia bancaria para conciliación automática. |
| `descripcion` | varchar(200) | no |  |  | Descripción de la operación del banco. |
| `monto` | numeric(14,2) | no |  |  | Monto firmado, positivo para depósitos y negativo para retiros. |
| `huella` | varchar(64) | no |  |  | Hash normalizado para detectar filas repetidas. |
| `partida_detalle_id` | uuid | sí | FK → partida_detalles |  | Línea de libro coincidente; nula si requiere revisión manual. |
| `importado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de importación. |

## membresia_sucursales

Sucursales a las que está limitado un usuario dentro de una empresa.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `membresia_id` | uuid | no | PK, FK → membresias |  | Membresía limitada. |
| `sucursal_id` | uuid | no | PK, FK → sucursales |  | Sucursal permitida. |

## membresias

Acceso de un usuario a una empresa con un rol; un usuario puede tener roles distintos en empresas distintas.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `usuario_id` | uuid | no | FK → usuarios |  | Usuario que tiene el acceso. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el registro. |
| `rol_id` | smallint | no | FK → roles |  | Rol del usuario en esta empresa. |
| `todas_sucursales` | boolean | no |  | `false` | Si es verdadero, ve todas las sucursales; si no, solo las de membresia_sucursales. |
| `activa` | boolean | no |  | `true` | Indica si el registro está activo; los inactivos se conservan pero no se usan en registros nuevos. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación (la fija un trigger). |

## movimientos_bancarios

Cheques, remesas y notas de cargo o abono vinculados a partidas en borrador.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del movimiento bancario. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña del movimiento. |
| `cuenta_tesoreria_id` | uuid | no | FK → cuentas_tesoreria |  | Cuenta bancaria que recibe o entrega el dinero. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal del movimiento y de sus partidas. |
| `cuenta_contrapartida_id` | uuid | no | FK → cuentas |  | Cuenta imputable contra la que se registra el movimiento. |
| `tipo` | tipo_movimiento_bancario | no |  |  | Cheque, remesa, nota de cargo o nota de abono. |
| `fecha` | date | no |  |  | Fecha del movimiento bancario. |
| `referencia` | varchar(60) | no |  |  | Número de cheque, remesa o referencia del banco, única por cuenta. |
| `comprobante` | varchar(60) | no |  |  | Número del comprobante o documento de respaldo. |
| `beneficiario` | varchar(150) | sí |  |  | Proveedor o persona beneficiaria, si aplica. |
| `concepto` | varchar(200) | no |  |  | Descripción breve del movimiento. |
| `monto` | numeric(14,2) | no |  |  | Importe positivo del movimiento, en dólares. |
| `estado_cheque` | estado_cheque_bancario | sí |  |  | Estado del cheque: emitido, cobrado o anulado; nulo para otros movimientos. |
| `fecha_estado` | date | sí |  |  | Fecha en que el cheque se cobró o anuló. |
| `partida_id` | uuid | no | FK → partidas |  | Partida original en borrador que respalda el movimiento. |
| `partida_anulacion_id` | uuid | sí | FK → partidas |  | Partida inversa en borrador que respalda la anulación del cheque. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de registro. |

## movimientos_inventario

Entradas y salidas de los productos por sucursal: el kardex se arma con ellas. No se modifican ni se borran.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del movimiento. |
| `secuencia` | bigint | no |  |  | Orden de registro; desempata los movimientos de una misma fecha. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña del producto. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal donde se guarda el producto. |
| `producto_id` | uuid | no | FK → productos |  | Producto que entra o sale. |
| `fecha` | date | no |  |  | Fecha del movimiento. |
| `tipo` | tipo_movimiento_inventario | no |  |  | Entrada (compra, ajuste) o salida (venta, ajuste). |
| `cantidad` | numeric(14,4) | no |  |  | Unidades que entran o salen; siempre positiva. |
| `costo_unitario` | numeric(14,4) | no |  |  | Costo por unidad: el de la compra en una entrada; en una salida, el que resulta del método de valuación. |
| `costo_total` | numeric(14,2) | no |  |  | Valor total del movimiento en dólares, al centavo. |
| `referencia` | varchar(60) | sí |  |  | Documento de origen (por ejemplo el CCF de la compra). |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de registro. |

## partida_detalles

Líneas de cada partida: cuenta y monto en el debe o en el haber.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `partida_id` | uuid | no | FK → partidas |  | Partida a la que pertenece la línea. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el registro. |
| `cuenta_id` | uuid | no | FK → cuentas |  | Cuenta de último nivel afectada. |
| `concepto` | text | sí |  |  | Descripción opcional de la línea. |
| `debe` | numeric(14,2) | no |  | `0` | Monto en el debe; si es mayor que cero, el haber debe ser cero. |
| `haber` | numeric(14,2) | no |  | `0` | Monto en el haber; si es mayor que cero, el debe debe ser cero. |
| `orden` | smallint | no |  | `0` | Posición de la línea dentro de la partida. |

## partida_versiones

Versiones anteriores de las partidas contabilizadas que se editaron: cómo estaban antes de cada edición.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la versión guardada. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa de la partida. |
| `partida_id` | uuid | no | FK → partidas |  | Partida a la que pertenece esta versión. |
| `version` | integer | no |  |  | Número de versión que tenía la partida antes de la edición (la actual está en partidas.version). |
| `datos` | jsonb | no |  |  | Cabecera de la partida como estaba en esa versión. |
| `lineas` | jsonb | no |  |  | Líneas de la partida en esa versión: cuenta_id, codigo, nombre, concepto, debe, haber y orden. |
| `reemplazada_por` | uuid | sí |  |  | Usuario que editó la partida y dejó esta versión como anterior. |
| `reemplazada_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora en que se editó la partida. |

## partidas

Encabezado de las partidas del libro diario.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el registro. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal que origina la partida. |
| `periodo_id` | uuid | sí | FK → periodos |  | Período al que pertenece, asignado por un trigger según la fecha. |
| `fecha` | date | no |  |  | Fecha contable de la partida. |
| `tipo` | tipo_partida | no |  | `operacion` | Apertura, operación, ajuste, cierre, reapertura o reversión. |
| `estado` | estado_partida | no |  | `borrador` | Borrador (no afecta libros), contabilizada o anulada (compensada por su reversión). |
| `numero` | integer | sí |  |  | Correlativo asignado al contabilizar, sin saltos dentro de su ámbito. |
| `ambito_numeracion` | varchar(40) | sí |  |  | Ámbito del correlativo: año, año-mes o año-tipo según la empresa. |
| `concepto` | text | sí |  |  | Descripción de la operación. |
| `documento_tipo` | varchar(30) | sí |  |  | Tipo de documento de soporte (CCF, factura, cheque, recibo…). |
| `documento_numero` | varchar(60) | sí |  |  | Número del documento de soporte. |
| `origen` | varchar(30) | no |  | `manual` | Módulo que generó la partida: manual, compras, ventas, planilla, bancos, depreciación, cierre… |
| `origen_id` | uuid | sí |  |  | Registro del módulo de origen que generó la partida. |
| `partida_revertida_id` | uuid | sí | FK → partidas |  | Partida original que esta partida revierte (solo en reversiones). |
| `version` | integer | no |  | `1` | Versión de la partida; aumenta con cada edición después de contabilizada. |
| `creado_por` | uuid | sí |  |  | Usuario que registró la partida. |
| `contabilizado_por` | uuid | sí |  |  | Usuario que contabilizó la partida. |
| `contabilizado_en` | timestamptz | sí |  |  | Fecha y hora de la contabilización. |
| `anulado_por` | uuid | sí |  |  | Usuario que anuló la partida. |
| `anulado_en` | timestamptz | sí |  |  | Fecha y hora de la anulación. |
| `motivo_anulacion` | text | sí |  |  | Motivo de la anulación; obligatorio para anular. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación (la fija un trigger). |

## periodos

Meses de cada ejercicio; un período cerrado bloquea sus partidas.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el registro. |
| `ejercicio_id` | uuid | no | FK → ejercicios |  | Ejercicio al que pertenece el mes. |
| `mes` | smallint | no |  |  | Número del mes, de 1 a 12. |
| `fecha_inicio` | date | no |  |  | Primer día del mes. |
| `fecha_fin` | date | no |  |  | Último día del mes. |
| `estado` | estado_periodo | no |  | `abierto` | Abierto o cerrado; no se cierra si tiene borradores. |
| `cerrado_en` | timestamptz | sí |  |  | Fecha y hora del cierre; vacío si está abierto. |
| `motivo_reapertura` | text | sí |  |  | Motivo de la última reapertura del período; obligatorio para reabrir y registrado en la bitácora. |

## permisos

Acciones autorizables del sistema, expresadas como módulo y acción.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | no | PK | `nextval('permisos_id_seq')` | Identificador único del registro. |
| `modulo` | varchar(40) | no |  |  | Módulo al que pertenece la acción (por ejemplo, partidas). |
| `accion` | varchar(30) | no |  |  | Acción autorizada dentro del módulo (por ejemplo, contabilizar). |
| `descripcion` | varchar(200) | no |  |  | Explicación de lo que permite. |

## planillas_calculadas

Fotografía por empleado del cálculo mensual usada para generar las planillas de ISSS y AFP.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del detalle calculado. |
| `empresa_id` | uuid | no | FK → empresas, FK → empleados, FK → empleados, UQ |  | Empresa a la que pertenece el cálculo. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal para la que se calculó la planilla. |
| `periodo` | date | no | UQ |  | Primer día del mes al que corresponden las cifras. |
| `partida_id` | uuid | no | FK → partidas |  | Partida en borrador creada por el cálculo de planilla. |
| `empleado_id` | uuid | no | FK → empleados, FK → empleados, UQ |  | Empleado al que corresponden las cifras. |
| `nombres` | varchar(100) | no |  |  | Nombres del empleado guardados al calcular la planilla. |
| `apellidos` | varchar(100) | no |  |  | Apellidos del empleado guardados al calcular la planilla. |
| `dui` | varchar(20) | no |  |  | DUI guardado al calcular la planilla. |
| `numero_isss` | varchar(20) | no |  |  | Número ISSS guardado al calcular la planilla. |
| `nup` | varchar(20) | no |  |  | NUP de AFP guardado al calcular la planilla. |
| `salario_cotizable` | numeric(14,2) | no |  |  | Salario bruto ajustado que sirvió de base para las cotizaciones. |
| `isss_laboral` | numeric(14,2) | no |  |  | Cotización laboral ISSS calculada para el empleado. |
| `isss_patronal` | numeric(14,2) | no |  |  | Cotización patronal ISSS calculada para el empleado. |
| `afp_laboral` | numeric(14,2) | no |  |  | Cotización laboral AFP calculada para el empleado. |
| `afp_patronal` | numeric(14,2) | no |  |  | Cotización patronal AFP calculada para el empleado. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación del detalle. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última actualización del cálculo. |

## planillas_presentaciones

Registro inmutable de quién presentó la planilla ISSS o AFP y cuándo.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del registro de presentación. |
| `empresa_id` | uuid | no | FK → empresas, UQ |  | Empresa que presentó la planilla. |
| `periodo` | date | no | UQ |  | Primer día del mes presentado. |
| `tipo` | tipo_planilla_oficial | no | UQ |  | Institución a la que se presentó la planilla. |
| `presentada_por` | uuid | no | FK → usuarios |  | Usuario que registró la presentación. |
| `presentada_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de registro de la presentación. |

## plantilla_recurrente_lineas

Líneas de debe y haber de una plantilla recurrente.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la línea. |
| `empresa_id` | uuid | no | FK → plantillas_recurrentes, FK → plantillas_recurrentes |  | Empresa dueña de la línea. |
| `plantilla_id` | uuid | no | FK → plantillas_recurrentes, FK → plantillas_recurrentes |  | Plantilla a la que pertenece. |
| `cuenta_id` | uuid | no | FK → cuentas |  | Cuenta imputable de la línea. |
| `debe` | numeric(14,2) | no |  | `0` | Importe al debe, en dólares. |
| `haber` | numeric(14,2) | no |  | `0` | Importe al haber, en dólares. |
| `orden` | smallint | no |  |  | Posición de la línea dentro de la partida. |

## plantillas_recurrentes

Plantillas de partidas que se repiten cada mes; generan borradores, nunca partidas contabilizadas.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la plantilla. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa dueña de la plantilla. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal en la que se generan las partidas. |
| `nombre` | varchar(120) | no |  |  | Nombre único por empresa, por ejemplo «Alquiler del local». |
| `concepto` | varchar(300) | sí |  |  | Concepto que llevará cada partida generada. |
| `tipo` | tipo_partida | no |  | `operacion` | Tipo de las partidas generadas. |
| `activa` | boolean | no |  | `true` | Una plantilla inactiva no genera partidas. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación. |

## productos

Productos que la empresa compra y vende; su movimiento se lleva en el kardex.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del producto. |
| `empresa_id` | uuid | no | FK → empresas, FK → categorias_producto, FK → categorias_producto |  | Empresa dueña del producto. |
| `categoria_id` | uuid | sí | FK → categorias_producto, FK → categorias_producto |  | Categoría del producto, de la misma empresa; opcional. |
| `codigo` | varchar(30) | no |  |  | Código del producto: letras, dígitos y . _ -, único por empresa. |
| `nombre` | varchar(150) | no |  |  | Nombre o descripción del producto. |
| `unidad_medida` | varchar(20) | no |  | `unidad` | Unidad de medida (unidad, caja, libra...). |
| `precio_venta` | numeric(14,2) | no |  | `0` | Precio de venta sin IVA en dólares. |
| `activo` | boolean | no |  | `true` | Un producto inactivo no se ofrece en compras ni ventas, pero conserva su historial. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación. |
| `metodo_valuacion` | metodo_valuacion | sí |  |  | Método de valuación propio del producto; si es nulo se usa el de la empresa. No se cambia cuando ya hay movimientos. |
| `existencia_minima` | numeric(14,4) | no |  | `0` | Cantidad mínima en existencia antes de reabastecer; 0 si no se controla. |
| `controla_series` | boolean | no |  | `false` | Indica si cada unidad del producto se identifica por serie o IMEI. |

## respaldos

Archivos JSON inmutables de respaldo de una empresa o sucursal.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del respaldo. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa propietaria del archivo. |
| `sucursal_id` | uuid | sí | FK → sucursales |  | Sucursal incluida cuando el respaldo es parcial. |
| `tipo` | tipo_respaldo | no |  |  | Indica si contiene la empresa completa o una sucursal. |
| `nombre_archivo` | varchar(200) | no |  |  | Nombre del archivo JSON descargable. |
| `contenido` | jsonb | no |  |  | Datos del respaldo en formato JSON versionado. |
| `sha256` | character | no |  |  | Huella SHA-256 del contenido JSON canónico. |
| `creado_por` | uuid | no | FK → usuarios |  | Usuario que generó el archivo. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de generación. |

## rol_permisos

Matriz de permisos: acciones que tiene cada rol.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `rol_id` | smallint | no | PK, FK → roles |  | Rol que recibe el permiso. |
| `permiso_id` | smallint | no | PK, FK → permisos |  | Permiso otorgado. |

## roles

Roles del sistema: administrador, contador, auxiliar contable y solo consulta.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | no | PK |  | Identificador único del registro. |
| `codigo` | varchar(30) | no |  |  | Código interno del rol, usado por la API. |
| `nombre` | varchar(60) | no |  |  | Nombre del rol que ve el usuario. |

## series_inventario

Unidades seriadas de inventario. La entrada y salida apuntan a movimientos, sin depender del documento de origen.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la unidad seriada. |
| `empresa_id` | uuid | no | FK → empresas, UQ |  | Empresa propietaria de la serie. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal donde ingresó la unidad. |
| `producto_id` | uuid | no | FK → productos |  | Producto al que pertenece la serie. |
| `numero_serie` | varchar(100) | no | UQ |  | Número de serie o IMEI, normalizado a mayúsculas. |
| `costo_unitario` | numeric(14,2) | no |  |  | Valor contable de esta unidad, asignado al centavo dentro de su movimiento de entrada. |
| `movimiento_entrada_id` | uuid | no | FK → movimientos_inventario |  | Movimiento de inventario que incorporó la unidad y fija su costo. |
| `movimiento_salida_id` | uuid | sí | FK → movimientos_inventario |  | Movimiento de salida que consumió la unidad; nulo mientras está en existencia. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora en que se registró la serie. |

## sucursales

Establecimientos de la empresa; cada partida y documento indica su sucursal.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador único del registro. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa a la que pertenece el registro. |
| `nombre` | varchar(150) | no |  |  | Nombre de la sucursal. |
| `codigo_establecimiento` | varchar(4) | no |  |  | Código de establecimiento asignado por Hacienda; forma parte del número de control del DTE. |
| `codigo_punto_venta` | varchar(4) | no |  | `0001` | Código del punto de venta; forma parte del número de control del DTE. |
| `direccion` | varchar(300) | sí |  |  | Dirección de la sucursal. |
| `es_matriz` | boolean | no |  | `false` | Indica si es la casa matriz de la empresa. |
| `activa` | boolean | no |  | `true` | Indica si el registro está activo; los inactivos se conservan pero no se usan en registros nuevos. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación (la fija un trigger). |

## tomas_fisicas

Conteo físico de productos en una sucursal. Al aprobar crea movimientos de ajuste y una partida contable en borrador.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador de la toma física. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa propietaria de la toma. |
| `sucursal_id` | uuid | no | FK → sucursales |  | Sucursal que se cuenta. |
| `fecha` | date | no |  |  | Fecha del conteo y de los movimientos de ajuste. |
| `estado` | estado_toma_fisica | no |  | `en_conteo` | En conteo o aprobada; una toma aprobada es inmutable. |
| `partida_id` | uuid | sí | FK → partidas |  | Partida de ajuste generada al aprobar, que permanece en borrador. |
| `creado_por` | uuid | no | FK → usuarios |  | Usuario auxiliar que inició el conteo. |
| `aprobado_por` | uuid | sí | FK → usuarios |  | Usuario contador que aprobó el ajuste. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de inicio del conteo. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación del conteo. |
| `aprobado_en` | timestamptz | sí |  |  | Fecha y hora de aprobación del ajuste. |

## tomas_fisicas_detalles

Existencia de sistema, conteo físico y valor final por producto.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del detalle. |
| `empresa_id` | uuid | no | FK → empresas |  | Empresa propietaria del producto y de la toma. |
| `toma_fisica_id` | uuid | no | FK → tomas_fisicas, UQ |  | Toma física a la que pertenece el detalle. |
| `producto_id` | uuid | no | FK → productos, UQ |  | Producto contado. |
| `existencia_sistema` | numeric(14,4) | no |  |  | Cantidad del producto en el kardex al iniciar la toma. |
| `secuencia_sistema` | bigint | no |  |  | Última secuencia de movimiento incluida en la existencia inicial. |
| `cantidad_contada` | numeric(14,4) | sí |  |  | Cantidad física informada por el auxiliar; nula mientras no se haya contado. |
| `series_contadas` | ARRAY | no |  | `ARRAY[][]` | Series o IMEI vistos durante el conteo para productos controlados por serie. |
| `cantidad_faltante` | numeric(14,4) | sí |  |  | Unidades faltantes detectadas en el conteo. |
| `cantidad_sobrante` | numeric(14,4) | sí |  |  | Unidades sobrantes detectadas en el conteo. |
| `valor_faltante` | numeric(14,2) | sí |  |  | Costo de las unidades faltantes contabilizado al aprobar. |
| `valor_sobrante` | numeric(14,2) | sí |  |  | Costo de las unidades sobrantes contabilizado al aprobar. |
| `valor_final` | numeric(14,2) | sí |  |  | Valor contable del inventario del producto después del ajuste aprobado. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación del detalle. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora del último cambio del conteo. |

## tramos_isr

Tramos progresivos anuales configurados para el ISR de personas naturales.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del tramo. |
| `empresa_id` | uuid | no | FK → empresas, FK → configuraciones_isr, FK → configuraciones_isr |  | Empresa propietaria de la configuración. |
| `configuracion_id` | uuid | no | FK → configuraciones_isr, FK → configuraciones_isr |  | Versión de configuración anual a la que pertenece el tramo. |
| `orden` | smallint | no |  |  | Posición del tramo en la secuencia progresiva. |
| `desde` | numeric(14,2) | no |  |  | Límite inferior del tramo; el primer tramo empieza en cero. |
| `hasta` | numeric(14,2) | sí |  |  | Límite superior inclusivo; nulo identifica el último tramo. |
| `porcentaje` | numeric(5,2) | no |  |  | Porcentaje marginal aplicado al exceso sobre el límite inferior. |
| `cuota_fija` | numeric(14,2) | no |  |  | Cuota fija que se suma al porcentaje marginal. |

## tramos_retencion_planilla

Tramos marginales de retención mensual de renta de una versión de tasas.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del tramo. |
| `empresa_id` | uuid | no | FK → empresas, FK → configuraciones_planilla, FK → configuraciones_planilla |  | Empresa a la que pertenece la tabla de retención. |
| `configuracion_id` | uuid | no | FK → configuraciones_planilla, FK → configuraciones_planilla |  | Versión de tasas a la que pertenece este tramo. |
| `orden` | smallint | no |  |  | Posición del tramo en la secuencia progresiva. |
| `desde` | numeric(14,2) | no |  |  | Límite inferior, excluido para los tramos posteriores al primero. |
| `hasta` | numeric(14,2) | sí |  |  | Límite superior inclusivo; nulo identifica el último tramo. |
| `porcentaje` | numeric(5,2) | no |  |  | Porcentaje marginal aplicado al exceso sobre el límite inferior. |
| `cuota_fija` | numeric(14,2) | no |  |  | Cuota fija que se suma al porcentaje marginal. |

## usuarios

Perfil de las personas usuarias; el id coincide con el de Supabase Auth.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | Identificador único del registro. |
| `nombre` | varchar(150) | no |  |  | Nombre completo. |
| `correo` | varchar(150) | no |  |  | Correo con el que inicia sesión; único. |
| `idioma` | varchar(5) | no |  | `es` | Idioma de la interfaz: es o en. |
| `activo` | boolean | no |  | `true` | Indica si el registro está activo; los inactivos se conservan pero no se usan en registros nuevos. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de creación. |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de la última modificación (la fija un trigger). |

## vales_caja_chica

Vales de gastos menores; solo pueden pasar una vez de por reintegrar a reintegrado.

| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` | Identificador del vale. |
| `empresa_id` | uuid | no | FK → empresas, FK → cajas_chicas, FK → cajas_chicas |  | Empresa dueña del vale. |
| `caja_chica_id` | uuid | no | FK → cajas_chicas, FK → cajas_chicas |  | Fondo fijo que pagó el vale. |
| `fecha` | date | no |  |  | Fecha del gasto respaldado por el comprobante. |
| `comprobante` | varchar(60) | no |  |  | Número o referencia del comprobante del gasto. |
| `concepto` | varchar(200) | no |  |  | Descripción breve del gasto. |
| `monto_neto` | numeric(14,2) | no |  |  | Importe del gasto antes del IVA, en dólares. |
| `iva` | numeric(14,2) | no |  | `0` | IVA acreditable indicado por el comprobante, en dólares. |
| `cuenta_gasto_id` | uuid | no | FK → cuentas |  | Cuenta de gasto imputable que se debitará al reintegrar. |
| `estado` | estado_vale_caja_chica | no |  | `por_reintegrar` | Por reintegrar o reintegrado mediante una partida en borrador. |
| `partida_reintegro_id` | uuid | sí | FK → partidas |  | Partida en borrador que respalda el reintegro; nula mientras el vale está pendiente. |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` | Fecha y hora de registro del vale. |

