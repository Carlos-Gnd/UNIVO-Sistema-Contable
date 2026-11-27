-- Facturación electrónica (EP-08: HU-53 a HU-57; S4-T04, T07, T10, T13 y T16) y firma digital (HU-87, HU-88).
--   · autoridad_certificadora: la CA simulada que emite los certificados (una sola fila).
--   · certificados_firma: certificado de cada empresa (firma de DTE) y de cada usuario firmante (estados).
--   · dte_correlativos: correlativo del número de control por tipo, establecimiento, punto de venta y año.
--   · documentos_electronicos: cada DTE emitido con su JSON, su firma JWS y el sello de recepción simulado;
--     una vez emitido solo puede pasar a invalidado (con su evento de invalidación) y nunca se borra.

-- ───────────── Autoridad certificadora y certificados ─────────────

CREATE TABLE "autoridad_certificadora" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "certificado_pem" TEXT NOT NULL,
    "clave_privada_cifrada" TEXT NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "valido_desde" TIMESTAMPTZ(6) NOT NULL,
    "valido_hasta" TIMESTAMPTZ(6) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autoridad_certificadora_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "autoridad_certificadora_unica_check" CHECK ("id" = 1)
);

COMMENT ON TABLE "autoridad_certificadora" IS 'Autoridad certificadora simulada del sistema (HU-87): certificado raíz que firma los certificados de empresas y usuarios.';
COMMENT ON COLUMN "autoridad_certificadora"."id" IS 'Siempre 1: hay una sola autoridad.';
COMMENT ON COLUMN "autoridad_certificadora"."certificado_pem" IS 'Certificado raíz autofirmado (X.509 en PEM).';
COMMENT ON COLUMN "autoridad_certificadora"."clave_privada_cifrada" IS 'Llave privada de la autoridad en PKCS#8 cifrada con AES-256 (FIRMA_SECRETO del servidor).';
COMMENT ON COLUMN "autoridad_certificadora"."huella" IS 'SHA-256 del certificado en DER (hexadecimal).';
COMMENT ON COLUMN "autoridad_certificadora"."valido_desde" IS 'Inicio de la vigencia del certificado raíz.';
COMMENT ON COLUMN "autoridad_certificadora"."valido_hasta" IS 'Fin de la vigencia del certificado raíz.';
COMMENT ON COLUMN "autoridad_certificadora"."creado_en" IS 'Fecha y hora en que se creó la autoridad.';

CREATE TABLE "certificados_firma" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID,
    "titular" VARCHAR(200) NOT NULL,
    "numero_serie" VARCHAR(40) NOT NULL,
    "certificado_pem" TEXT NOT NULL,
    "clave_privada_cifrada" TEXT NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "valido_desde" TIMESTAMPTZ(6) NOT NULL,
    "valido_hasta" TIMESTAMPTZ(6) NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificados_firma_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certificados_firma_vigencia_check" CHECK ("valido_hasta" > "valido_desde")
);

CREATE UNIQUE INDEX "certificados_firma_huella_key" ON "certificados_firma"("huella");
-- Un certificado vigente por empresa (DTE) y uno por usuario firmante en cada empresa; los reemplazados se conservan
-- porque las firmas hechas con ellos se siguen verificando
CREATE UNIQUE INDEX "certificados_firma_empresa_key" ON "certificados_firma"("empresa_id")
  WHERE "usuario_id" IS NULL AND "vigente";
CREATE UNIQUE INDEX "certificados_firma_usuario_key" ON "certificados_firma"("empresa_id", "usuario_id")
  WHERE "usuario_id" IS NOT NULL AND "vigente";
CREATE INDEX "certificados_firma_usuario_idx" ON "certificados_firma"("usuario_id");

