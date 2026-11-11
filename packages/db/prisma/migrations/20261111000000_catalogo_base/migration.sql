-- Catálogo empresarial precargado (HU-16, tareas S1-T65 y S1-T66).
-- Fuente: "Catálogo de cuentas" de la cátedra Aplicación de Técnicas Contables (Lic. René Adalberto Gómez),
-- estructurado para una S.A. de C.V., con estos ajustes:
--   • Agregadas: 4104 Costo de Ventas, rubro 52 Otros Ingresos (5201, 5202) y, para persona natural, 3108 Retiros del Titular.
--   • Erratas corregidas: 120203 repetido (Mobiliario y Equipo pasa a 120204), 210102 dentro de 2102 (pasa a 210202)
--     y 210402 repetido como Pagarés (pasa a Letras de Cambio).
--   • Variante persona natural: sin capital suscrito, reservas, dividendos, llamamientos de capital ni préstamos a accionistas.

CREATE TABLE catalogo_base (
  codigo varchar(10) PRIMARY KEY,
  nombre varchar(200) NOT NULL,
  nombre_persona_natural varchar(200),
  aplica varchar(20) NOT NULL DEFAULT 'ambos' CHECK (aplica IN ('ambos', 'sociedad', 'persona_natural')),
  naturaleza naturaleza NOT NULL,
  tipo tipo_cuenta NOT NULL
);

COMMENT ON TABLE catalogo_base IS 'Plantilla del catálogo empresarial que se copia a cada empresa nueva según su tipo de contribuyente.';
COMMENT ON COLUMN catalogo_base.codigo IS 'Código de la cuenta en la plantilla.';
COMMENT ON COLUMN catalogo_base.nombre IS 'Nombre de la cuenta (variante sociedad o común).';
COMMENT ON COLUMN catalogo_base.nombre_persona_natural IS 'Nombre alternativo para persona natural, si difiere.';
COMMENT ON COLUMN catalogo_base.aplica IS 'A qué contribuyentes aplica: ambos, sociedad o persona_natural.';
COMMENT ON COLUMN catalogo_base.naturaleza IS 'Naturaleza calculada por clase; las cuentas (R) de activo y patrimonio y sus subcuentas se invierten.';
COMMENT ON COLUMN catalogo_base.tipo IS 'Clase de la cuenta según el primer dígito del código.';

