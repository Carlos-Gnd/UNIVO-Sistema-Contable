# Caso CheroPhonex: cómo cargarlo y comprobar los resultados

CheroPhonex es el ejercicio contable de la clase: una empresa de comercialización de dispositivos móviles en San Miguel, de persona natural, con sus libros de octubre de 2026. El sistema puede cargarlo completo y la prueba automatizada comprueba, **al centavo**, que las balanzas, el estado de resultados y el balance general coinciden con los del ejercicio (historia [HU-90](../02-producto/historias-de-usuario.md)).

Esta guía sirve a quien evalúa el sistema (cargar el caso y ver los resultados) y al equipo (ejecutar la prueba y saber qué compara).

## Qué contiene el caso

| Elemento | Detalle |
|---|---|
| Empresa | CHERO PHONEX, NIT 0614-010190-101-5, persona natural, con su casa matriz y ejercicios 2024–2026 |
| Cuentas | Catálogo base más 29 subcuentas propias del caso |
| Caso académico | 44 partidas de octubre, todas contabilizadas: 1 de apertura, 33 de operaciones, 6 de ajuste y 4 de cierre |
| Historial demo | 94 movimientos: 92 operaciones balanceadas en 23 meses (noviembre de 2024 a septiembre de 2026) y cierres de resultados al final de 2024 y 2025 |
| Período académico | Octubre de 2026 (del 01/10/2026 al 31/10/2026) |

Los datos están en [`packages/db/src/casos/cherophonex.json`](../../packages/db/src/casos/cherophonex.json). Salen de «CheroPhonex, modelo del ejercicio del equipo», que calcula por su cuenta los resultados esperados y no depende del sistema: así la prueba compara dos cálculos independientes.

## Resultados esperados

| Concepto | Monto (US$) |
|---|---:|
| Ventas netas | 46,051.20 |
| Costo de ventas | 34,112.00 |
| Utilidad bruta | 11,939.20 |
| Gastos de administración | 1,864.17 |
| Gastos de venta | 2,465.04 |
| Gastos financieros | 15.00 |
| **Utilidad del ejercicio** | **7,594.99** |
| Total activo | 31,960.62 |
| Total pasivo | 2,315.63 |
| Total patrimonio | 29,644.99 |
| Capital | 22,500.00 |
| Utilidad del ejercicio en el balance (utilidad neta menos retiros del titular) | 7,144.99 |

Los gastos de operación del ejercicio (4,329.21) son la suma de los de administración y de venta; con los financieros se llega a la utilidad.

## Cargar el caso

Requisitos: Node 24 o superior, pnpm, Docker y las dependencias instaladas (`pnpm install`, `pnpm db:generate`).

1. Levanta la base local (PostgreSQL 17, puerto `54329`):

   ```bash
   docker compose up -d db
   ```

2. Si la base `contable` está vacía (sin tablas), aplica las migraciones **a esa base local**, nunca a Supabase:

   ```bash
   DIRECT_URL="postgresql://postgres:postgres@localhost:54329/contable" pnpm db:migrate
   ```

3. Carga el caso:

   ```bash
   pnpm --filter @contable/db caso:cherophonex
   ```

   El comando carga las 44 partidas académicas de octubre. El historial sintético de 23 meses se carga solo al
   reiniciar la base dedicada con `--reiniciar`.

El script elige la base así: `CASO_DATABASE_URL`, si no `TEST_DATABASE_URL`, si no el contenedor local. **Nunca usa `DATABASE_URL`**, para no cargar el caso por accidente en el proyecto de Supabase del equipo. Una base que no sea local se rechaza con un aviso, salvo que se defina también `CASO_PERMITIR_REMOTO=1`.

Es seguro repetirlo: si la empresa (por su NIT) ya existe, el script lo avisa y no hace nada.

### Reiniciar la empresa de demostración

El reinicio reconstruye **todo el esquema** de una base dedicada y vuelve a cargar el caso. No apunta a la base
`contable` habitual: exige una URL local cuyo nombre sea `contable_demo` y una confirmación explícita.

1. Crea la base dedicada una vez desde el contenedor local:

   ```bash
   docker exec contable-pg-pruebas createdb -U postgres contable_demo
   ```

2. Cuando necesites restablecerla al caso inicial:

   ```bash
   CASO_DATABASE_URL="postgresql://postgres:postgres@localhost:54329/contable_demo" CASO_CONFIRMAR_REINICIO=1 pnpm --filter @contable/db caso:cherophonex:reiniciar
   ```

El comando vuelve a aplicar las migraciones y carga el historial determinista de 23 meses y las 44 partidas académicas. Todos los
demás comandos de carga conservan el comportamiento seguro de no hacer nada si CheroPhonex ya existe.

> Las pruebas de base de datos (`pnpm db:test`) borran y recrean esquemas. Si las ejecutas contra la misma base `contable`, tendrás que volver a aplicar las migraciones y a cargar el caso.

## Verlo en la aplicación

Con el caso cargado y la API y la web en marcha, entra con un usuario que tenga acceso a CheroPhonex y consulta octubre de 2026 (del 01/10/2026 al 31/10/2026) en:

1. **Balanzas**: antes de ajustes, ajustada y posterior al cierre; por sucursal o consolidada.
2. **Hoja de trabajo** (pantalla de la tarea S2-T34): las 10 columnas, con la utilidad de 7,594.99 cuadrando entre el estado de resultados y el balance. Mientras esa pantalla no esté publicada, la API la entrega en `GET /empresas/:empresaId/hoja-trabajo?desde=2026-10-01&hasta=2026-10-31`.
3. **Estado de resultados** y **balance general**: comparar con la tabla de resultados esperados.

## Ejecutar la prueba automatizada

```bash
docker compose up -d db
pnpm --filter @contable/api exec vitest run test/caso-cherophonex.test.ts
```

La prueba, [`apps/api/test/caso-cherophonex.test.ts`](../../apps/api/test/caso-cherophonex.test.ts), crea su propia base aislada, carga las 44 partidas, consulta la API real y compara contra los valores esperados del JSON:

- las tres balanzas de comprobación (antes de ajustes, ajustada y posterior al cierre), cuenta por cuenta;
- el estado de resultados (ventas, costo, utilidad bruta, gastos y utilidad neta de 7,594.99);
- el balance general (activo igual a pasivo más patrimonio, capital y utilidad del ejercicio);
- que la casa matriz, única sucursal del caso, sume lo mismo que la balanza consolidada.

Cualquier diferencia de un centavo la hace fallar. Todos los montos se calculan con aritmética decimal exacta (`Dinero`), nunca con `number`.

## Cuándo corre

En cada pull request. El flujo de integración continua ([`ci.yml`](../../.github/workflows/ci.yml)) la ejecuta como un paso aparte, «Caso CheroPhonex (resultados al centavo)», antes del resto de las pruebas, para que un fallo se vea con ese nombre en la lista de pasos. Un pull request que rompa el caso no debe fusionarse.

## Si cambian los datos del ejercicio

El JSON y los resultados esperados se generan juntos desde el modelo del ejercicio y no se editan a mano. Si el docente corrige el ejercicio, hay que regenerar ambos y volver a ejecutar la prueba; si el sistema deja de coincidir, el error está en el sistema o en el modelo, y la prueba lo señala.

## Más información

- Reglas de la base de datos y del script: [`packages/db/README.md`](../../packages/db/README.md).
- Guion de la demostración del sprint 2: [sprint 2](../03-scrum/sprints/sprint-2/README.md#guion-de-demostración-sprint-review).
