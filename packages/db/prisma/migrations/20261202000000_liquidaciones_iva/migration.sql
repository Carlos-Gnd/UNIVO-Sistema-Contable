-- Liquidación mensual del IVA (F-07) con su partida de liquidación (HU-48, S3-T43).
-- Guarda las cifras con que se generó la partida (Dr 2109 Débito Fiscal / Cr 1112 Crédito Fiscal, 111301, 111302 y
-- 211103 IVA por pagar). El remanente que sobra se queda en las cuentas de crédito y se traslada al mes siguiente.

CREATE TABLE "liquidaciones_iva" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "periodo" DATE NOT NULL,
    "debito_fiscal" DECIMAL(14,2) NOT NULL,
    "credito_fiscal" DECIMAL(14,2) NOT NULL,
    "percibido_sufrido" DECIMAL(14,2) NOT NULL,
    "retenido_sufrido" DECIMAL(14,2) NOT NULL,
    "remanente_anterior" DECIMAL(14,2) NOT NULL,
    "iva_por_pagar" DECIMAL(14,2) NOT NULL,
    "remanente_credito" DECIMAL(14,2) NOT NULL,
    "remanente_percibido" DECIMAL(14,2) NOT NULL,
    "remanente_retenido" DECIMAL(14,2) NOT NULL,
    "partida_id" UUID NOT NULL,
    "presentada_por" UUID,
    "presentada_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidaciones_iva_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "liquidaciones_iva_periodo_inicio_mes" CHECK ("periodo" = date_trunc('month', "periodo")::date),
    CONSTRAINT "liquidaciones_iva_importes_no_negativos" CHECK (
      "debito_fiscal" >= 0 AND "credito_fiscal" >= 0 AND "percibido_sufrido" >= 0 AND "retenido_sufrido" >= 0
      AND "remanente_anterior" >= 0 AND "iva_por_pagar" >= 0
      AND "remanente_credito" >= 0 AND "remanente_percibido" >= 0 AND "remanente_retenido" >= 0
    ),
    CONSTRAINT "liquidaciones_iva_presentacion_completa" CHECK (
      ("presentada_en" IS NULL) = ("presentada_por" IS NULL)
    ),
    CONSTRAINT "liquidaciones_iva_empresa_id_fkey"
      FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "liquidaciones_iva_partida_id_fkey"
      FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "liquidaciones_iva_presentada_por_fkey"
      FOREIGN KEY ("presentada_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "liquidaciones_iva_empresa_periodo_unq" UNIQUE ("empresa_id", "periodo")
);

CREATE UNIQUE INDEX "liquidaciones_iva_partida_id_key" ON "liquidaciones_iva"("partida_id");