WITH datos (codigo, nombre, nombre_pn, aplica) AS (VALUES
  -- 1 ACTIVO
  ('1', 'Activo', NULL, 'ambos'),
  ('11', 'Activo Corriente', NULL, 'ambos'),
  ('1101', 'Efectivo y Equivalentes de Efectivo', NULL, 'ambos'),
  ('110101', 'Caja General', NULL, 'ambos'),
  ('110102', 'Caja Chica', NULL, 'ambos'),
  ('110103', 'Bancos', NULL, 'ambos'),
  ('11010301', 'Cuenta Corriente', NULL, 'ambos'),
  ('11010302', 'Cuenta de Ahorro', NULL, 'ambos'),
  ('11010303', 'Depósitos a Plazo', NULL, 'ambos'),
  ('1102', 'Inversiones Financieras a Corto Plazo', NULL, 'ambos'),
  ('110201', 'Depósitos a Plazo de 91 a 365 Días', NULL, 'ambos'),
  ('110202', 'Instrumentos Financieros a Corto Plazo', NULL, 'ambos'),
  ('110203', 'Otros Títulos Valores', NULL, 'ambos'),
  ('1103', 'Cuentas por Cobrar', NULL, 'ambos'),
  ('1104', '(R) Estimación para Cuentas Incobrables', NULL, 'ambos'),
  ('1105', 'Documentos por Cobrar', NULL, 'ambos'),
  ('1106', 'Llamamientos de Capital', NULL, 'sociedad'),
  ('1107', 'Préstamos a Empleados y Accionistas', 'Préstamos a Empleados', 'ambos'),
  ('1108', 'Otras Cuentas por Cobrar', NULL, 'ambos'),
  ('110801', 'Anticipos a Cuentas por Pagar Comerciales', NULL, 'ambos'),
  ('110802', 'Anticipos a Empleados', NULL, 'ambos'),
  ('110803', 'Deudores Varios', NULL, 'ambos'),
  ('1109', 'Inventarios', NULL, 'ambos'),
  ('1110', '(R) Estimación por Deterioro de los Inventarios', NULL, 'ambos'),
  ('1111', 'Gastos Pagados por Anticipado', NULL, 'ambos'),
  ('111101', 'Seguros', NULL, 'ambos'),
  ('111102', 'Alquileres', NULL, 'ambos'),
  ('111103', 'Papelería y Útiles', NULL, 'ambos'),
  ('111104', 'Pago a Cuenta', NULL, 'ambos'),
  ('111105', 'Otros Gastos Pagados por Anticipado', NULL, 'ambos'),
  ('1112', 'Crédito Fiscal IVA', NULL, 'ambos'),
  ('1113', 'IVA Pagado por Anticipado', NULL, 'ambos'),
  ('111301', 'IVA Percibido', NULL, 'ambos'),
  ('111302', 'IVA Retenido', NULL, 'ambos'),
  ('12', 'Activo No Corriente', NULL, 'ambos'),
  ('1201', 'Propiedad, Planta y Equipo', NULL, 'ambos'),
  ('120101', 'Terreno', NULL, 'ambos'),
  ('120102', 'Edificio', NULL, 'ambos'),
  ('120103', 'Instalaciones', NULL, 'ambos'),
  ('120104', 'Equipo de Reparto', NULL, 'ambos'),
  ('120105', 'Mobiliario y Equipo', NULL, 'ambos'),
  ('1202', '(R) Depreciaciones', NULL, 'ambos'),
  ('120201', 'Edificios', NULL, 'ambos'),
  ('120202', 'Instalaciones', NULL, 'ambos'),
  ('120203', 'Equipo de Reparto', NULL, 'ambos'),
  ('120204', 'Mobiliario y Equipo', NULL, 'ambos'),
  ('1203', '(R) Deterioro de Valor de Propiedad, Planta y Equipo', NULL, 'ambos'),
  ('120301', 'Terreno', NULL, 'ambos'),
  ('120302', 'Edificio', NULL, 'ambos'),
  ('120303', 'Instalaciones', NULL, 'ambos'),
  ('120304', 'Equipo de Reparto', NULL, 'ambos'),
  ('120305', 'Mobiliario y Equipo', NULL, 'ambos'),
  ('1204', 'Intangibles', NULL, 'ambos'),
  ('120401', 'Crédito Mercantil', NULL, 'ambos'),
  ('120402', 'Patentes y Marcas', NULL, 'ambos'),
  ('120403', 'Licencias', NULL, 'ambos'),
  ('1205', '(R) Amortización de Intangibles', NULL, 'ambos'),
  ('120501', 'Crédito Mercantil', NULL, 'ambos'),
  ('120502', 'Patentes y Marcas', NULL, 'ambos'),
  ('120503', 'Licencias', NULL, 'ambos'),
  ('1206', '(R) Deterioro de Valor Intangible', NULL, 'ambos'),
  ('120601', 'Crédito Mercantil', NULL, 'ambos'),
  ('120602', 'Patentes y Marcas', NULL, 'ambos'),
  ('120603', 'Licencias', NULL, 'ambos'),
  ('1207', 'Inversiones en Asociados', NULL, 'ambos'),
  ('1208', 'Activo por Impuesto sobre la Renta Diferido', NULL, 'ambos'),
  -- 2 PASIVO
  ('2', 'Pasivo', NULL, 'ambos'),
  ('21', 'Pasivo Corriente', NULL, 'ambos'),
  ('2101', 'Sobregiros Bancarios', NULL, 'ambos'),
  ('2102', 'Cuentas por Pagar Comerciales', NULL, 'ambos'),
  ('210201', 'Locales', NULL, 'ambos'),
  ('210202', 'Del Exterior', NULL, 'ambos'),
  ('2103', 'Documentos por Cobrar Descontados', NULL, 'ambos'),
  ('210301', 'Pagarés', NULL, 'ambos'),
  ('210302', 'Letras de Cambio', NULL, 'ambos'),
  ('210303', 'Bonos', NULL, 'ambos'),
  ('2104', 'Otros Títulos y Valores', NULL, 'ambos'),
  ('210401', 'Pagarés', NULL, 'ambos'),
  ('210402', 'Letras de Cambio', NULL, 'ambos'),
  ('210403', 'Bonos', NULL, 'ambos'),
  ('210404', 'Otros Títulos y Valores', NULL, 'ambos'),
  ('2105', 'Préstamos por Pagar', NULL, 'ambos'),
  ('210501', 'Bancarios', NULL, 'ambos'),
  ('210502', 'Accionistas', NULL, 'sociedad'),
  ('210503', 'Otros', NULL, 'ambos'),
  ('2106', 'Retenciones por Pagar', NULL, 'ambos'),
  ('210601', 'ISSS (Salud)', NULL, 'ambos'),
  ('210602', 'ISSS (Pensión)', NULL, 'ambos'),
  ('210603', 'AFP', NULL, 'ambos'),
  ('210604', 'Renta', NULL, 'ambos'),
  ('210605', 'IVA', NULL, 'ambos'),
  ('210606', 'Otras Retenciones', NULL, 'ambos'),
  ('2107', 'Obligaciones por Beneficios a Empleados a Corto Plazo', NULL, 'ambos'),
  ('210701', 'ISSS (Salud)', NULL, 'ambos'),
  ('210702', 'ISSS (Pensión)', NULL, 'ambos'),
  ('210703', 'AFP', NULL, 'ambos'),
  ('210704', 'INSAFORP', NULL, 'ambos'),
  ('210705', 'Vacaciones', NULL, 'ambos'),
  ('210706', 'Aguinaldo', NULL, 'ambos'),
  ('210707', 'Indemnizaciones Convenidas', NULL, 'ambos'),
  ('2108', 'Dividendos por Pagar', NULL, 'sociedad'),
  ('2109', 'IVA Débito Fiscal', NULL, 'ambos'),
  ('2110', 'IVA Percibido y Retenido por Pagar', NULL, 'ambos'),
  ('211001', 'IVA Percibido', NULL, 'ambos'),
  ('211002', 'IVA Retenido', NULL, 'ambos'),
  ('2111', 'Impuestos por Pagar', NULL, 'ambos'),
  ('211101', 'Pago a Cuenta', NULL, 'ambos'),
  ('211102', 'Renta', NULL, 'ambos'),
  ('211103', 'IVA', NULL, 'ambos'),
  ('211104', 'Otros', NULL, 'ambos'),
  ('2112', 'Cuentas por Pagar', NULL, 'ambos'),
  ('2113', 'Intereses por Pagar', NULL, 'ambos'),
  ('22', 'Pasivo No Corriente', NULL, 'ambos'),
  ('2201', 'Préstamos por Pagar', NULL, 'ambos'),
  ('2202', 'Documentos por Pagar', NULL, 'ambos'),
  ('2203', 'Ingresos Diferidos', NULL, 'ambos'),
  ('2204', 'Provisión para Obligaciones Laborales', NULL, 'ambos'),
  ('2205', 'Pasivo por Impuesto sobre la Renta Diferido', NULL, 'ambos'),
  -- 3 PATRIMONIO
  ('3', 'Patrimonio', NULL, 'ambos'),
  ('31', 'Capital Contable', NULL, 'ambos'),
  ('3101', 'Capital Social', 'Capital', 'ambos'),
  ('3102', '(R) Capital Suscrito No Pagado', NULL, 'sociedad'),
  ('3103', 'Reserva Legal', NULL, 'sociedad'),
  ('3104', 'Reservas Voluntarias', NULL, 'sociedad'),
  ('3105', 'Utilidades Retenidas', NULL, 'ambos'),
  ('3106', 'Utilidad del Ejercicio', NULL, 'ambos'),
  ('3107', '(R) Déficit', NULL, 'ambos'),
  ('310701', 'Déficit Acumulado', NULL, 'ambos'),
  ('310702', 'Déficit del Presente Ejercicio', NULL, 'ambos'),
  ('3108', 'Retiros del Titular', NULL, 'persona_natural'),
  -- 4 CUENTAS DE RESULTADO DEUDORAS
  ('4', 'Cuentas de Resultado Deudoras', NULL, 'ambos'),
  ('41', 'Costos', NULL, 'ambos'),
  ('4101', 'Compras', NULL, 'ambos'),
  ('4102', 'Gastos sobre Compras', NULL, 'ambos'),
  ('4103', '(R) Devoluciones y Rebajas sobre Ventas', NULL, 'ambos'),
  ('4104', 'Costo de Ventas', NULL, 'ambos'),
  ('42', 'Gastos', NULL, 'ambos'),
  ('4201', 'Gastos de Administración', NULL, 'ambos'),
  ('4202', 'Gastos de Venta', NULL, 'ambos'),
  ('4203', 'Costos Financieros', NULL, 'ambos'),
  ('420301', 'Intereses', NULL, 'ambos'),
  ('420302', 'Comisiones Bancarias', NULL, 'ambos'),
  ('420303', 'Otros', NULL, 'ambos'),
  ('4204', 'Gasto por Impuesto sobre la Renta Corriente', NULL, 'ambos'),
  ('4205', 'Gasto por Impuesto sobre la Renta Diferido', NULL, 'ambos'),
  ('43', 'Pérdidas', NULL, 'ambos'),
  ('4301', 'Pérdidas en Venta de Activo de Explotación', NULL, 'ambos'),
  ('4302', 'Pérdida por Deterioro de Activos', NULL, 'ambos'),
  ('430201', 'Pérdida por Deterioro de Inventarios', NULL, 'ambos'),
  ('430202', 'Pérdida por Deterioro de Intangibles', NULL, 'ambos'),
  ('430203', 'Pérdida por Deterioro de Planta y Equipo', NULL, 'ambos'),
  ('4303', 'Pérdida por Casos Fortuitos en Activos', NULL, 'ambos'),
  ('4304', 'Deterioro y Pérdidas de Instrumentos Financieros', NULL, 'ambos'),
  -- 5 CUENTAS DE RESULTADO ACREEDORAS
  ('5', 'Cuentas de Resultado Acreedoras', NULL, 'ambos'),
  ('51', 'Ingresos de Operación', NULL, 'ambos'),
  ('5101', 'Ventas', NULL, 'ambos'),
  ('5102', '(R) Devoluciones y Rebajas sobre Compras', NULL, 'ambos'),
  ('5103', 'Ingreso por Impuesto sobre la Renta Diferido', NULL, 'ambos'),
  ('52', 'Otros Ingresos', NULL, 'ambos'),
  ('5201', 'Ingresos Financieros', NULL, 'ambos'),
  ('5202', 'Ganancia en Venta de Activo de Explotación', NULL, 'ambos'),
  ('5203', 'Otras Ganancias', NULL, 'ambos'),
  ('5204', 'Reversión de Deterioro y Ganancias en Venta de Instrumentos Financieros', NULL, 'ambos'),
  -- 6 CUENTA DE CIERRE
  ('6', 'Cuenta de Cierre', NULL, 'ambos'),
  ('61', 'Cuenta Liquidadora', NULL, 'ambos'),
  ('6101', 'Pérdidas y Ganancias', NULL, 'ambos')
),
-- Cuentas complementarias (R) de activo y patrimonio: invierten la naturaleza de su clase, y sus subcuentas también
complementarias AS (
  SELECT codigo FROM datos WHERE nombre LIKE '(R)%' AND left(codigo, 1) IN ('1', '2', '3')
)
INSERT INTO catalogo_base (codigo, nombre, nombre_persona_natural, aplica, naturaleza, tipo)
SELECT d.codigo, d.nombre, d.nombre_pn, d.aplica,
  (CASE
     WHEN left(d.codigo, 1) IN ('1', '4') THEN 'deudora'
     ELSE 'acreedora'
   END)::naturaleza,
  (CASE left(d.codigo, 1)
     WHEN '1' THEN 'activo' WHEN '2' THEN 'pasivo' WHEN '3' THEN 'patrimonio'
     WHEN '4' THEN 'costos_gastos' WHEN '5' THEN 'ingresos' ELSE 'liquidadora'
   END)::tipo_cuenta