ALTER TABLE "certificados_firma" ADD CONSTRAINT "certificados_firma_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificados_firma" ADD CONSTRAINT "certificados_firma_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "certificados_firma" IS 'Certificados emitidos por la autoridad simulada: el de la empresa firma sus DTE (HU-56) y el de cada usuario sus estados financieros (HU-87).';
COMMENT ON COLUMN "certificados_firma"."id" IS 'Identificador del certificado.';
COMMENT ON COLUMN "certificados_firma"."empresa_id" IS 'Empresa a la que pertenece el certificado.';
COMMENT ON COLUMN "certificados_firma"."usuario_id" IS 'Usuario firmante; nulo en el certificado de la empresa.';
COMMENT ON COLUMN "certificados_firma"."titular" IS 'Nombre del titular tal como figura en el certificado (CN).';
COMMENT ON COLUMN "certificados_firma"."numero_serie" IS 'Número de serie que asignó la autoridad (hexadecimal).';
COMMENT ON COLUMN "certificados_firma"."certificado_pem" IS 'Certificado X.509 en PEM.';
COMMENT ON COLUMN "certificados_firma"."clave_privada_cifrada" IS 'Llave privada en PKCS#8 cifrada con AES-256 (FIRMA_SECRETO del servidor).';
COMMENT ON COLUMN "certificados_firma"."huella" IS 'SHA-256 del certificado en DER (hexadecimal).';
COMMENT ON COLUMN "certificados_firma"."valido_desde" IS 'Inicio de la vigencia.';
COMMENT ON COLUMN "certificados_firma"."valido_hasta" IS 'Fin de la vigencia.';
COMMENT ON COLUMN "certificados_firma"."vigente" IS 'El que se usa para firmar; falso cuando venció o se reemplazó (sigue sirviendo para verificar).';
COMMENT ON COLUMN "certificados_firma"."creado_en" IS 'Fecha y hora de emisión.';

-- ───────────── Correlativos del número de control ─────────────

CREATE TABLE "dte_correlativos" (
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tipo_dte" CHAR(2) NOT NULL,
    "anio" SMALLINT NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "dte_correlativos_pkey" PRIMARY KEY ("empresa_id", "sucursal_id", "tipo_dte", "anio"),
    CONSTRAINT "dte_correlativos_tipo_check" CHECK ("tipo_dte" IN ('01', '03', '05', '06')),
    CONSTRAINT "dte_correlativos_ultimo_check" CHECK ("ultimo" > 0)
);

ALTER TABLE "dte_correlativos" ADD CONSTRAINT "dte_correlativos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dte_correlativos" ADD CONSTRAINT "dte_correlativos_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "dte_correlativos" IS 'Último correlativo del número de control de los DTE por tipo, sucursal (establecimiento y punto de venta) y año.';
COMMENT ON COLUMN "dte_correlativos"."empresa_id" IS 'Empresa emisora.';
COMMENT ON COLUMN "dte_correlativos"."sucursal_id" IS 'Sucursal cuyos códigos de establecimiento y punto de venta forman el número de control.';
COMMENT ON COLUMN "dte_correlativos"."tipo_dte" IS 'Tipo de DTE (CAT-002): 01 factura, 03 CCF, 05 nota de crédito, 06 nota de débito.';
COMMENT ON COLUMN "dte_correlativos"."anio" IS 'Año de emisión: el correlativo se reinicia cada año.';
COMMENT ON COLUMN "dte_correlativos"."ultimo" IS 'Último correlativo asignado.';

-- Siguiente correlativo del número de control; la fila bloqueada evita duplicados entre emisiones simultáneas.
CREATE FUNCTION interno.siguiente_correlativo_dte(p_empresa uuid, p_sucursal uuid, p_tipo text, p_anio int)
RETURNS int LANGUAGE sql SET search_path = public, pg_temp AS $$
  INSERT INTO dte_correlativos (empresa_id, sucursal_id, tipo_dte, anio, ultimo)
  VALUES (p_empresa, p_sucursal, p_tipo, p_anio, 1)
  ON CONFLICT (empresa_id, sucursal_id, tipo_dte, anio) DO UPDATE SET ultimo = dte_correlativos.ultimo + 1
  RETURNING ultimo;
$$;

COMMENT ON FUNCTION interno.siguiente_correlativo_dte(uuid, uuid, text, int) IS 'Asigna el siguiente correlativo del número de control de un DTE, sin saltos ni duplicados.';

-- ───────────── Documentos electrónicos ─────────────

