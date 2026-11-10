# Marco de trabajo Scrum

## Equipo

| Integrante | Rol Scrum | Especialidad |
|---|---|---|
| Pacheco Araniva René Francisco | Product Owner | Frontend |
| Granados Amaya Carlos Alberto | Scrum Master | Base de datos y backend |
| Hernández Coreas Lenin Alejandro | Developer | Backend |
| Guardado Ortez Kevin Bladimir | Developer | Backend |
| Hernández Coreas Bremond Antony | Developer | Frontend |
| Rodríguez Quintanilla Nelson René | Developer | Frontend |

Todos participan también en pruebas (QA) y documentación.

## Sprints

| Sprint | Fechas | Documento |
|---|---|---|
| 1 | 10–16 nov | [sprints/sprint-1](sprints/sprint-1/) |
| 2 | 17–23 nov | Se planifica el 17 de noviembre |
| 3 | 24–30 nov (avance el 27) | Se planifica el 24 de noviembre |
| 4 | 1–4 dic (entrega el 4) | Se planifica el 1 de diciembre |

## Eventos

- **Sprint Planning** (Lunes 10 de noviembre, 1 h 30 min): Confirmar el objetivo, revisar las historias comprometidas, dividirlas en tareas y asignarlas.
- **Daily Scrum** (Lunes a sábado, 8:00 p. m., 15 min): Qué hice ayer, qué haré hoy y qué me bloquea. Por llamada o por mensaje en el grupo.
- **Sprint Review** (Domingo 16 de noviembre, 1 h): Demostración del incremento publicado; el PO acepta o rechaza cada historia y se actualiza el backlog.
- **Sprint Retrospective** (Domingo 16 de noviembre, 45 min): Qué funcionó, qué no y qué acciones concretas se aplican en el sprint 2.
- **Refinamiento del backlog** (Jueves 13 de noviembre, 45 min): Revisar y estimar las historias del sprint 2 para que cumplan la definición de listo.

## Definición de listo

- La historia sigue el formato «Como… quiero… para…».
- Tiene criterios de aceptación verificables.
- Está estimada en puntos por el equipo.
- Sus dependencias están terminadas o planificadas en el mismo sprint.

## Definición de terminado

- Cumple todos sus criterios de aceptación.
- El código está en main mediante pull request revisado por otro integrante.
- Lint y pruebas pasan en GitHub Actions.
- La funcionalidad está publicada y se probó en el ambiente en línea.
- Respeta la matriz de permisos.
- Los textos de la interfaz están en los archivos de idioma.
- El Product Owner aceptó la historia en la Sprint Review.

## Acuerdos de trabajo

- Una rama por historia: feat/HU-XX-descripcion; nadie hace push directo a main.
- Cada pull request lo revisa otro integrante antes de 24 horas.
- Las tareas se mueven en el tablero el mismo día: Todo → In Progress → Done.
- Un bloqueo de más de medio día se avisa en el grupo sin esperar al daily.
- Los commits siguen el formato feat(dominio): descripción (HU-XX).
- El código generado con asistentes se revisa y se prueba igual que el escrito a mano.

## Tablero

[GitHub Projects — Sistema Contable — Backlog](https://github.com/users/Carlos-Gnd/projects/9). Campos: Tipo (Historia/Tarea), Sprint, Prioridad, Puntos, Responsable, Área y Horas.
