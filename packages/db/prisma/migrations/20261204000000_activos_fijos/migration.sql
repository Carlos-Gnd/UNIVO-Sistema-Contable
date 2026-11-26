-- Registro de activos fijos (HU-81, S3-T127).
-- Cada activo guarda su costo, valor residual, vida útil y las tres cuentas con las que se contabiliza (costo,
-- depreciación acumulada y gasto por depreciación). El alta y la baja generan partidas contabilizadas desde la
-- API; la depreciación acumulada la actualiza la generación mensual (HU-82). La base valida que las cuentas y
-- la sucursal sean de la empresa y que un activo con depreciación o dado de baja no cambie su costo ni su vida.

CREATE TABLE "activos_fijos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "codigo" VARCHAR(20),
    "nombre" VARCHAR(200) NOT NULL,
    "categoria" VARCHAR(30) NOT NULL,
    "cuenta_activo_id" UUID NOT NULL,
    "cuenta_depreciacion_id" UUID NOT NULL,
    "cuenta_gasto_id" UUID NOT NULL,
    "costo" DECIMAL(14,2) NOT NULL,
    "valor_residual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fecha_adquisicion" DATE NOT NULL,
    "vida_util_anios" SMALLINT NOT NULL,
    "metodo" VARCHAR(20) NOT NULL DEFAULT 'linea_recta',
    "depreciacion_acumulada" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ultimo_mes_depreciado" DATE,
    "estado" VARCHAR(10) NOT NULL DEFAULT 'activo',
    "fecha_baja" DATE,
    "partida_alta_id" UUID,
    "partida_baja_id" UUID,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activos_fijos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activos_fijos_categoria_check" CHECK ("categoria" IN ('edificaciones', 'instalaciones', 'equipo_transporte', 'mobiliario_equipo')),
    CONSTRAINT "activos_fijos_metodo_check" CHECK ("metodo" IN ('linea_recta')),
    CONSTRAINT "activos_fijos_estado_check" CHECK ("estado" IN ('activo', 'de_baja')),
    CONSTRAINT "activos_fijos_costo_check" CHECK ("costo" > 0 AND "valor_residual" >= 0 AND "valor_residual" < "costo"),
    CONSTRAINT "activos_fijos_vida_check" CHECK ("vida_util_anios" BETWEEN 1 AND 100),
    CONSTRAINT "activos_fijos_acumulada_check" CHECK ("depreciacion_acumulada" >= 0 AND "depreciacion_acumulada" <= "costo" - "valor_residual"),
    CONSTRAINT "activos_fijos_baja_check" CHECK (("estado" = 'de_baja') = ("fecha_baja" IS NOT NULL))
);

