-- =====================================================================
-- HEALTHPASS · Datos de demostración (solo para pruebas / exposición)
-- Usuario: carlosherrera   Contraseña: Demo1234!
-- Es idempotente: si el usuario ya existe, no hace nada.
-- =====================================================================
DO $$
DECLARE
    v_id INT;
BEGIN
    SELECT id INTO v_id FROM usuarios WHERE username = 'carlosherrera';

    IF v_id IS NULL THEN
        INSERT INTO usuarios (nombre_completo, email, username, password_hash)
        VALUES ('Carlos Herrera', 'carlos.herrera@gmail.com', 'carlosherrera',
                crypt('Demo1234!', gen_salt('bf', 10)))
        RETURNING id INTO v_id;

        UPDATE perfiles_medicos
           SET fecha_nacimiento  = DATE '1985-03-14',
               info_basica       = 'Vive en Ciudad de México. Español como idioma principal.',
               tipo_sangre       = 'O+',
               aseguradora       = 'SURA',
               tipo_afiliacion   = 'EPS',
               numero_afiliacion = 'XXXX-XXXX'
         WHERE usuario_id = v_id;

        CALL sp_reemplazar_items(v_id, 'alergia',     ARRAY['Penicilina', 'Polen', 'Mariscos']);
        CALL sp_reemplazar_items(v_id, 'antecedente', ARRAY['Diabetes tipo 2', 'Hipertensión arterial']);
        CALL sp_reemplazar_items(v_id, 'medicamento', ARRAY['Metformina 500 mg (mañana y noche)', 'Losartán 50 mg (mañana)']);
        CALL sp_reemplazar_items(v_id, 'cirugia',     ARRAY['Apendicectomía (2018)', 'Artroscopia rodilla derecha (2021)']);

        INSERT INTO contactos_emergencia (usuario_id, nombre, relacion, telefono)
        VALUES (v_id, 'María González',  'Esposa',  '+52 55 1234 5678'),
               (v_id, 'Roberto Herrera', 'Hermano', '+52 55 9876 5432');
    END IF;
END;
$$;
