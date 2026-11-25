-- Antigüedad de saldos (HU-63, S3-T73): saldo por cobrar o por pagar de un documento a una fecha de corte.
-- Solo cuenta lo contabilizado (nunca los borradores) y con fecha hasta el corte, igual que el mayor, para que el
-- reporte por tramos cuadre con el saldo de la cuenta de cuentas por cobrar o por pagar. Lo anulado no cuenta: la
-- partida anulada y su reversión se compensan en el mayor.

CREATE FUNCTION interno.saldo_documento_al(p_documento uuid, p_fecha date) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN d.condicion_pago = 'credito' AND d.fecha <= p_fecha THEN
      d.total_neto
      + coalesce((SELECT sum(n.total_neto) FROM notas_comerciales n JOIN partidas p ON p.id = n.partida_id
                  WHERE n.documento_id = d.id AND n.tipo = 'debito' AND p.estado = 'contabilizada'
                    AND n.fecha <= p_fecha), 0)
      - coalesce((SELECT sum(n.total_neto) FROM notas_comerciales n JOIN partidas p ON p.id = n.partida_id
                  WHERE n.documento_id = d.id AND n.tipo = 'credito' AND p.estado = 'contabilizada'
                    AND n.fecha <= p_fecha), 0)
      - coalesce((SELECT sum(x.monto) FROM abonos_documentos x JOIN abonos a ON a.id = x.abono_id
                  JOIN partidas p ON p.id = a.partida_id
                  WHERE x.documento_id = d.id AND p.estado = 'contabilizada' AND a.fecha <= p_fecha), 0)
    ELSE 0 END
  FROM documentos_comerciales d WHERE d.id = p_documento
$$;

COMMENT ON FUNCTION interno.saldo_documento_al(uuid, date) IS 'Saldo por cobrar o por pagar de un documento al crédito a una fecha de corte: total neto más notas de débito menos notas de crédito y abonos contabilizados con fecha hasta el corte; cero si el documento es al contado o posterior al corte.';
