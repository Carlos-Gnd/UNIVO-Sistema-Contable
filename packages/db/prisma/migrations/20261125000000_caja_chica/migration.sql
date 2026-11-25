-- Caja chica con fondo fijo, vales inmutables y partidas de apertura y reintegro (HU-77, S3-T115).
-- Cada fondo es de una sucursal. El efectivo comprometido en vales pendientes no puede superar el fondo.

CREATE TYPE "estado_vale_caja_chica" AS ENUM ('por_reintegrar', 'reintegrado');

CREATE TABLE "cajas_chicas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "cuenta_tesoreria_id" UUID NOT NULL,
    "fondo_fijo" DECIMAL(14,2) NOT NULL,
    "partida_apertura_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cajas_chicas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cajas_chicas_fondo_positivo" CHECK ("fondo_fijo" > 0)
);

CREATE UNIQUE INDEX "cajas_chicas_id_empresa_id_key" ON "cajas_chicas"("id", "empresa_id");
CREATE UNIQUE INDEX "cajas_chicas_empresa_id_sucursal_id_key" ON "cajas_chicas"("empresa_id", "sucursal_id");
CREATE UNIQUE INDEX "cajas_chicas_cuenta_tesoreria_id_key" ON "cajas_chicas"("cuenta_tesoreria_id");
CREATE UNIQUE INDEX "cajas_chicas_partida_apertura_id_key" ON "cajas_chicas"("partida_apertura_id");

