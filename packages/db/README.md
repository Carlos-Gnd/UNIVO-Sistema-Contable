# @contable/db

Esquema, migraciones y cliente de Prisma 7 del sistema contable (PostgreSQL 17 en Supabase).

## Uso desde la API

Al crear una empresa, copiar el catálogo base en la misma transacción (tarea S1-T67):

```ts
await tx.$executeRaw`SELECT interno.copiar_catalogo_base(${empresaId}::uuid)`;
```

```ts
import { crearPrisma, comoUsuario } from "@contable/db";

const prisma = crearPrisma(); // usa DATABASE_URL

// Toda escritura va dentro de comoUsuario: la bitácora y las partidas registran quién hizo el cambio.
await comoUsuario(prisma, usuarioId, (tx) =>
  tx.partida.update({ where: { id }, data: { estado: "contabilizada" } }),
);
```

## Reglas que aplica la base de datos

La API valida primero (con `validarPartida` de `@contable/shared`), pero la base es la última barrera:

| Regla                                                                                                                                                             | Dónde                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| El nivel y la cuenta padre se calculan del código (1, 2, 4, 6, 8 o 10 dígitos)                                                                                    | `cuentas_antes_guardar`                    |
| No se crean subcuentas de una cuenta con movimientos ni se cambia su código                                                                                       | `cuentas_antes_guardar`                    |
| Al crear un ejercicio se generan sus 12 períodos                                                                                                                  | `ejercicios_crear_periodos`                |
| El catálogo de la clase (tabla `catalogo_base`) se copia a una empresa nueva según su tipo de contribuyente: 165 cuentas para sociedad y 160 para persona natural | `copiar_catalogo_base`                     |
| El período de la partida se asigna según su fecha; no se registra en períodos cerrados ni en fechas sin ejercicio                                                 | `partidas_antes_guardar`                   |
| Solo se contabiliza si debe = haber, con al menos 2 líneas (verificado al confirmar la transacción)                                                               | `verificar_cuadre` (diferido)              |
| El número correlativo se asigna al contabilizar, sin saltos ni duplicados, según el modo de la empresa (anual, mensual o por tipo)                                | `siguiente_correlativo`                    |
| Una línea tiene debe o haber, nunca ambos; solo en cuentas activas, de último nivel y de la misma empresa                                                         | `CHECK` + `detalles_antes_guardar`         |
| Solo se eliminan borradores; una contabilizada se anula con reversión; una anulada no cambia                                                                      | `partidas_antes_guardar`                   |
| Un período no se cierra si tiene borradores                                                                                                                       | `periodos_cambiar_estado`                  |
| Bitácora de todo cambio con valores anteriores y nuevos; no admite UPDATE, DELETE ni TRUNCATE                                                                     | `registrar_bitacora`, `bitacora_inmutable` |
| Las tablas no son visibles para la API pública de Supabase (RLS sin políticas y sin permisos para `anon`/`authenticated`)                                         | migración `reglas_contables`               |

**Para reportes:** el libro mayor, las balanzas y los estados toman las partidas con estado `contabilizada` **y**
`anulada` (la anulación se compensa con su partida de reversión). Los borradores nunca se incluyen.

**Prisma y `empresaId` en el detalle:** al crear líneas anidadas, Prisma exige `empresaId`; pasa el de la partida
(el trigger lo vuelve a fijar de todas formas).

## Migraciones

- Cambios de tablas: editar `prisma/schema.prisma` y generar el SQL con
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
- Triggers, funciones y datos de referencia: escribir el SQL a mano en una carpeta nueva de `prisma/migrations`.
- **Toda tabla y columna nueva lleva `COMMENT ON`** en su migración: el diccionario de datos se genera de esos
  comentarios y la prueba `test/comentarios.test.ts` falla si falta alguno.
- Aplicar en Supabase: `pnpm db:migrate` (usa `DIRECT_URL` del `.env` de la raíz). Solo el DBA aplica migraciones.
- Después de aplicar: `supabase db advisors --db-url "$DIRECT_URL"` no debe mostrar advertencias (WARN).

## Pruebas

Corren contra un PostgreSQL 17 real (en CI, un servicio de GitHub Actions):

```bash
podman run -d --name contable-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=contable -p 54329:5432 postgres:17
pnpm db:test
```

- `test/reglas.test.ts` y `test/triggers.test.ts`: reglas de los triggers (cuadre, períodos, numeración, anulación,
  cuentas inactivas o con movimientos, bitácora).
- `test/semilla.test.ts`: la semilla carga datos coherentes y es idempotente.

Las pruebas borran y recrean el esquema de la base a la que se conectan: usar solo el contenedor local.

## Semilla de datos de prueba

Carga en la base local una empresa de demostración para trabajar con la web y la API:

- **Comercial Oriente, S.A. de C.V.** (sociedad), con casa matriz en San Miguel y sucursal en Usulután.
- Catálogo base de sociedad (165 cuentas) y ejercicio 2026 con sus 12 períodos.
- Un usuario por rol: `admin@`, `contador@`, `auxiliar@` y `consulta@ejemplo.com` (el auxiliar solo ve la matriz).
- 10 partidas del primer trimestre: 7 contabilizadas, 1 anulada con su reversión y 2 borradores (uno descuadrado).

```bash
pnpm --filter @contable/db seed
```

Se conecta a `SEED_DATABASE_URL`, o a `TEST_DATABASE_URL`, o al contenedor local del puerto 54329; **nunca usa
`DATABASE_URL`**, para no cargar datos de prueba en Supabase por accidente. Contra una base remota de pruebas hay que
definir además `SEED_PERMITIR_REMOTO=1`. Si la empresa ya existe, no hace nada.

Los usuarios tienen ids fijos (`a0000000-0000-4000-8000-00000000000N`); para iniciar sesión con ellos hay que crearlos
en Supabase Auth con el mismo id.