CREATE UNIQUE INDEX "activos_fijos_empresa_id_codigo_key" ON "activos_fijos"("empresa_id", "codigo");
CREATE INDEX "activos_fijos_sucursal_id_idx" ON "activos_fijos"("sucursal_id");
CREATE INDEX "activos_fijos_empresa_id_estado_idx" ON "activos_fijos"("empresa_id", "estado");
CREATE INDEX "activos_fijos_cuenta_activo_id_idx" ON "activos_fijos"("cuenta_activo_id");
CREATE INDEX "activos_fijos_cuenta_depreciacion_id_idx" ON "activos_fijos"("cuenta_depreciacion_id");
CREATE INDEX "activos_fijos_cuenta_gasto_id_idx" ON "activos_fijos"("cuenta_gasto_id");
CREATE INDEX "activos_fijos_partida_alta_id_idx" ON "activos_fijos"("partida_alta_id");
CREATE INDEX "activos_fijos_partida_baja_id_idx" ON "activos_fijos"("partida_baja_id");

ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_cuenta_activo_id_fkey"
  FOREIGN KEY ("cuenta_activo_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_cuenta_depreciacion_id_fkey"
  FOREIGN KEY ("cuenta_depreciacion_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_cuenta_gasto_id_fkey"
  FOREIGN KEY ("cuenta_gasto_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_partida_alta_id_fkey"
  FOREIGN KEY ("partida_alta_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_partida_baja_id_fkey"
  FOREIGN KEY ("partida_baja_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "activos_fijos" IS 'Activos fijos de la empresa con su costo, vida útil y cuentas contables; base del cuadro de depreciación.';
COMMENT ON COLUMN "activos_fijos"."id" IS 'Identificador del activo fijo.';
COMMENT ON COLUMN "activos_fijos"."empresa_id" IS 'Empresa dueña del activo.';
COMMENT ON COLUMN "activos_fijos"."sucursal_id" IS 'Sucursal donde está el activo; sus partidas se registran en ella.';
COMMENT ON COLUMN "activos_fijos"."codigo" IS 'Código correlativo dentro de la empresa (AF-0001); lo asigna la base al crear el activo.';
COMMENT ON COLUMN "activos_fijos"."nombre" IS 'Descripción del activo.';
COMMENT ON COLUMN "activos_fijos"."categoria" IS 'Categoría fiscal (Art. 30 de la LISR): edificaciones, instalaciones (maquinaria), equipo_transporte o mobiliario_equipo.';
COMMENT ON COLUMN "activos_fijos"."cuenta_activo_id" IS 'Cuenta del activo (Propiedad, planta y equipo) donde se registra el costo.';
COMMENT ON COLUMN "activos_fijos"."cuenta_depreciacion_id" IS 'Cuenta de depreciación acumulada, de naturaleza acreedora, que reduce el valor del activo.';
COMMENT ON COLUMN "activos_fijos"."cuenta_gasto_id" IS 'Cuenta de gasto por depreciación que se carga en cada cuota mensual.';
COMMENT ON COLUMN "activos_fijos"."costo" IS 'Costo de adquisición en dólares.';
COMMENT ON COLUMN "activos_fijos"."valor_residual" IS 'Valor que se espera recuperar al final de la vida útil; no se deprecia.';
COMMENT ON COLUMN "activos_fijos"."fecha_adquisicion" IS 'Fecha de adquisición; la depreciación empieza en ese mes.';
COMMENT ON COLUMN "activos_fijos"."vida_util_anios" IS 'Vida útil en años; no puede ser menor a la que resulta del porcentaje máximo fiscal de su categoría.';
COMMENT ON COLUMN "activos_fijos"."metodo" IS 'Método de depreciación; por ahora solo línea recta.';
COMMENT ON COLUMN "activos_fijos"."depreciacion_acumulada" IS 'Depreciación registrada hasta el último mes depreciado; la actualiza la generación mensual.';
COMMENT ON COLUMN "activos_fijos"."ultimo_mes_depreciado" IS 'Primer día del último mes con depreciación contabilizada; nulo si aún no se deprecia.';
COMMENT ON COLUMN "activos_fijos"."estado" IS 'activo o de_baja; una baja no se revierte.';
COMMENT ON COLUMN "activos_fijos"."fecha_baja" IS 'Fecha de la baja; solo los activos de_baja la tienen.';
COMMENT ON COLUMN "activos_fijos"."partida_alta_id" IS 'Partida de adquisición generada al registrar el activo; nula si el activo ya estaba en los saldos iniciales.';
COMMENT ON COLUMN "activos_fijos"."partida_baja_id" IS 'Partida de baja generada al dar de baja el activo.';
COMMENT ON COLUMN "activos_fijos"."creado_por" IS 'Usuario que registró el activo.';
COMMENT ON COLUMN "activos_fijos"."creado_en" IS 'Fecha y hora de registro.';
COMMENT ON COLUMN "activos_fijos"."actualizado_en" IS 'Fecha y hora de la última modificación.';

-- Validaciones que dependen de otras tablas y asignación del código.
CREATE FUNCTION interno.activos_fijos_antes_guardar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  cuenta_id uuid;
  siguiente int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'La sucursal del activo no pertenece a la empresa';
  END IF;
  FOREACH cuenta_id IN ARRAY ARRAY[NEW.cuenta_activo_id, NEW.cuenta_depreciacion_id, NEW.cuenta_gasto_id] LOOP
    IF NOT EXISTS (SELECT 1 FROM cuentas WHERE id = cuenta_id AND empresa_id = NEW.empresa_id) THEN
      RAISE EXCEPTION 'Las cuentas del activo deben ser de la empresa';
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    IF NEW.codigo IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('activos_fijos'), hashtext(NEW.empresa_id::text));
      SELECT coalesce(max(substring(codigo FROM '^AF-(\d+)$')::int), 0) + 1 INTO siguiente
      FROM activos_fijos WHERE empresa_id = NEW.empresa_id;
      NEW.codigo := 'AF-' || lpad(siguiente::text, 4, '0');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.empresa_id <> OLD.empresa_id OR NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'No se puede cambiar la empresa ni el código del activo';
  END IF;
  IF OLD.estado = 'de_baja' THEN
    RAISE EXCEPTION 'El activo % está dado de baja y no admite cambios', OLD.codigo;
  END IF;
  IF (OLD.depreciacion_acumulada > 0 OR NEW.depreciacion_acumulada > 0)
     AND (NEW.costo <> OLD.costo OR NEW.valor_residual <> OLD.valor_residual
          OR NEW.vida_util_anios <> OLD.vida_util_anios OR NEW.fecha_adquisicion <> OLD.fecha_adquisicion
          OR NEW.cuenta_depreciacion_id <> OLD.cuenta_depreciacion_id OR NEW.cuenta_gasto_id <> OLD.cuenta_gasto_id) THEN
    RAISE EXCEPTION 'El activo % ya tiene depreciación: no se pueden cambiar su costo, vida útil ni cuentas', OLD.codigo;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.activos_fijos_antes_guardar() FROM PUBLIC;
COMMENT ON FUNCTION interno.activos_fijos_antes_guardar() IS 'Trigger de activos_fijos: valida que sucursal y cuentas sean de la empresa, asigna el código AF-NNNN y protege el costo y la vida útil de un activo depreciado o dado de baja.';

CREATE TRIGGER activos_fijos_antes_guardar BEFORE INSERT OR UPDATE ON "activos_fijos"
  FOR EACH ROW EXECUTE FUNCTION interno.activos_fijos_antes_guardar();
CREATE TRIGGER activos_fijos_actualizado_en BEFORE UPDATE ON "activos_fijos"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER activos_fijos_bitacora AFTER INSERT OR UPDATE OR DELETE ON "activos_fijos"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

ALTER TABLE "activos_fijos" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "activos_fijos" FROM anon, authenticated;
  END IF;
END $$;
