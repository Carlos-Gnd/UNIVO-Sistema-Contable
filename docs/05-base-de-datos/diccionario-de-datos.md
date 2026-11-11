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

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | bigint | no | PK | `nextval('bitacora_id_seq')` |
| `empresa_id` | uuid | sí |  |  |
| `usuario_id` | uuid | sí |  |  |
| `tabla` | varchar(60) | no |  |  |
| `registro_id` | varchar(60) | sí |  |  |
| `accion` | varchar(30) | no |  |  |
| `datos_anteriores` | jsonb | sí |  |  |
| `datos_nuevos` | jsonb | sí |  |  |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

## correlativos

Último número de partida usado por ámbito de numeración.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `empresa_id` | uuid | no | PK, FK → empresas |  |
| `ambito` | varchar(40) | no | PK |  |
| `ultimo` | integer | no |  | `0` |

## cuentas

Catálogo de cuentas por empresa, con nivel y cuenta padre calculados del código.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `empresa_id` | uuid | no | FK → empresas |  |
| `codigo` | varchar(10) | no |  |  |
| `nombre` | varchar(200) | no |  |  |
| `nivel` | smallint | no |  | `0` |
| `naturaleza` | naturaleza | no |  |  |
| `tipo` | tipo_cuenta | no |  |  |
| `cuenta_padre_id` | uuid | sí | FK → cuentas |  |
| `activa` | boolean | no |  | `true` |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

## ejercicios

Años contables de cada empresa.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `empresa_id` | uuid | no | FK → empresas |  |
| `anio` | smallint | no |  |  |
| `fecha_inicio` | date | no |  |  |
| `fecha_fin` | date | no |  |  |
| `estado` | estado_periodo | no |  | `abierto` |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

## empresas

Contribuyentes que llevan su contabilidad en el sistema (persona natural o sociedad).

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `nombre` | varchar(200) | no |  |  |
| `nombre_comercial` | varchar(200) | sí |  |  |
| `nit` | varchar(17) | no |  |  |
| `nrc` | varchar(10) | sí |  |  |
| `tipo_contribuyente` | tipo_contribuyente | no |  |  |
| `clasificacion` | clasificacion_contribuyente | no |  | `otro` |
| `actividad_economica` | varchar(200) | sí |  |  |
| `direccion` | varchar(300) | sí |  |  |
| `telefono` | varchar(20) | sí |  |  |
| `correo` | varchar(150) | sí |  |  |
| `logo_url` | text | sí |  |  |
| `modo_numeracion` | modo_numeracion | no |  | `anual` |
| `activa` | boolean | no |  | `true` |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

## membresia_sucursales

Sucursales a las que está limitado un usuario dentro de una empresa.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `membresia_id` | uuid | no | PK, FK → membresias |  |
| `sucursal_id` | uuid | no | PK, FK → sucursales |  |

## membresias

Acceso de un usuario a una empresa con un rol.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `usuario_id` | uuid | no | FK → usuarios |  |
| `empresa_id` | uuid | no | FK → empresas |  |
| `rol_id` | smallint | no | FK → roles |  |
| `todas_sucursales` | boolean | no |  | `false` |
| `activa` | boolean | no |  | `true` |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

## partida_detalles

Líneas de cada partida: cuenta y monto en el debe o en el haber.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `partida_id` | uuid | no | FK → partidas |  |
| `empresa_id` | uuid | no | FK → empresas |  |
| `cuenta_id` | uuid | no | FK → cuentas |  |
| `concepto` | text | sí |  |  |
| `debe` | numeric(14,2) | no |  | `0` |
| `haber` | numeric(14,2) | no |  | `0` |
| `orden` | smallint | no |  | `0` |

## partidas

Encabezado de las partidas del libro diario.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `empresa_id` | uuid | no | FK → empresas |  |
| `sucursal_id` | uuid | no | FK → sucursales |  |
| `periodo_id` | uuid | sí | FK → periodos |  |
| `fecha` | date | no |  |  |
| `tipo` | tipo_partida | no |  | `operacion` |
| `estado` | estado_partida | no |  | `borrador` |
| `numero` | integer | sí |  |  |
| `ambito_numeracion` | varchar(40) | sí |  |  |
| `concepto` | text | sí |  |  |
| `documento_tipo` | varchar(30) | sí |  |  |
| `documento_numero` | varchar(60) | sí |  |  |
| `origen` | varchar(30) | no |  | `manual` |
| `origen_id` | uuid | sí |  |  |
| `partida_revertida_id` | uuid | sí | FK → partidas |  |
| `version` | integer | no |  | `1` |
| `creado_por` | uuid | sí |  |  |
| `contabilizado_por` | uuid | sí |  |  |
| `contabilizado_en` | timestamptz | sí |  |  |
| `anulado_por` | uuid | sí |  |  |
| `anulado_en` | timestamptz | sí |  |  |
| `motivo_anulacion` | text | sí |  |  |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

## periodos

Meses de cada ejercicio; un período cerrado bloquea sus partidas.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `empresa_id` | uuid | no | FK → empresas |  |
| `ejercicio_id` | uuid | no | FK → ejercicios |  |
| `mes` | smallint | no |  |  |
| `fecha_inicio` | date | no |  |  |
| `fecha_fin` | date | no |  |  |
| `estado` | estado_periodo | no |  | `abierto` |
| `cerrado_en` | timestamptz | sí |  |  |

## permisos

Acciones autorizables, expresadas como módulo y acción.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | smallint | no | PK | `nextval('permisos_id_seq')` |
| `modulo` | varchar(40) | no |  |  |
| `accion` | varchar(30) | no |  |  |
| `descripcion` | varchar(200) | no |  |  |

## rol_permisos

Matriz de permisos: qué acciones tiene cada rol.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `rol_id` | smallint | no | PK, FK → roles |  |
| `permiso_id` | smallint | no | PK, FK → permisos |  |

## roles

Roles del sistema: administrador, contador, auxiliar contable y solo consulta.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | smallint | no | PK |  |
| `codigo` | varchar(30) | no |  |  |
| `nombre` | varchar(60) | no |  |  |

## sucursales

Establecimientos de la empresa; cada registro contable indica su sucursal.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `empresa_id` | uuid | no | FK → empresas |  |
| `nombre` | varchar(150) | no |  |  |
| `codigo_establecimiento` | varchar(4) | no |  |  |
| `codigo_punto_venta` | varchar(4) | no |  | `0001` |
| `direccion` | varchar(300) | sí |  |  |
| `es_matriz` | boolean | no |  | `false` |
| `activa` | boolean | no |  | `true` |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

## usuarios

Perfil de las personas usuarias; el id coincide con el de Supabase Auth.

| Columna | Tipo | Nulo | Claves | Por defecto |
|---|---|---|---|---|
| `id` | uuid | no | PK |  |
| `nombre` | varchar(150) | no |  |  |
| `correo` | varchar(150) | no |  |  |
| `idioma` | varchar(5) | no |  | `es` |
| `activo` | boolean | no |  | `true` |
| `creado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |
| `actualizado_en` | timestamptz | no |  | `CURRENT_TIMESTAMP` |