FROM datos d;

-- invertir las complementarias y sus subcuentas; Retiros del Titular es deudora dentro del patrimonio
UPDATE catalogo_base b
SET naturaleza = CASE b.naturaleza WHEN 'deudora' THEN 'acreedora'::naturaleza ELSE 'deudora'::naturaleza END
WHERE EXISTS (SELECT 1 FROM catalogo_base r
              WHERE r.nombre LIKE '(R)%' AND left(r.codigo, 1) IN ('1', '2', '3') AND b.codigo LIKE r.codigo || '%')
   OR b.codigo = '3108';

-- La plantilla, como el resto de tablas, no es visible para la API de datos de Supabase
ALTER TABLE catalogo_base ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON catalogo_base FROM anon, authenticated;
  END IF;
END $$;

-- Copia la plantilla a una empresa según su tipo de contribuyente.
-- Se inserta nivel por nivel para que el trigger de cuentas encuentre siempre la cuenta padre.
CREATE FUNCTION interno.copiar_catalogo_base(p_empresa uuid) RETURNS int
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  tipo_emp tipo_contribuyente;
  largo int;
  total int := 0;
  n int;
BEGIN
  SELECT tipo_contribuyente INTO tipo_emp FROM empresas WHERE id = p_empresa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La empresa % no existe', p_empresa;
  END IF;
  IF EXISTS (SELECT 1 FROM cuentas WHERE empresa_id = p_empresa) THEN
    RAISE EXCEPTION 'La empresa ya tiene cuentas; el catálogo base solo se copia a empresas nuevas';
  END IF;
  FOREACH largo IN ARRAY ARRAY[1, 2, 4, 6, 8, 10] LOOP
    INSERT INTO cuentas (empresa_id, codigo, nombre, naturaleza, tipo)
    SELECT p_empresa, b.codigo,
           CASE WHEN tipo_emp = 'persona_natural' THEN coalesce(b.nombre_persona_natural, b.nombre) ELSE b.nombre END,
           b.naturaleza, b.tipo
    FROM catalogo_base b
    WHERE length(b.codigo) = largo AND b.aplica IN ('ambos', tipo_emp::text)
    ORDER BY b.codigo;
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  RETURN total;
END $$;

REVOKE ALL ON FUNCTION interno.copiar_catalogo_base(uuid) FROM PUBLIC;
