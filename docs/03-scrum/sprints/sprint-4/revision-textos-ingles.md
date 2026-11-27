# Revisión de textos para la interfaz en inglés (HU-14, S4-T02)

Fecha de la revisión: 26 de noviembre de 2026. Alcance: `apps/web/src` (sin pruebas).

## Resumen

- **Ya traducido** (usa `react-i18next`, español e inglés): inicio de sesión y recuperación, menú y encabezado, textos comunes, bitácora, importación desde Excel, pendientes y usuarios.
- **Solo en español:** 52 archivos `textos*.ts` en 12 módulos, con unas **2,224 cadenas** (cifra aproximada: cuenta los pares clave y texto de esos archivos, sin las funciones con parámetros ni los textos escritos directo en los componentes).
- Con el selector de idioma de este PR, quien elige inglés ve el menú, el encabezado y las pantallas ya traducidas en inglés, y el resto de las pantallas sigue en español. El formato de fecha y de moneda no cambia (dd/mm/aaaa y US$), como pide la historia.

## Módulos pendientes de traducir

| Módulo | Archivos de textos | Cadenas (aprox.) |
|---|---:|---:|
| `modules/comercial` | 6 | 407 |
| `modules/reportes` | 12 | 315 |
| `modules/tributario` | 7 | 236 |
| `modules/inventario` | 4 | 231 |
| `modules/planilla` | 5 | 217 |
| `modules/tesoreria` | 2 | 194 |
| `modules/contabilidad` | 6 | 185 |
| `modules/organizacion` | 3 | 132 |
| `modules/activo-fijo` | 2 | 118 |
| `modules/cierre-anual` | 1 | 85 |
| `modules/catalogo` | 3 | 76 |
| `modules/respaldos` | 1 | 28 |

## Cómo cerrar la historia

Hoy cada pantalla importa un objeto de constantes (`T.titulo`) y no reacciona al cambio de idioma. Migrar los 52 archivos al formato de `react-i18next` obliga a tocar cada componente. Propuesta de menor costo, en este orden:

1. **Mecanismo común (media jornada).** Una función `traducible({ es, en })` que devuelve el mismo objeto de constantes pero resuelve cada texto con el idioma activo en el momento de leerlo, y reiniciar el árbol de pantallas con una `key` según el idioma para que todo se vuelva a dibujar al cambiar. Así los componentes no cambian.
2. **Traducir por módulo, en el orden de la tabla** (de mayor a menor visibilidad para la defensa): reportes y estados financieros, comercial, inventario, planilla, tributario, tesorería, contabilidad, activos fijos, cierre anual, catálogo y respaldos. Cada módulo es un PR pequeño con su prueba de que ninguna clave queda sin traducción.
3. **Prueba automática** que recorre todos los archivos `textos*.ts` y falla si falta la versión en inglés de alguna clave. Es la base de S4-T03.
4. **Revisión de los textos escritos directo en los componentes** (títulos de tabla, mensajes de error y textos de ayuda), que esta cuenta no incluye.

Estimación: 2 a 3 días de trabajo entre dos personas, sin contar la revisión de la redacción en inglés por quien domine el vocabulario contable.

## Decisión pendiente

La historia pide «todas las pantallas y reportes traducidos». Con la capacidad del sprint 4 hay que decidir si se entrega el selector y las pantallas ya traducidas (lo hecho en este PR) o se asigna el trabajo de traducción de los módulos de la tabla.