ALTER TABLE "cajas_chicas" ADD CONSTRAINT "cajas_chicas_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cajas_chicas" ADD CONSTRAINT "cajas_chicas_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cajas_chicas" ADD CONSTRAINT "cajas_chicas_cuenta_tesoreria_id_fkey"
  FOREIGN KEY ("cuenta_tesoreria_id") REFERENCES "cuentas_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cajas_chicas" ADD CONSTRAINT "cajas_chicas_partida_apertura_id_fkey"
  FOREIGN KEY ("partida_apertura_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "vales_caja_chica" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "caja_chica_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "comprobante" VARCHAR(60) NOT NULL,
    "concepto" VARCHAR(200) NOT NULL,
    "monto_neto" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cuenta_gasto_id" UUID NOT NULL,
    "estado" "estado_vale_caja_chica" NOT NULL DEFAULT 'por_reintegrar',
    "partida_reintegro_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vales_caja_chica_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vales_caja_chica_importes_validos" CHECK (
      "monto_neto" >= 0 AND "iva" >= 0 AND "monto_neto" + "iva" > 0
    ),
    CONSTRAINT "vales_caja_chica_estado_partida" CHECK (
      ("estado" = 'por_reintegrar' AND "partida_reintegro_id" IS NULL)
      OR ("estado" = 'reintegrado' AND "partida_reintegro_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "vales_caja_chica_id_empresa_id_key" ON "vales_caja_chica"("id", "empresa_id");
CREATE INDEX "vales_caja_chica_empresa_id_caja_chica_id_estado_idx"
  ON "vales_caja_chica"("empresa_id", "caja_chica_id", "estado");

ALTER TABLE "vales_caja_chica" ADD CONSTRAINT "vales_caja_chica_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vales_caja_chica" ADD CONSTRAINT "vales_caja_chica_caja_chica_id_empresa_id_fkey"
  FOREIGN KEY ("caja_chica_id", "empresa_id") REFERENCES "cajas_chicas"("id", "empresa_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vales_caja_chica" ADD CONSTRAINT "vales_caja_chica_cuenta_gasto_id_fkey"
  FOREIGN KEY ("cuenta_gasto_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vales_caja_chica" ADD CONSTRAINT "vales_caja_chica_partida_reintegro_id_fkey"
  FOREIGN KEY ("partida_reintegro_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "cajas_chicas" IS 'Fondos fijos de caja chica abiertos por sucursal; la apertura se respalda con una partida en borrador.';
COMMENT ON COLUMN "cajas_chicas"."id" IS 'Identificador del fondo fijo.';
COMMENT ON COLUMN "cajas_chicas"."empresa_id" IS 'Empresa dueña del fondo.';
COMMENT ON COLUMN "cajas_chicas"."sucursal_id" IS 'Sucursal a la que pertenece el fondo fijo.';
COMMENT ON COLUMN "cajas_chicas"."cuenta_tesoreria_id" IS 'Cuenta de tesorería tipo caja vinculada a la cuenta contable de caja chica.';
COMMENT ON COLUMN "cajas_chicas"."fondo_fijo" IS 'Monto fijo autorizado para el fondo, en dólares.';
COMMENT ON COLUMN "cajas_chicas"."partida_apertura_id" IS 'Partida en borrador que registra la apertura del fondo.';
COMMENT ON COLUMN "cajas_chicas"."creado_en" IS 'Fecha y hora de apertura.';
COMMENT ON TABLE "vales_caja_chica" IS 'Vales de gastos menores; solo pueden pasar una vez de por reintegrar a reintegrado.';
COMMENT ON COLUMN "vales_caja_chica"."id" IS 'Identificador del vale.';
COMMENT ON COLUMN "vales_caja_chica"."empresa_id" IS 'Empresa dueña del vale.';
COMMENT ON COLUMN "vales_caja_chica"."caja_chica_id" IS 'Fondo fijo que pagó el vale.';
COMMENT ON COLUMN "vales_caja_chica"."fecha" IS 'Fecha del gasto respaldado por el comprobante.';
COMMENT ON COLUMN "vales_caja_chica"."comprobante" IS 'Número o referencia del comprobante del gasto.';
COMMENT ON COLUMN "vales_caja_chica"."concepto" IS 'Descripción breve del gasto.';
COMMENT ON COLUMN "vales_caja_chica"."monto_neto" IS 'Importe del gasto antes del IVA, en dólares.';
COMMENT ON COLUMN "vales_caja_chica"."iva" IS 'IVA acreditable indicado por el comprobante, en dólares.';
COMMENT ON COLUMN "vales_caja_chica"."cuenta_gasto_id" IS 'Cuenta de gasto imputable que se debitará al reintegrar.';
COMMENT ON COLUMN "vales_caja_chica"."estado" IS 'Por reintegrar o reintegrado mediante una partida en borrador.';
COMMENT ON COLUMN "vales_caja_chica"."partida_reintegro_id" IS 'Partida en borrador que respalda el reintegro; nula mientras el vale está pendiente.';
COMMENT ON COLUMN "vales_caja_chica"."creado_en" IS 'Fecha y hora de registro del vale.';

CREATE FUNCTION interno.cajas_chicas_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cuenta RECORD;
  partida RECORD;
  sumas RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sucursales s WHERE s.id = NEW.sucursal_id AND s.empresa_id = NEW.empresa_id AND s.activa
  ) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa o está inactiva.' USING ERRCODE = 'P0001';
  END IF;

  SELECT ct.empresa_id, ct.sucursal_id, ct.tipo::text AS tipo, ct.cuenta_id, ct.activa
    INTO cuenta FROM cuentas_tesoreria ct WHERE ct.id = NEW.cuenta_tesoreria_id;
  IF NOT FOUND OR cuenta.empresa_id <> NEW.empresa_id THEN
    RAISE EXCEPTION 'La cuenta de caja chica no existe en esta empresa.' USING ERRCODE = 'P0001';
  END IF;
  IF cuenta.tipo <> 'caja' OR NOT cuenta.activa THEN
    RAISE EXCEPTION 'La cuenta vinculada debe ser una caja activa.' USING ERRCODE = 'P0001';
  END IF;
  IF cuenta.sucursal_id IS NOT NULL AND cuenta.sucursal_id <> NEW.sucursal_id THEN
    RAISE EXCEPTION 'La cuenta de caja chica pertenece a otra sucursal.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cuentas c WHERE c.id = cuenta.cuenta_id AND c.empresa_id = NEW.empresa_id
      AND c.codigo LIKE '110102%' AND c.activa
      AND NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.empresa_id = c.empresa_id AND h.cuenta_padre_id = c.id)
  ) THEN
    RAISE EXCEPTION 'La caja chica debe usar una cuenta activa e imputable de código 110102.' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.empresa_id, p.sucursal_id, p.estado::text AS estado, p.origen, p.origen_id
    INTO partida FROM partidas p WHERE p.id = NEW.partida_apertura_id;
  IF NOT FOUND OR partida.empresa_id <> NEW.empresa_id OR partida.sucursal_id <> NEW.sucursal_id
     OR partida.estado <> 'borrador' OR partida.origen <> 'caja_chica_apertura' OR partida.origen_id <> NEW.id THEN
    RAISE EXCEPTION 'La partida de apertura no corresponde al fondo fijo.' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) AS lineas, coalesce(sum(d.debe), 0) AS debe, coalesce(sum(d.haber), 0) AS haber,
         coalesce(bool_or(d.cuenta_id = cuenta.cuenta_id AND d.debe = NEW.fondo_fijo AND d.haber = 0), false) AS tiene_caja
    INTO sumas FROM partida_detalles d WHERE d.partida_id = NEW.partida_apertura_id;
  IF sumas.lineas <> 2 OR sumas.debe <> NEW.fondo_fijo OR sumas.haber <> NEW.fondo_fijo OR NOT sumas.tiene_caja THEN
    RAISE EXCEPTION 'La partida de apertura debe trasladar el fondo fijo completo.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION interno.cajas_chicas_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La apertura de caja chica es inmutable.' USING ERRCODE = 'P0001';
END;
$$;

CREATE FUNCTION interno.vales_caja_chica_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  fondo DECIMAL(14,2);
  comprometido DECIMAL(14,2);
  sucursal UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los vales no se eliminan; se conserva su historial.' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.id, OLD.empresa_id, OLD.caja_chica_id, OLD.fecha, OLD.comprobante, OLD.concepto,
        OLD.monto_neto, OLD.iva, OLD.cuenta_gasto_id, OLD.creado_en)
       IS DISTINCT FROM
       (NEW.id, NEW.empresa_id, NEW.caja_chica_id, NEW.fecha, NEW.comprobante, NEW.concepto,
        NEW.monto_neto, NEW.iva, NEW.cuenta_gasto_id, NEW.creado_en)
       OR OLD.estado <> 'por_reintegrar' OR NEW.estado <> 'reintegrado'
       OR OLD.partida_reintegro_id IS NOT NULL OR NEW.partida_reintegro_id IS NULL THEN
      RAISE EXCEPTION 'El vale es inmutable; solo puede reintegrarse una vez.' USING ERRCODE = 'P0001';
    END IF;
    SELECT cc.sucursal_id INTO sucursal FROM cajas_chicas cc
      WHERE cc.id = NEW.caja_chica_id AND cc.empresa_id = NEW.empresa_id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM partidas p
      WHERE p.id = NEW.partida_reintegro_id AND p.empresa_id = NEW.empresa_id
        AND p.sucursal_id = sucursal AND p.estado = 'borrador'
        AND p.origen = 'caja_chica_reintegro' AND p.origen_id = NEW.caja_chica_id
    ) THEN
      RAISE EXCEPTION 'La partida no corresponde al reintegro de este fondo.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  SELECT cc.fondo_fijo INTO fondo FROM cajas_chicas cc
    WHERE cc.id = NEW.caja_chica_id AND cc.empresa_id = NEW.empresa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caja chica no existe en esta empresa.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cuentas c WHERE c.id = NEW.cuenta_gasto_id AND c.empresa_id = NEW.empresa_id
      AND c.activa AND c.tipo = 'costos_gastos'
  ) OR EXISTS (
    SELECT 1 FROM cuentas c WHERE c.empresa_id = NEW.empresa_id AND c.cuenta_padre_id = NEW.cuenta_gasto_id
  ) THEN
    RAISE EXCEPTION 'El gasto debe usar una cuenta activa e imputable de costos o gastos.' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(sum(v.monto_neto + v.iva), 0) INTO comprometido
    FROM vales_caja_chica v WHERE v.empresa_id = NEW.empresa_id
      AND v.caja_chica_id = NEW.caja_chica_id AND v.estado = 'por_reintegrar';
  IF comprometido + NEW.monto_neto + NEW.iva > fondo THEN
    RAISE EXCEPTION 'El vale supera el efectivo disponible de caja chica.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION interno.vales_caja_chica_no_truncar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se puede vaciar el historial de caja chica.' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION interno.cajas_chicas_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.cajas_chicas_inmutables() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.vales_caja_chica_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.vales_caja_chica_no_truncar() FROM PUBLIC;

