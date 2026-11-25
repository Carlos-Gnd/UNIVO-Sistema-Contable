-- Renglones inmutables importados desde CSV y coincidencias con movimientos bancarios (HU-80, S3-T124).

CREATE TABLE "lineas_estado_cuenta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "conciliacion_id" UUID NOT NULL,
    "numero_fila" SMALLINT NOT NULL,
    "fecha" DATE NOT NULL,
    "referencia" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "huella" VARCHAR(64) NOT NULL,
    "partida_detalle_id" UUID,
    "importado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lineas_estado_cuenta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lineas_estado_cuenta_fila_positiva" CHECK ("numero_fila" >= 2),
    CONSTRAINT "lineas_estado_cuenta_monto_no_cero" CHECK ("monto" <> 0)
);
CREATE UNIQUE INDEX "lineas_estado_cuenta_conciliacion_fila_key" ON "lineas_estado_cuenta"("conciliacion_id", "numero_fila");
CREATE UNIQUE INDEX "lineas_estado_cuenta_conciliacion_huella_key" ON "lineas_estado_cuenta"("conciliacion_id", "huella");
CREATE UNIQUE INDEX "lineas_estado_cuenta_conciliacion_detalle_key" ON "lineas_estado_cuenta"("conciliacion_id", "partida_detalle_id");
CREATE INDEX "lineas_estado_cuenta_empresa_conciliacion_idx" ON "lineas_estado_cuenta"("empresa_id", "conciliacion_id");
ALTER TABLE "lineas_estado_cuenta" ADD CONSTRAINT "lineas_estado_cuenta_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lineas_estado_cuenta" ADD CONSTRAINT "lineas_estado_cuenta_conciliacion_id_fkey"
  FOREIGN KEY ("conciliacion_id") REFERENCES "conciliaciones_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lineas_estado_cuenta" ADD CONSTRAINT "lineas_estado_cuenta_partida_detalle_id_fkey"
  FOREIGN KEY ("partida_detalle_id") REFERENCES "partida_detalles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMENT ON TABLE "lineas_estado_cuenta" IS 'Filas CSV conservadas para conciliación y revisión manual.';
COMMENT ON COLUMN "lineas_estado_cuenta"."id" IS 'Identificador de la fila importada.';
COMMENT ON COLUMN "lineas_estado_cuenta"."empresa_id" IS 'Empresa dueña de la fila.';
COMMENT ON COLUMN "lineas_estado_cuenta"."conciliacion_id" IS 'Conciliación a la que pertenece el estado de cuenta.';
COMMENT ON COLUMN "lineas_estado_cuenta"."numero_fila" IS 'Número original de fila en el CSV, incluye encabezado.';
COMMENT ON COLUMN "lineas_estado_cuenta"."fecha" IS 'Fecha de la operación en el estado de cuenta.';
COMMENT ON COLUMN "lineas_estado_cuenta"."referencia" IS 'Referencia bancaria para conciliación automática.';
COMMENT ON COLUMN "lineas_estado_cuenta"."descripcion" IS 'Descripción de la operación del banco.';
COMMENT ON COLUMN "lineas_estado_cuenta"."monto" IS 'Monto firmado, positivo para depósitos y negativo para retiros.';
COMMENT ON COLUMN "lineas_estado_cuenta"."huella" IS 'Hash normalizado para detectar filas repetidas.';
COMMENT ON COLUMN "lineas_estado_cuenta"."partida_detalle_id" IS 'Línea de libro coincidente; nula si requiere revisión manual.';
COMMENT ON COLUMN "lineas_estado_cuenta"."importado_en" IS 'Fecha y hora de importación.';

CREATE FUNCTION interno.lineas_estado_cuenta_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  encabezado RECORD;
  partida RECORD;
  cuenta RECORD;
  movimiento RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Las filas importadas del estado de cuenta son inmutables.' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.empresa_id, c.fecha_corte, c.cuenta_tesoreria_id, ct.cuenta_id INTO encabezado
    FROM conciliaciones_bancarias c JOIN cuentas_tesoreria ct ON ct.id = c.cuenta_tesoreria_id
    WHERE c.id = NEW.conciliacion_id;
  IF encabezado.empresa_id IS DISTINCT FROM NEW.empresa_id OR NEW.fecha > encabezado.fecha_corte THEN
    RAISE EXCEPTION 'La fila debe pertenecer al corte y no ser posterior a su fecha.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.partida_detalle_id IS NULL THEN RETURN NEW; END IF;
  SELECT d.empresa_id, d.cuenta_id, d.debe, d.haber, p.fecha, p.estado::text AS estado INTO partida
    FROM partida_detalles d JOIN partidas p ON p.id = d.partida_id WHERE d.id = NEW.partida_detalle_id;
  SELECT ct.cuenta_id INTO cuenta FROM cuentas_tesoreria ct WHERE ct.id = encabezado.cuenta_tesoreria_id;
  SELECT m.referencia, m.fecha, m.tipo::text AS tipo INTO movimiento
    FROM movimientos_bancarios m JOIN partidas p ON p.id = m.partida_id
    JOIN partida_detalles d ON d.partida_id = p.id AND d.cuenta_id = cuenta.cuenta_id
    WHERE d.id = NEW.partida_detalle_id;
  IF partida.empresa_id IS DISTINCT FROM NEW.empresa_id OR partida.cuenta_id IS DISTINCT FROM cuenta.cuenta_id
     OR partida.fecha <> NEW.fecha OR partida.estado NOT IN ('contabilizada', 'anulada')
     OR movimiento.referencia IS DISTINCT FROM NEW.referencia OR movimiento.fecha <> NEW.fecha
     OR (partida.debe - partida.haber) <> NEW.monto THEN
    RAISE EXCEPTION 'La coincidencia debe tener igual fecha, referencia y monto que el movimiento de libros.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION interno.lineas_estado_cuenta_no_truncar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se puede vaciar el historial del estado de cuenta importado.' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION interno.lineas_estado_cuenta_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.lineas_estado_cuenta_no_truncar() FROM PUBLIC;
CREATE TRIGGER "lineas_estado_cuenta_validar_antes" BEFORE INSERT OR UPDATE OR DELETE ON "lineas_estado_cuenta"
  FOR EACH ROW EXECUTE FUNCTION interno.lineas_estado_cuenta_validar();
CREATE TRIGGER "lineas_estado_cuenta_no_truncar" BEFORE TRUNCATE ON "lineas_estado_cuenta"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.lineas_estado_cuenta_no_truncar();
CREATE TRIGGER "lineas_estado_cuenta_bitacora" AFTER INSERT ON "lineas_estado_cuenta"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
ALTER TABLE "lineas_estado_cuenta" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "lineas_estado_cuenta" FROM anon, authenticated;
  END IF;
END $$;
