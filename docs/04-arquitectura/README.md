# Arquitectura

- [Arquitectura del sistema (PDF)](Arquitectura_del_Sistema.pdf) · [Diagramas de flujo (PDF)](Diagramas_de_Flujo.pdf)
- Fuentes en PlantUML: [diagramas/](diagramas/) y [flujos/](flujos/). Para regenerarlos: `bash docs/generar-diagramas.sh`.

## Vista general

### Diagrama de contexto

El sistema se relaciona con cinco tipos de actores humanos y con tres sistemas externos: Supabase Auth para la identidad, el correo electrónico para invitaciones y recuperación de contraseña, y el simulador de Hacienda para los DTE.

![Diagrama de contexto](diagramas/arq-01-contexto.svg)

### Diagrama de despliegue

La interfaz es una aplicación estática servida por Vercel; la API corre en Render y se conecta a PostgreSQL de Supabase a través del pooler en modo transacción. Las migraciones usan la conexión directa y las aplica a mano el administrador de base de datos. GitHub Actions valida cada cambio (lint, tipos, pruebas y build); Vercel y Render despliegan la rama principal mediante su integración con GitHub.

![Diagrama de despliegue](diagramas/arq-02-despliegue.svg)

## Estructura

### Componentes por dominio

La API es un monolito modular: cada dominio agrupa su lógica y expone una interfaz pública. Todos los módulos que afectan la contabilidad generan sus partidas a través del servicio de contabilización, de modo que el libro diario tiene una sola puerta de entrada.

![Componentes por dominio](diagramas/arq-03-componentes.svg)

### Paquetes del monorepo

La interfaz y la API comparten tipos, validaciones y la clase Dinero mediante el paquete @contable/shared; el acceso a datos, el esquema, las migraciones y los triggers están en @contable/db.

![Paquetes del monorepo](diagramas/arq-04-paquetes.svg)

### Clases del dominio de contabilidad

Una empresa tiene sucursales, catálogo y ejercicios de doce períodos; cada partida pertenece a un período, tiene líneas en cuentas de último nivel y puede revertir a otra. Dinero es un objeto de valor con aritmética decimal exacta.

![Clases del dominio de contabilidad](diagramas/arq-05-clases-contabilidad.svg)

## Comportamiento

### Secuencia: inicio de sesión y empresa activa

La web obtiene el token de Supabase Auth; la API lo verifica y consulta las membresías y permisos del usuario. Desde ese momento cada petición lleva el token y la empresa activa.

![Secuencia: inicio de sesión y empresa activa](diagramas/sec-01-inicio-sesion.svg)

### Secuencia: registrar y contabilizar una partida

La validación ocurre en tres niveles: en la interfaz (totales en vivo), en la API y en la base de datos. Si la partida no cuadra al contabilizarla, la transacción se revierte y el correlativo no se consume.

![Secuencia: registrar y contabilizar una partida](diagramas/sec-02-contabilizar-partida.svg)

### Secuencia: venta al crédito

La venta, la salida de inventario, el libro de ventas y las dos partidas (venta y costo) se registran en una sola transacción; las partidas quedan en borrador para revisión del contador.

![Secuencia: venta al crédito](diagramas/sec-03-venta.svg)

### Secuencia: emisión de un DTE

El JSON se valida contra el esquema oficial antes de firmarse; el simulador devuelve el sello de recepción y el sistema entrega el PDF con el código QR.

![Secuencia: emisión de un DTE](diagramas/sec-04-emision-dte.svg)

### Secuencia: cierre del ejercicio y reapertura

El cierre calcula el impuesto sobre la renta y la reserva legal, liquida las cuentas de resultado y, tras la revisión del contador, crea el ejercicio siguiente con su partida de reapertura.

![Secuencia: cierre del ejercicio y reapertura](diagramas/sec-05-cierre-anual.svg)

### Estados de una partida

Un borrador puede editarse, eliminarse o contabilizarse; una partida contabilizada solo se edita en un período abierto (con versión) y se anula mediante una reversión.

![Estados de una partida](diagramas/est-01-partida.svg)

### Estados de un período

Un período abierto se cierra solo si no tiene borradores; la reapertura es excepcional, exclusiva del administrador y exige un motivo, que se guarda en el período y queda en la bitácora.

![Estados de un período](diagramas/est-02-periodo.svg)

### Estados de un DTE

Un DTE generado se firma y se sella; si no cumple el esquema se rechaza hasta corregirlo. Un DTE procesado puede invalidarse, lo que revierte su partida.

![Estados de un DTE](diagramas/est-03-dte.svg)

# Diagramas de flujo

## Procesos contables

### Ciclo contable completo

Muestra el recorrido desde la configuración de la empresa hasta la reapertura del ejercicio siguiente, con el ciclo mensual de registro, ajustes, declaraciones y cierre.

![Ciclo contable completo](flujos/flu-01-ciclo-contable.svg)

### Registro y contabilización de una partida

El auxiliar captura y guarda la partida; el sistema la valida y la deja en borrador. El contador la revisa y la contabiliza, y el sistema asigna el correlativo y la registra en la bitácora.

![Registro y contabilización de una partida](flujos/flu-02-registro-partida.svg)

### Cierre de período mensual

Un período no se cierra mientras tenga borradores. Al cerrarlo se bloquea el registro y, en diciembre, se habilita el cierre del ejercicio.

![Cierre de período mensual](flujos/flu-07-cierre-periodo.svg)

### Importación desde Excel

La carga es todo o nada: si una fila tiene errores no se importa ninguna. Los saldos iniciales generan la partida de apertura en borrador.

![Importación desde Excel](flujos/flu-09-importacion-excel.svg)

## Procesos operativos

### Registro de una compra

La compra calcula el crédito fiscal, aplica la percepción cuando corresponde, actualiza el kardex y el libro de compras, y genera su partida.

![Registro de una compra](flujos/flu-03-compra.svg)

### Registro de una venta

La venta verifica existencias, calcula el débito fiscal y la retención, valora la salida, genera las partidas de venta y de costo, y emite el DTE.

![Registro de una venta](flujos/flu-04-venta.svg)

### Liquidación mensual del IVA

Compara el débito con el crédito fiscal más el remanente, las retenciones y las percepciones; el resultado es IVA por pagar o un nuevo remanente.

![Liquidación mensual del IVA](flujos/flu-05-liquidacion-iva.svg)

### Cálculo de la planilla

Para cada empleado calcula ISSS, AFP y renta, el líquido a pagar y las cuotas patronales; luego provisiona prestaciones y genera la partida y las boletas.

![Cálculo de la planilla](flujos/flu-06-planilla.svg)

### Conciliación bancaria

Compara los movimientos registrados con el estado de cuenta, identifica partidas en tránsito y movimientos no registrados, y emite el reporte cuando los saldos ajustados coinciden.

![Conciliación bancaria](flujos/flu-08-conciliacion.svg)