CREATE TABLE "documentos_electronicos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tipo_dte" CHAR(2) NOT NULL,
    "documento_id" UUID,
    "nota_id" UUID,
    "relacionado_id" UUID,
    "codigo_generacion" UUID NOT NULL,
    "numero_control" VARCHAR(31) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "hora_emision" TIME(0) NOT NULL,
    "receptor_nombre" VARCHAR(250),
    "total" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,
    "documento" JSONB NOT NULL,
    "firma" TEXT NOT NULL,
    "certificado_id" UUID NOT NULL,
    "sello_recepcion" CHAR(40) NOT NULL,
    "recibido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" VARCHAR(12) NOT NULL DEFAULT 'procesado',
    "tipo_invalidacion" SMALLINT,
    "motivo_invalidacion" VARCHAR(250),
    "evento_invalidacion" JSONB,
    "firma_invalidacion" TEXT,
    "sello_invalidacion" CHAR(40),
    "invalidado_en" TIMESTAMPTZ(6),
    "invalidado_por" UUID,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_electronicos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documentos_electronicos_tipo_check" CHECK ("tipo_dte" IN ('01', '03', '05', '06')),
    CONSTRAINT "documentos_electronicos_estado_check" CHECK ("estado" IN ('procesado', 'invalidado')),
    -- Una factura o un CCF nace de una venta; una nota, de una nota comercial que corrige otro DTE
    CONSTRAINT "documentos_electronicos_origen_check" CHECK (
      CASE WHEN "tipo_dte" IN ('01', '03')
        THEN "documento_id" IS NOT NULL AND "nota_id" IS NULL AND "relacionado_id" IS NULL
        ELSE "nota_id" IS NOT NULL AND "documento_id" IS NULL AND "relacionado_id" IS NOT NULL
      END),
    CONSTRAINT "documentos_electronicos_invalidacion_check" CHECK (
      ("estado" = 'procesado' AND "tipo_invalidacion" IS NULL AND "motivo_invalidacion" IS NULL
        AND "evento_invalidacion" IS NULL AND "firma_invalidacion" IS NULL AND "sello_invalidacion" IS NULL
        AND "invalidado_en" IS NULL AND "invalidado_por" IS NULL)
      OR ("estado" = 'invalidado' AND "tipo_invalidacion" IN (1, 2, 3) AND "motivo_invalidacion" IS NOT NULL
        AND "evento_invalidacion" IS NOT NULL AND "firma_invalidacion" IS NOT NULL
        AND "sello_invalidacion" IS NOT NULL AND "invalidado_en" IS NOT NULL))
);

