-- Datos de las firmas de los estados financieros (HU-39, S3-T16).
-- Los estados exportados llevan espacios de firma para el propietario o representante legal y para el contador;
-- sus nombres y el registro del contador se guardan en la empresa para no escribirlos en cada exportación.

ALTER TABLE "empresas"
  ADD COLUMN "representante_legal" VARCHAR(150),
  ADD COLUMN "contador_nombre" VARCHAR(150),
  ADD COLUMN "contador_registro" VARCHAR(30);

COMMENT ON COLUMN "empresas"."representante_legal" IS 'Nombre del propietario o representante legal que firma los estados financieros.';
COMMENT ON COLUMN "empresas"."contador_nombre" IS 'Nombre del contador que firma los estados financieros.';
COMMENT ON COLUMN "empresas"."contador_registro" IS 'Número de inscripción del contador en el Consejo de Vigilancia (CVPCPA), si lo tiene.';