COMMENT ON TABLE "liquidaciones_iva" IS 'Liquidación mensual del IVA (F-07) con la partida de liquidación generada.';
COMMENT ON COLUMN "liquidaciones_iva"."id" IS 'Identificador de la liquidación mensual del F-07.';
COMMENT ON COLUMN "liquidaciones_iva"."empresa_id" IS 'Empresa que declara.';
COMMENT ON COLUMN "liquidaciones_iva"."periodo" IS 'Primer día del mes declarado.';
COMMENT ON COLUMN "liquidaciones_iva"."debito_fiscal" IS 'IVA de las ventas del mes (libros de contribuyentes y de consumidor final), al generar la partida.';
COMMENT ON COLUMN "liquidaciones_iva"."credito_fiscal" IS 'IVA de las compras del mes con crédito fiscal (libro de compras), al generar la partida.';
COMMENT ON COLUMN "liquidaciones_iva"."percibido_sufrido" IS 'IVA percibido (1 %) que los proveedores gran contribuyente cobraron a la empresa en el mes.';
COMMENT ON COLUMN "liquidaciones_iva"."retenido_sufrido" IS 'IVA retenido (1 %) que los clientes gran contribuyente retuvieron a la empresa en el mes.';
COMMENT ON COLUMN "liquidaciones_iva"."remanente_anterior" IS 'Remanente de crédito de meses anteriores con que se liquidó el mes (suma de los tres componentes).';
COMMENT ON COLUMN "liquidaciones_iva"."iva_por_pagar" IS 'IVA a pagar: el débito fiscal que el crédito, las percepciones y las retenciones sufridas no cubren.';
COMMENT ON COLUMN "liquidaciones_iva"."remanente_credito" IS 'Crédito fiscal (cuenta 1112) que sobra y se traslada al mes siguiente.';
COMMENT ON COLUMN "liquidaciones_iva"."remanente_percibido" IS 'IVA percibido sufrido (cuenta 111301) que sobra y se traslada al mes siguiente.';
COMMENT ON COLUMN "liquidaciones_iva"."remanente_retenido" IS 'IVA retenido sufrido (cuenta 111302) que sobra y se traslada al mes siguiente.';
COMMENT ON COLUMN "liquidaciones_iva"."partida_id" IS 'Partida de liquidación (Dr 2109; Cr 1112, 111301, 111302 y 211103).';
COMMENT ON COLUMN "liquidaciones_iva"."presentada_por" IS 'Usuario que marcó el F-07 como presentado.';
COMMENT ON COLUMN "liquidaciones_iva"."presentada_en" IS 'Fecha y hora en que se marcó el F-07 como presentado; vacío si aún no se presenta.';
COMMENT ON COLUMN "liquidaciones_iva"."creado_en" IS 'Fecha y hora de creación del registro.';
COMMENT ON COLUMN "liquidaciones_iva"."actualizado_en" IS 'Fecha y hora de la última actualización del registro.';

CREATE FUNCTION interno.liquidaciones_iva_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_partida RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.presentada_en IS NOT NULL THEN
      RAISE EXCEPTION 'No se puede eliminar una liquidación de IVA ya presentada'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.presentada_en IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede modificar una liquidación de IVA ya presentada'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.empresa_id, p.estado, p.fecha, p.origen INTO v_partida FROM partidas p WHERE p.id = NEW.partida_id;
  IF NOT FOUND OR v_partida.empresa_id <> NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa de la liquidación de IVA'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_partida.origen <> 'liquidacion_iva' THEN
    RAISE EXCEPTION 'La partida de una liquidación de IVA debe tener origen «liquidacion_iva»'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_partida.fecha <> (date_trunc('month', NEW.periodo) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'La partida debe tener la fecha del último día del mes declarado'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.partida_id <> OLD.partida_id AND NOT EXISTS (
    SELECT 1 FROM partidas p WHERE p.id = OLD.partida_id AND p.estado = 'anulada'
  ) THEN
    RAISE EXCEPTION 'Solo se reemplaza la partida de una liquidación de IVA cuando la anterior fue anulada'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.presentada_en IS NOT NULL AND v_partida.estado <> 'contabilizada' THEN
    RAISE EXCEPTION 'La partida de la liquidación de IVA debe estar contabilizada para presentarla'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER "liquidaciones_iva_validar_antes"
  BEFORE INSERT OR UPDATE OR DELETE ON "liquidaciones_iva"
  FOR EACH ROW EXECUTE FUNCTION interno.liquidaciones_iva_validar();
CREATE TRIGGER "liquidaciones_iva_actualizado_en" BEFORE UPDATE ON "liquidaciones_iva"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "liquidaciones_iva_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "liquidaciones_iva"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.liquidaciones_iva_validar() FROM PUBLIC;
COMMENT ON FUNCTION interno.liquidaciones_iva_validar() IS 'Valida empresa, origen, fecha y estado de la partida de la liquidación de IVA y bloquea cambios después de presentarla.';

ALTER TABLE "liquidaciones_iva" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "liquidaciones_iva" FROM anon, authenticated;
  END IF;
END $$;
