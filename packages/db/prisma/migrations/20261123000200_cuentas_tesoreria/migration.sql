-- Caja general y cuentas bancarias de la empresa (HU-76, S3-T112).
-- Cada una se vincula a una cuenta contable de efectivo (1101…), que debe ser de la misma empresa, de último nivel
-- y no estar usada por otra caja o banco; el saldo actual sale de los libros. Los bancos llevan su entidad y su
-- número de cuenta, únicos por empresa. Los cambios quedan en la bitácora.

CREATE TYPE "tipo_cuenta_tesoreria" AS ENUM ('caja', 'banco');

CREATE TABLE "cuentas_tesoreria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "cuenta_id" UUID NOT NULL,
    "tipo" "tipo_cuenta_tesoreria" NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "banco" VARCHAR(80),
    "numero_cuenta" VARCHAR(40),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_tesoreria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cuentas_tesoreria_banco_datos" CHECK (
      (tipo = 'banco' AND banco IS NOT NULL AND numero_cuenta IS NOT NULL)
      OR (tipo = 'caja' AND banco IS NULL AND numero_cuenta IS NULL)
    )
);

CREATE UNIQUE INDEX "cuentas_tesoreria_cuenta_id_key" ON "cuentas_tesoreria"("cuenta_id");
CREATE UNIQUE INDEX "cuentas_tesoreria_empresa_id_banco_numero_cuenta_key" ON "cuentas_tesoreria"("empresa_id", "banco", "numero_cuenta");
CREATE INDEX "cuentas_tesoreria_empresa_id_idx" ON "cuentas_tesoreria"("empresa_id");

ALTER TABLE "cuentas_tesoreria" ADD CONSTRAINT "cuentas_tesoreria_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cuentas_tesoreria" ADD CONSTRAINT "cuentas_tesoreria_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cuentas_tesoreria" ADD CONSTRAINT "cuentas_tesoreria_cuenta_id_fkey"
  FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "cuentas_tesoreria" IS 'Cajas y cuentas bancarias de la empresa, cada una vinculada a su cuenta contable de efectivo.';
COMMENT ON COLUMN "cuentas_tesoreria"."id" IS 'Identificador de la caja o cuenta bancaria.';
COMMENT ON COLUMN "cuentas_tesoreria"."empresa_id" IS 'Empresa dueña.';
COMMENT ON COLUMN "cuentas_tesoreria"."sucursal_id" IS 'Sucursal a la que pertenece; nulo si es de toda la empresa.';
COMMENT ON COLUMN "cuentas_tesoreria"."cuenta_id" IS 'Cuenta contable de efectivo (1101…) donde se registran sus movimientos; una sola caja o banco por cuenta.';
COMMENT ON COLUMN "cuentas_tesoreria"."tipo" IS 'Caja o banco.';
COMMENT ON COLUMN "cuentas_tesoreria"."nombre" IS 'Nombre con que se identifica, por ejemplo «Caja general» o «Banco Agrícola corriente».';
COMMENT ON COLUMN "cuentas_tesoreria"."banco" IS 'Entidad bancaria; solo en los bancos.';
COMMENT ON COLUMN "cuentas_tesoreria"."numero_cuenta" IS 'Número de la cuenta en el banco; único por empresa y banco.';
COMMENT ON COLUMN "cuentas_tesoreria"."activa" IS 'Una cuenta inactiva no se ofrece para nuevos movimientos.';
COMMENT ON COLUMN "cuentas_tesoreria"."creado_en" IS 'Fecha y hora de creación.';
COMMENT ON COLUMN "cuentas_tesoreria"."actualizado_en" IS 'Fecha y hora de la última modificación.';

-- La cuenta contable debe ser de efectivo, de último nivel y de la misma empresa que la caja o el banco
CREATE FUNCTION interno.cuentas_tesoreria_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  codigo_cuenta text;
BEGIN
  SELECT codigo INTO codigo_cuenta FROM cuentas WHERE id = NEW.cuenta_id AND empresa_id = NEW.empresa_id;
  IF codigo_cuenta IS NULL THEN
    RAISE EXCEPTION 'La cuenta contable no pertenece a la empresa' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF codigo_cuenta !~ '^1101.' THEN
    RAISE EXCEPTION 'La cuenta contable debe ser una subcuenta de efectivo (1101…)' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM cuentas WHERE cuenta_padre_id = NEW.cuenta_id) THEN
    RAISE EXCEPTION 'La cuenta contable tiene subcuentas: vincula una de último nivel' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.sucursal_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.cuenta_id <> OLD.cuenta_id OR NEW.tipo <> OLD.tipo OR NEW.empresa_id <> OLD.empresa_id) THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo ni la cuenta contable de una caja o cuenta bancaria'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "cuentas_tesoreria_validar_antes" BEFORE INSERT OR UPDATE ON "cuentas_tesoreria"
  FOR EACH ROW EXECUTE FUNCTION interno.cuentas_tesoreria_validar();
CREATE TRIGGER "cuentas_tesoreria_actualizado_en" BEFORE UPDATE ON "cuentas_tesoreria"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "cuentas_tesoreria_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "cuentas_tesoreria"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.cuentas_tesoreria_validar() FROM PUBLIC;
COMMENT ON FUNCTION interno.cuentas_tesoreria_validar() IS 'Trigger de cuentas_tesoreria: cuenta de efectivo de último nivel, misma empresa y sin cambiar tipo ni cuenta.';

-- Como el resto de tablas, no es visible para la API de datos de Supabase
ALTER TABLE "cuentas_tesoreria" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "cuentas_tesoreria" FROM anon, authenticated;
  END IF;
END $$;