CREATE UNIQUE INDEX "documentos_electronicos_codigo_generacion_key" ON "documentos_electronicos"("codigo_generacion");
CREATE UNIQUE INDEX "documentos_electronicos_numero_control_key" ON "documentos_electronicos"("empresa_id", "numero_control");
-- Un documento comercial se emite una sola vez: invalidado, tampoco se vuelve a emitir
CREATE UNIQUE INDEX "documentos_electronicos_documento_id_key" ON "documentos_electronicos"("documento_id");
CREATE UNIQUE INDEX "documentos_electronicos_nota_id_key" ON "documentos_electronicos"("nota_id");
CREATE INDEX "documentos_electronicos_lista_idx" ON "documentos_electronicos"("empresa_id", "fecha_emision");
CREATE INDEX "documentos_electronicos_relacionado_idx" ON "documentos_electronicos"("relacionado_id");
CREATE INDEX "documentos_electronicos_sucursal_idx" ON "documentos_electronicos"("sucursal_id");
CREATE INDEX "documentos_electronicos_certificado_idx" ON "documentos_electronicos"("certificado_id");

ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_documento_id_fkey"
  FOREIGN KEY ("documento_id") REFERENCES "documentos_comerciales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_nota_id_fkey"
  FOREIGN KEY ("nota_id") REFERENCES "notas_comerciales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_relacionado_id_fkey"
  FOREIGN KEY ("relacionado_id") REFERENCES "documentos_electronicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_certificado_id_fkey"
  FOREIGN KEY ("certificado_id") REFERENCES "certificados_firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_invalidado_por_fkey"
  FOREIGN KEY ("invalidado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "documentos_electronicos" IS 'Documentos tributarios electrónicos emitidos (HU-53 a HU-57) en el ambiente de pruebas de Hacienda, con su firma y sello simulado.';
COMMENT ON COLUMN "documentos_electronicos"."id" IS 'Identificador del DTE.';
COMMENT ON COLUMN "documentos_electronicos"."empresa_id" IS 'Empresa emisora.';
COMMENT ON COLUMN "documentos_electronicos"."sucursal_id" IS 'Sucursal emisora (establecimiento y punto de venta).';
COMMENT ON COLUMN "documentos_electronicos"."tipo_dte" IS 'Tipo de DTE (CAT-002): 01 factura, 03 CCF, 05 nota de crédito, 06 nota de débito.';
COMMENT ON COLUMN "documentos_electronicos"."documento_id" IS 'Venta que documenta una factura o un CCF.';
COMMENT ON COLUMN "documentos_electronicos"."nota_id" IS 'Nota comercial que documenta una nota de crédito o débito electrónica.';
COMMENT ON COLUMN "documentos_electronicos"."relacionado_id" IS 'DTE que corrige una nota de crédito o débito (el CCF original).';
COMMENT ON COLUMN "documentos_electronicos"."codigo_generacion" IS 'Código de generación (UUID) que identifica al DTE ante Hacienda.';
COMMENT ON COLUMN "documentos_electronicos"."numero_control" IS 'Número de control DTE-tipo-establecimiento y punto de venta-correlativo.';
COMMENT ON COLUMN "documentos_electronicos"."fecha_emision" IS 'Fecha de emisión (fecEmi).';
COMMENT ON COLUMN "documentos_electronicos"."hora_emision" IS 'Hora de emisión (horEmi) en El Salvador.';
COMMENT ON COLUMN "documentos_electronicos"."receptor_nombre" IS 'Nombre del cliente; nulo en una factura a consumidor final.';
COMMENT ON COLUMN "documentos_electronicos"."total" IS 'Total a pagar del DTE (o monto total de la operación en una nota).';
COMMENT ON COLUMN "documentos_electronicos"."iva" IS 'IVA del documento.';
COMMENT ON COLUMN "documentos_electronicos"."documento" IS 'JSON del DTE validado contra el esquema de Hacienda.';
COMMENT ON COLUMN "documentos_electronicos"."firma" IS 'Firma electrónica JWS (RS512) del JSON con el certificado de la empresa.';
COMMENT ON COLUMN "documentos_electronicos"."certificado_id" IS 'Certificado de la empresa con que se firmó.';
COMMENT ON COLUMN "documentos_electronicos"."sello_recepcion" IS 'Sello de recepción simulado (40 caracteres) que en producción asigna Hacienda.';
COMMENT ON COLUMN "documentos_electronicos"."recibido_en" IS 'Fecha y hora de procesamiento simulado de la recepción.';
COMMENT ON COLUMN "documentos_electronicos"."estado" IS 'procesado (vigente) o invalidado.';
COMMENT ON COLUMN "documentos_electronicos"."tipo_invalidacion" IS 'Tipo de invalidación (CAT-024): 1 error en la información, 2 rescindir la operación, 3 otro.';
COMMENT ON COLUMN "documentos_electronicos"."motivo_invalidacion" IS 'Motivo que dio quien invalidó el DTE.';
COMMENT ON COLUMN "documentos_electronicos"."evento_invalidacion" IS 'JSON del evento de invalidación validado contra el esquema de Hacienda.';
COMMENT ON COLUMN "documentos_electronicos"."firma_invalidacion" IS 'Firma JWS del evento de invalidación.';
COMMENT ON COLUMN "documentos_electronicos"."sello_invalidacion" IS 'Sello de recepción simulado del evento de invalidación.';
COMMENT ON COLUMN "documentos_electronicos"."invalidado_en" IS 'Fecha y hora de la invalidación.';
COMMENT ON COLUMN "documentos_electronicos"."invalidado_por" IS 'Usuario que invalidó el DTE.';
COMMENT ON COLUMN "documentos_electronicos"."creado_por" IS 'Usuario que emitió el DTE.';
COMMENT ON COLUMN "documentos_electronicos"."creado_en" IS 'Fecha y hora de registro.';

-- Reglas de documentos_electronicos: el documento comercial o la nota es de la misma empresa, de una venta y del
-- tipo que corresponde; una nota corrige un CCF electrónico vigente de la empresa. Ya emitido, el DTE solo puede
-- invalidarse (una vez) y nunca se borra.
CREATE FUNCTION interno.documentos_electronicos_validar() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  d record;
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un DTE emitido no se borra: se invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'invalidado' THEN
      RAISE EXCEPTION 'El DTE ya está invalidado' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.estado <> 'invalidado'
       OR (to_jsonb(NEW) - ARRAY['estado', 'tipo_invalidacion', 'motivo_invalidacion', 'evento_invalidacion',
                                 'firma_invalidacion', 'sello_invalidacion', 'invalidado_en', 'invalidado_por'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['estado', 'tipo_invalidacion', 'motivo_invalidacion', 'evento_invalidacion',
                                 'firma_invalidacion', 'sello_invalidacion', 'invalidado_en', 'invalidado_por']) THEN
      RAISE EXCEPTION 'Un DTE emitido no se modifica: solo se invalida' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa del DTE' USING ERRCODE = 'foreign_key_violation';
  END IF;
  PERFORM 1 FROM certificados_firma WHERE id = NEW.certificado_id AND empresa_id = NEW.empresa_id AND usuario_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El DTE se firma con el certificado de su empresa' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.documento_id IS NOT NULL THEN
    SELECT empresa_id, sucursal_id, operacion::text AS operacion, tipo_documento::text AS tipo
      INTO d FROM documentos_comerciales WHERE id = NEW.documento_id;
    IF d.empresa_id IS DISTINCT FROM NEW.empresa_id OR d.sucursal_id IS DISTINCT FROM NEW.sucursal_id THEN
      RAISE EXCEPTION 'La venta no pertenece a la empresa y sucursal del DTE' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF d.operacion <> 'venta' OR d.tipo <> (CASE NEW.tipo_dte WHEN '01' THEN 'factura' ELSE 'ccf' END) THEN
      RAISE EXCEPTION 'Una factura electrónica documenta una venta con factura y un CCF electrónico una venta con CCF'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT empresa_id, sucursal_id, operacion::text AS operacion, tipo::text AS tipo, documento_id
      INTO d FROM notas_comerciales WHERE id = NEW.nota_id;
    IF d.empresa_id IS DISTINCT FROM NEW.empresa_id OR d.sucursal_id IS DISTINCT FROM NEW.sucursal_id THEN
      RAISE EXCEPTION 'La nota no pertenece a la empresa y sucursal del DTE' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF d.operacion <> 'venta' OR d.tipo <> (CASE NEW.tipo_dte WHEN '05' THEN 'credito' ELSE 'debito' END) THEN
      RAISE EXCEPTION 'Una nota electrónica documenta una nota de una venta del mismo tipo' USING ERRCODE = 'check_violation';
    END IF;
    SELECT empresa_id, tipo_dte, estado, documento_id INTO r FROM documentos_electronicos WHERE id = NEW.relacionado_id;
    IF r.empresa_id IS DISTINCT FROM NEW.empresa_id OR r.tipo_dte <> '03' OR r.documento_id IS DISTINCT FROM d.documento_id THEN
      RAISE EXCEPTION 'La nota electrónica debe referenciar el CCF electrónico del documento que corrige'
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.estado <> 'procesado' THEN
      RAISE EXCEPTION 'El CCF que corrige la nota está invalidado' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION interno.documentos_electronicos_validar() IS 'Trigger de documentos_electronicos: origen de la misma empresa y del tipo que corresponde, nota sobre un CCF electrónico vigente, solo se invalida y nunca se borra.';

CREATE TRIGGER documentos_electronicos_validar BEFORE INSERT OR UPDATE OR DELETE ON "documentos_electronicos"
  FOR EACH ROW EXECUTE FUNCTION interno.documentos_electronicos_validar();

CREATE TRIGGER documentos_electronicos_bitacora AFTER INSERT OR UPDATE OR DELETE ON "documentos_electronicos"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- ───────────── Seguridad en Supabase ─────────────

ALTER TABLE "autoridad_certificadora" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificados_firma" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dte_correlativos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documentos_electronicos" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "autoridad_certificadora", "certificados_firma", "dte_correlativos", "documentos_electronicos"
      FROM anon, authenticated;
  END IF;
END $$;
