#!/usr/bin/env bash
# Regenera los diagramas del repositorio.
# Requisitos: plantuml (sudo dnf install plantuml) y el PostgreSQL local con las migraciones aplicadas
# (pnpm db:test lo deja listo). Uso: bash docs/generar-diagramas.sh
set -euo pipefail
cd "$(dirname "$0")"
node ../packages/db/scripts/generar-diagrama-er.mjs 05-base-de-datos/diagramas/er-02-fisico.puml
node ../packages/db/scripts/generar-diccionario.mjs 05-base-de-datos
find . -name '*.puml' -print0 | xargs -0 plantuml -tsvg -nometadata
echo "Diagramas generados en SVG."
