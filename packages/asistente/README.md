# @contable/asistente (módulo reservado)

> **Uso interno del equipo.** Este módulo es la sorpresa para la defensa final: no se menciona en los
> documentos entregables, el backlog ni el tablero. Se desarrolla **después** de terminar lo principal.

## Qué hará

| Función                          | Entrada                         | Salida                                             |
| -------------------------------- | ------------------------------- | -------------------------------------------------- |
| Extracción de facturas           | Foto o PDF de un CCF o factura  | Datos sugeridos de la compra (NRC, montos, IVA)    |
| Análisis de estados financieros  | Estados y razones de un período | Explicación en texto de la situación y los cambios |
| Sugerencia de cuentas (opcional) | Concepto de una partida         | Cuentas probables del catálogo                     |

## Reglas que no se negocian

1. **La IA solo sugiere.** Nada se contabiliza sin que un usuario lo confirme; las partidas creadas desde
   aquí entran como **borrador** con `origen = 'asistente'`.
2. **La llamada al proveedor va solo en la API** (NestJS); la clave nunca llega al navegador.
3. **Apagado por defecto.** Sin `ASISTENTE_HABILITADO=true` el módulo responde "no disponible" y la
   interfaz no muestra nada.
4. Los montos que devuelva el modelo se validan con `Dinero` y `validarPartida` de `@contable/shared`,
   igual que cualquier captura manual.

## Cómo está preparado

- `src/index.ts` define el contrato (`ProveedorAsistente`) y un proveedor nulo. Para activarlo basta con
  implementar el contrato con el SDK del proveedor elegido y registrarlo en la API.
- La base ya lo soporta: `partidas.origen` admite `'asistente'` y la bitácora registra quién confirmó.
- Al implementarlo: agregar el permiso `asistente.usar` (migración nueva), un módulo `asistente` en
  `apps/api` y `apps/web`, y estas variables (solo en `.env`, no en `.env.example`):
  `ASISTENTE_HABILITADO`, `ASISTENTE_PROVEEDOR`, `ASISTENTE_API_KEY`, `ASISTENTE_MODELO`.
