-- Calendario tributario (HU-52, S3-T55): constancia de que una obligación mensual ya se presentó.
-- Las fechas de vencimiento no se guardan: se calculan (décimo día hábil del mes siguiente). Solo se registra
-- lo que el contador marca como presentado, para que el calendario y el tablero dejen de avisarlo.

CREATE TABLE "presentaciones_tributarias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "obligacion" VARCHAR(20) NOT NULL,
    "periodo" DATE NOT NULL,
    "presentada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "presentada_por" UUID,
    "nota" VARCHAR(200),

    CONSTRAINT "presentaciones_tributarias_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "presentaciones_tributarias_obligacion_check" CHECK ("obligacion" IN ('f07', 'f14', 'planilla')),
    CONSTRAINT "presentaciones_tributarias_periodo_check" CHECK (EXTRACT(DAY FROM "periodo") = 1)
);

CREATE UNIQUE INDEX "presentaciones_tributarias_empresa_id_obligacion_periodo_key"
  ON "presentaciones_tributarias"("empresa_id", "obligacion", "periodo");

ALTER TABLE "presentaciones_tributarias" ADD CONSTRAINT "presentaciones_tributarias_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "presentaciones_tributarias" IS 'Obligaciones tributarias mensuales (F-07, F-14, planillas) que el contador marcó como presentadas.';
COMMENT ON COLUMN "presentaciones_tributarias"."id" IS 'Identificador de la constancia.';
COMMENT ON COLUMN "presentaciones_tributarias"."empresa_id" IS 'Empresa que presentó la obligación.';
COMMENT ON COLUMN "presentaciones_tributarias"."obligacion" IS 'f07 (IVA), f14 (pago a cuenta y retenciones) o planilla (ISSS y AFP).';
COMMENT ON COLUMN "presentaciones_tributarias"."periodo" IS 'Primer día del mes al que corresponde la declaración (vence el mes siguiente).';
COMMENT ON COLUMN "presentaciones_tributarias"."presentada_en" IS 'Fecha y hora en que se marcó como presentada.';
COMMENT ON COLUMN "presentaciones_tributarias"."presentada_por" IS 'Usuario que la marcó como presentada.';
COMMENT ON COLUMN "presentaciones_tributarias"."nota" IS 'Dato libre, por ejemplo el número de acuse del portal de Hacienda.';

CREATE TRIGGER presentaciones_tributarias_bitacora AFTER INSERT OR UPDATE OR DELETE ON "presentaciones_tributarias"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

ALTER TABLE "presentaciones_tributarias" ENABLE ROW LEVEL SECURITY;