CREATE TRIGGER "cajas_chicas_validar_antes" BEFORE INSERT ON "cajas_chicas"
  FOR EACH ROW EXECUTE FUNCTION interno.cajas_chicas_validar();
CREATE TRIGGER "cajas_chicas_inmutables" BEFORE UPDATE OR DELETE ON "cajas_chicas"
  FOR EACH ROW EXECUTE FUNCTION interno.cajas_chicas_inmutables();
CREATE TRIGGER "cajas_chicas_no_truncar" BEFORE TRUNCATE ON "cajas_chicas"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.vales_caja_chica_no_truncar();
CREATE TRIGGER "cajas_chicas_bitacora" AFTER INSERT ON "cajas_chicas"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

CREATE TRIGGER "vales_caja_chica_validar_antes" BEFORE INSERT OR UPDATE OR DELETE ON "vales_caja_chica"
  FOR EACH ROW EXECUTE FUNCTION interno.vales_caja_chica_validar();
CREATE TRIGGER "vales_caja_chica_no_truncar" BEFORE TRUNCATE ON "vales_caja_chica"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.vales_caja_chica_no_truncar();
CREATE TRIGGER "vales_caja_chica_bitacora" AFTER INSERT OR UPDATE ON "vales_caja_chica"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

ALTER TABLE "cajas_chicas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vales_caja_chica" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "cajas_chicas", "vales_caja_chica" FROM anon, authenticated;
  END IF;
END $$;
