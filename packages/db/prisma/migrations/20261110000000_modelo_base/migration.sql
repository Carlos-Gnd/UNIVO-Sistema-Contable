-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "tipo_contribuyente" AS ENUM ('persona_natural', 'sociedad');

-- CreateEnum
CREATE TYPE "clasificacion_contribuyente" AS ENUM ('grande', 'mediano', 'otro');

-- CreateEnum
CREATE TYPE "modo_numeracion" AS ENUM ('mensual', 'anual', 'por_tipo');

-- CreateEnum
CREATE TYPE "naturaleza" AS ENUM ('deudora', 'acreedora');

-- CreateEnum
CREATE TYPE "tipo_cuenta" AS ENUM ('activo', 'pasivo', 'patrimonio', 'costos_gastos', 'ingresos', 'liquidadora', 'orden');

-- CreateEnum
CREATE TYPE "estado_periodo" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "tipo_partida" AS ENUM ('apertura', 'operacion', 'ajuste', 'cierre', 'reapertura', 'reversion');

-- CreateEnum
CREATE TYPE "estado_partida" AS ENUM ('borrador', 'contabilizada', 'anulada');

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(200) NOT NULL,
    "nombre_comercial" VARCHAR(200),
    "nit" VARCHAR(17) NOT NULL,
    "nrc" VARCHAR(10),
    "tipo_contribuyente" "tipo_contribuyente" NOT NULL,
    "clasificacion" "clasificacion_contribuyente" NOT NULL DEFAULT 'otro',
    "actividad_economica" VARCHAR(200),
    "direccion" VARCHAR(300),
    "telefono" VARCHAR(20),
    "correo" VARCHAR(150),
    "logo_url" TEXT,
    "modo_numeracion" "modo_numeracion" NOT NULL DEFAULT 'anual',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "codigo_establecimiento" VARCHAR(4) NOT NULL,
    "codigo_punto_venta" VARCHAR(4) NOT NULL DEFAULT '0001',
    "direccion" VARCHAR(300),
    "es_matriz" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "correo" VARCHAR(150) NOT NULL,
    "idioma" VARCHAR(5) NOT NULL DEFAULT 'es',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SMALLINT NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" SMALLSERIAL NOT NULL,
    "modulo" VARCHAR(40) NOT NULL,
    "accion" VARCHAR(30) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permisos" (
    "rol_id" SMALLINT NOT NULL,
    "permiso_id" SMALLINT NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "membresias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "rol_id" SMALLINT NOT NULL,
    "todas_sucursales" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia_sucursales" (
    "membresia_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,

    CONSTRAINT "membresia_sucursales_pkey" PRIMARY KEY ("membresia_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "nivel" SMALLINT NOT NULL DEFAULT 0,
    "naturaleza" "naturaleza" NOT NULL,
    "tipo" "tipo_cuenta" NOT NULL,
    "cuenta_padre_id" UUID,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejercicios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "anio" SMALLINT NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "estado" "estado_periodo" NOT NULL DEFAULT 'abierto',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ejercicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "ejercicio_id" UUID NOT NULL,
    "mes" SMALLINT NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "estado" "estado_periodo" NOT NULL DEFAULT 'abierto',
    "cerrado_en" TIMESTAMPTZ(6),

    CONSTRAINT "periodos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "periodo_id" UUID,
    "fecha" DATE NOT NULL,
    "tipo" "tipo_partida" NOT NULL DEFAULT 'operacion',
    "estado" "estado_partida" NOT NULL DEFAULT 'borrador',
    "numero" INTEGER,
    "ambito_numeracion" VARCHAR(40),
    "concepto" TEXT,
    "documento_tipo" VARCHAR(30),
    "documento_numero" VARCHAR(60),
    "origen" VARCHAR(30) NOT NULL DEFAULT 'manual',
    "origen_id" UUID,
    "partida_revertida_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creado_por" UUID,
    "contabilizado_por" UUID,
    "contabilizado_en" TIMESTAMPTZ(6),
    "anulado_por" UUID,
    "anulado_en" TIMESTAMPTZ(6),
    "motivo_anulacion" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partida_detalles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "partida_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "concepto" TEXT,
    "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "orden" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "partida_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlativos" (
    "empresa_id" UUID NOT NULL,
    "ambito" VARCHAR(40) NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "correlativos_pkey" PRIMARY KEY ("empresa_id","ambito")
);

-- CreateTable
CREATE TABLE "bitacora" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" UUID,
    "usuario_id" UUID,
    "tabla" VARCHAR(60) NOT NULL,
    "registro_id" VARCHAR(60),
    "accion" VARCHAR(30) NOT NULL,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_nit_key" ON "empresas"("nit");

-- CreateIndex
CREATE INDEX "sucursales_empresa_id_idx" ON "sucursales"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_empresa_id_codigo_establecimiento_codigo_punto_v_key" ON "sucursales"("empresa_id", "codigo_establecimiento", "codigo_punto_venta");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_modulo_accion_key" ON "permisos"("modulo", "accion");

-- CreateIndex
CREATE INDEX "membresias_empresa_id_idx" ON "membresias"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_usuario_id_empresa_id_key" ON "membresias"("usuario_id", "empresa_id");

-- CreateIndex
CREATE INDEX "cuentas_cuenta_padre_id_idx" ON "cuentas"("cuenta_padre_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_empresa_id_codigo_key" ON "cuentas"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ejercicios_empresa_id_anio_key" ON "ejercicios"("empresa_id", "anio");

-- CreateIndex
CREATE INDEX "periodos_empresa_id_fecha_inicio_idx" ON "periodos"("empresa_id", "fecha_inicio");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_ejercicio_id_mes_key" ON "periodos"("ejercicio_id", "mes");

-- CreateIndex
CREATE INDEX "partidas_empresa_id_fecha_idx" ON "partidas"("empresa_id", "fecha");

-- CreateIndex
CREATE INDEX "partidas_empresa_id_estado_idx" ON "partidas"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "partidas_periodo_id_idx" ON "partidas"("periodo_id");

-- CreateIndex
CREATE UNIQUE INDEX "partidas_empresa_id_ambito_numeracion_numero_key" ON "partidas"("empresa_id", "ambito_numeracion", "numero");

-- CreateIndex
CREATE INDEX "partida_detalles_partida_id_idx" ON "partida_detalles"("partida_id");

-- CreateIndex
CREATE INDEX "partida_detalles_cuenta_id_idx" ON "partida_detalles"("cuenta_id");

-- CreateIndex
CREATE INDEX "partida_detalles_empresa_id_idx" ON "partida_detalles"("empresa_id");

-- CreateIndex
CREATE INDEX "bitacora_empresa_id_creado_en_idx" ON "bitacora"("empresa_id", "creado_en");

-- CreateIndex
CREATE INDEX "bitacora_tabla_registro_id_idx" ON "bitacora"("tabla", "registro_id");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_sucursales" ADD CONSTRAINT "membresia_sucursales_membresia_id_fkey" FOREIGN KEY ("membresia_id") REFERENCES "membresias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_sucursales" ADD CONSTRAINT "membresia_sucursales_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_cuenta_padre_id_fkey" FOREIGN KEY ("cuenta_padre_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejercicios" ADD CONSTRAINT "ejercicios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "ejercicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_partida_revertida_id_fkey" FOREIGN KEY ("partida_revertida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida_detalles" ADD CONSTRAINT "partida_detalles_partida_id_fkey" FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida_detalles" ADD CONSTRAINT "partida_detalles_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida_detalles" ADD CONSTRAINT "partida_detalles_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlativos" ADD CONSTRAINT "correlativos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

