# Diccionario de datos

Generado desde PostgreSQL con `packages/db/scripts/generar-diccionario.mjs`.

## Tipos enumerados

| Tipo | Valores |
|---|---|
| `clasificacion_contribuyente` | grande, mediano, otro |
| `estado_partida` | borrador, contabilizada, anulada |
| `estado_periodo` | abierto, cerrado |
| `modo_numeracion` | mensual, anual, por_tipo |
| `naturaleza` | deudora, acreedora |
| `tipo_contribuyente` | persona_natural, sociedad |
| `tipo_cuenta` | activo, pasivo, patrimonio, costos_gastos, ingresos, liquidadora, orden |
| `tipo_partida` | apertura, operacion, ajuste, cierre, reapertura, reversion |

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

