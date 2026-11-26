ALTER TABLE usuarios
  ADD COLUMN modo_didactico BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN usuarios.modo_didactico IS 'Muestra explicaciones de las partidas automáticas en la interfaz.';
