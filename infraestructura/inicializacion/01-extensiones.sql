-- Extensiones necesarias para el modelo de datos.
-- btree_gist habilita la restricción EXCLUDE que impide que un profesional
-- tenga dos bloques solapados (ver plan, sección "Modelo de datos principal").
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
