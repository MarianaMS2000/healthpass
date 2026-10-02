-- =====================================================================
-- HEALTHPASS · Base de datos PostgreSQL
-- Script idempotente: se puede ejecutar varias veces sin dañar datos.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. TABLAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id               SERIAL PRIMARY KEY,
    nombre_completo  VARCHAR(120) NOT NULL,
    email            VARCHAR(160) NOT NULL,
    username         VARCHAR(40)  NOT NULL,
    password_hash    TEXT         NOT NULL,
    creado_en        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actualizado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_usuarios_username CHECK (username ~ '^[a-z0-9_.]{3,40}$'),
    CONSTRAINT ck_usuarios_email    CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email    ON usuarios (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_username ON usuarios (LOWER(username));

CREATE TABLE IF NOT EXISTS perfiles_medicos (
    usuario_id         INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha_nacimiento   DATE,
    info_basica        TEXT,
    tipo_sangre        VARCHAR(3) CHECK (tipo_sangre IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    aseguradora        VARCHAR(100),
    tipo_afiliacion    VARCHAR(60),
    numero_afiliacion  VARCHAR(60),
    actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una sola tabla para las 4 listas: alergias, antecedentes, medicamentos y cirugías
CREATE TABLE IF NOT EXISTS items_medicos (
    id           SERIAL PRIMARY KEY,
    usuario_id   INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    categoria    VARCHAR(20) NOT NULL CHECK (categoria IN ('alergia','antecedente','medicamento','cirugia')),
    descripcion  VARCHAR(255) NOT NULL CHECK (LENGTH(BTRIM(descripcion)) > 0),
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_items_usuario_cat ON items_medicos (usuario_id, categoria);

CREATE TABLE IF NOT EXISTS contactos_emergencia (
    id              SERIAL PRIMARY KEY,
    usuario_id      INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre          VARCHAR(120) NOT NULL CHECK (LENGTH(BTRIM(nombre)) > 0),
    relacion        VARCHAR(60)  NOT NULL CHECK (LENGTH(BTRIM(relacion)) > 0),
    telefono        VARCHAR(30)  NOT NULL CHECK (telefono ~ '^[0-9+()\s-]{7,30}$'),
    es_principal    BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_contactos_usuario ON contactos_emergencia (usuario_id);
-- Máximo un contacto principal por usuario
CREATE UNIQUE INDEX IF NOT EXISTS ux_contacto_principal ON contactos_emergencia (usuario_id) WHERE es_principal;

CREATE TABLE IF NOT EXISTS privacidad (
    usuario_id          INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    ver_sangre          BOOLEAN NOT NULL DEFAULT TRUE,
    ver_alergias        BOOLEAN NOT NULL DEFAULT TRUE,
    ver_medicamentos    BOOLEAN NOT NULL DEFAULT TRUE,
    ver_antecedentes    BOOLEAN NOT NULL DEFAULT TRUE,
    ver_cirugias        BOOLEAN NOT NULL DEFAULT TRUE,
    ver_contacto        BOOLEAN NOT NULL DEFAULT TRUE,
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enlaces_compartidos (
    id             SERIAL PRIMARY KEY,
    usuario_id     INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token          VARCHAR(64) NOT NULL UNIQUE,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_en      TIMESTAMPTZ NOT NULL,
    revocado       BOOLEAN NOT NULL DEFAULT FALSE,
    accesos        INT NOT NULL DEFAULT 0,
    ultimo_acceso  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_enlaces_usuario ON enlaces_compartidos (usuario_id);

-- Auditoría: guarda QUÉ pasó y CUÁNDO, pero NO el contenido médico (privacidad).
-- Sin FK a propósito: el historial sobrevive si se elimina el usuario.
CREATE TABLE IF NOT EXISTS auditoria (
    id           BIGSERIAL PRIMARY KEY,
    usuario_id   INT,
    tabla        VARCHAR(60) NOT NULL,
    operacion    VARCHAR(10) NOT NULL,
    registro_id  VARCHAR(40),
    fecha        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_auditoria_usuario ON auditoria (usuario_id, fecha DESC);

-- =====================================================================
-- 2. FUNCIONES DE TRIGGER
-- =====================================================================

-- 2.1 Actualiza automáticamente la columna actualizado_en
CREATE OR REPLACE FUNCTION fn_set_actualizado() RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.2 Al crear un usuario, crea su perfil médico y su configuración de privacidad
CREATE OR REPLACE FUNCTION fn_crear_defaults_usuario() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO perfiles_medicos (usuario_id) VALUES (NEW.id);
    INSERT INTO privacidad (usuario_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.3 Valida y limpia el perfil médico
CREATE OR REPLACE FUNCTION fn_validar_perfil() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.fecha_nacimiento IS NOT NULL
       AND (NEW.fecha_nacimiento > CURRENT_DATE OR NEW.fecha_nacimiento < DATE '1900-01-01') THEN
        RAISE EXCEPTION 'La fecha de nacimiento no es válida' USING ERRCODE = 'HP001';
    END IF;
    NEW.info_basica       := NULLIF(BTRIM(NEW.info_basica), '');
    NEW.aseguradora       := NULLIF(BTRIM(NEW.aseguradora), '');
    NEW.tipo_afiliacion   := NULLIF(BTRIM(NEW.tipo_afiliacion), '');
    NEW.numero_afiliacion := NULLIF(BTRIM(NEW.numero_afiliacion), '');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.4 Máximo 5 contactos de emergencia por usuario
CREATE OR REPLACE FUNCTION fn_limitar_contactos() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM contactos_emergencia WHERE usuario_id = NEW.usuario_id) >= 5 THEN
        RAISE EXCEPTION 'Solo puedes registrar hasta 5 contactos de emergencia' USING ERRCODE = 'HP001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.5 Máximo 50 elementos por categoría
CREATE OR REPLACE FUNCTION fn_limitar_items() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM items_medicos
         WHERE usuario_id = NEW.usuario_id AND categoria = NEW.categoria) >= 50 THEN
        RAISE EXCEPTION 'Máximo 50 elementos por categoría' USING ERRCODE = 'HP001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.6 Garantiza un único contacto principal. El principal lo elige la persona (no se asigna solo)
CREATE OR REPLACE FUNCTION fn_gestionar_principal() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.es_principal THEN
        UPDATE contactos_emergencia
           SET es_principal = FALSE
         WHERE usuario_id = NEW.usuario_id
           AND es_principal
           AND id IS DISTINCT FROM NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.8 Auditoría genérica (no guarda contenido médico, solo metadatos)
CREATE OR REPLACE FUNCTION fn_auditar() RETURNS TRIGGER AS $$
DECLARE
    v_row JSONB;
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    INSERT INTO auditoria (usuario_id, tabla, operacion, registro_id)
    VALUES ((v_row->>'usuario_id')::INT, TG_TABLE_NAME, TG_OP,
            COALESCE(v_row->>'id', v_row->>'usuario_id'));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 3. TRIGGERS
-- =====================================================================

DROP TRIGGER IF EXISTS trg_usuarios_actualizado ON usuarios;
CREATE TRIGGER trg_usuarios_actualizado BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado();

DROP TRIGGER IF EXISTS trg_perfiles_actualizado ON perfiles_medicos;
CREATE TRIGGER trg_perfiles_actualizado BEFORE UPDATE ON perfiles_medicos
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado();

DROP TRIGGER IF EXISTS trg_contactos_actualizado ON contactos_emergencia;
CREATE TRIGGER trg_contactos_actualizado BEFORE UPDATE ON contactos_emergencia
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado();

DROP TRIGGER IF EXISTS trg_privacidad_actualizado ON privacidad;
CREATE TRIGGER trg_privacidad_actualizado BEFORE UPDATE ON privacidad
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado();

DROP TRIGGER IF EXISTS trg_usuarios_defaults ON usuarios;
CREATE TRIGGER trg_usuarios_defaults AFTER INSERT ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_crear_defaults_usuario();

DROP TRIGGER IF EXISTS trg_perfiles_validar ON perfiles_medicos;
CREATE TRIGGER trg_perfiles_validar BEFORE INSERT OR UPDATE ON perfiles_medicos
    FOR EACH ROW EXECUTE FUNCTION fn_validar_perfil();

DROP TRIGGER IF EXISTS trg_contactos_limite ON contactos_emergencia;
CREATE TRIGGER trg_contactos_limite BEFORE INSERT ON contactos_emergencia
    FOR EACH ROW EXECUTE FUNCTION fn_limitar_contactos();

DROP TRIGGER IF EXISTS trg_items_limite ON items_medicos;
CREATE TRIGGER trg_items_limite BEFORE INSERT ON items_medicos
    FOR EACH ROW EXECUTE FUNCTION fn_limitar_items();

DROP TRIGGER IF EXISTS trg_contactos_principal ON contactos_emergencia;
CREATE TRIGGER trg_contactos_principal BEFORE INSERT OR UPDATE ON contactos_emergencia
    FOR EACH ROW EXECUTE FUNCTION fn_gestionar_principal();

-- Ya no se promueve un principal automáticamente al borrar el actual
DROP TRIGGER IF EXISTS trg_contactos_promover ON contactos_emergencia;
DROP FUNCTION IF EXISTS fn_promover_principal();

DROP TRIGGER IF EXISTS trg_audit_items ON items_medicos;
CREATE TRIGGER trg_audit_items AFTER INSERT OR UPDATE OR DELETE ON items_medicos
    FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_audit_contactos ON contactos_emergencia;
CREATE TRIGGER trg_audit_contactos AFTER INSERT OR UPDATE OR DELETE ON contactos_emergencia
    FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_audit_perfiles ON perfiles_medicos;
CREATE TRIGGER trg_audit_perfiles AFTER UPDATE ON perfiles_medicos
    FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_audit_privacidad ON privacidad;
CREATE TRIGGER trg_audit_privacidad AFTER UPDATE ON privacidad
    FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_audit_enlaces ON enlaces_compartidos;
CREATE TRIGGER trg_audit_enlaces AFTER INSERT OR UPDATE ON enlaces_compartidos
    FOR EACH ROW EXECUTE FUNCTION fn_auditar();

-- =====================================================================
-- 4. VISTA
-- =====================================================================

CREATE OR REPLACE VIEW v_perfil_completo AS
SELECT u.id AS usuario_id, u.nombre_completo, u.email, u.username,
       p.fecha_nacimiento, p.info_basica, p.tipo_sangre,
       p.aseguradora, p.tipo_afiliacion, p.numero_afiliacion
  FROM usuarios u
  JOIN perfiles_medicos p ON p.usuario_id = u.id;

-- =====================================================================
-- 5. PROCEDIMIENTOS ALMACENADOS
-- =====================================================================

-- 5.1 Reemplaza una lista completa (alergias, medicamentos, etc.) desde un arreglo de textos
CREATE OR REPLACE PROCEDURE sp_reemplazar_items(p_usuario INT, p_categoria VARCHAR, p_items TEXT[])
LANGUAGE plpgsql AS $$
BEGIN
    IF p_categoria NOT IN ('alergia','antecedente','medicamento','cirugia') THEN
        RAISE EXCEPTION 'Categoría inválida' USING ERRCODE = 'HP001';
    END IF;

    DELETE FROM items_medicos WHERE usuario_id = p_usuario AND categoria = p_categoria;

    INSERT INTO items_medicos (usuario_id, categoria, descripcion)
    SELECT p_usuario, p_categoria, LEFT(BTRIM(x.item), 255)
      FROM unnest(p_items) WITH ORDINALITY AS x(item, ord)
     WHERE BTRIM(x.item) <> ''
     ORDER BY x.ord;
END;
$$;

-- 5.2 "Eliminar mi información": borra datos médicos y contactos, conserva la cuenta
CREATE OR REPLACE PROCEDURE sp_eliminar_informacion_medica(p_usuario INT)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM items_medicos        WHERE usuario_id = p_usuario;
    DELETE FROM contactos_emergencia WHERE usuario_id = p_usuario;
    DELETE FROM enlaces_compartidos  WHERE usuario_id = p_usuario;

    UPDATE perfiles_medicos
       SET fecha_nacimiento = NULL, info_basica = NULL, tipo_sangre = NULL,
           aseguradora = NULL, tipo_afiliacion = NULL, numero_afiliacion = NULL
     WHERE usuario_id = p_usuario;

    UPDATE privacidad
       SET ver_sangre = TRUE, ver_alergias = TRUE, ver_medicamentos = TRUE,
           ver_antecedentes = TRUE, ver_cirugias = TRUE, ver_contacto = TRUE
     WHERE usuario_id = p_usuario;
END;
$$;

-- =====================================================================
-- 6. FUNCIONES DE NEGOCIO
-- =====================================================================

-- 6.1 Genera un enlace de acceso compartido (revoca los anteriores)
CREATE OR REPLACE FUNCTION fn_generar_enlace(p_usuario INT, p_horas INT DEFAULT 72)
RETURNS TABLE (out_token VARCHAR, out_expira TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
    v_token  VARCHAR;
    v_expira TIMESTAMPTZ;
BEGIN
    IF p_horas < 1 OR p_horas > 720 THEN
        RAISE EXCEPTION 'La duración debe estar entre 1 y 720 horas' USING ERRCODE = 'HP001';
    END IF;

    UPDATE enlaces_compartidos SET revocado = TRUE
     WHERE usuario_id = p_usuario AND NOT revocado;

    INSERT INTO enlaces_compartidos (usuario_id, token, expira_en)
    VALUES (p_usuario, encode(gen_random_bytes(18), 'hex'), NOW() + make_interval(hours => p_horas))
    RETURNING token, expira_en INTO v_token, v_expira;

    RETURN QUERY SELECT v_token, v_expira;
END;
$$;

-- 6.2 Revoca todos los enlaces activos del usuario; devuelve cuántos revocó
CREATE OR REPLACE FUNCTION fn_revocar_enlace(p_usuario INT) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_n INT;
BEGIN
    UPDATE enlaces_compartidos SET revocado = TRUE
     WHERE usuario_id = p_usuario AND NOT revocado;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- 6.3 Vista de emergencia respetando los interruptores de privacidad
CREATE OR REPLACE FUNCTION fn_vista_emergencia(p_usuario INT) RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_priv privacidad%ROWTYPE;
    v_res  JSONB;
BEGIN
    SELECT * INTO v_priv FROM privacidad WHERE usuario_id = p_usuario;

    SELECT jsonb_build_object(
        'nombre',           u.nombre_completo,
        'fecha_nacimiento', pm.fecha_nacimiento,
        'visibilidad', jsonb_build_object(
            'sangre',       v_priv.ver_sangre,
            'alergias',     v_priv.ver_alergias,
            'medicamentos', v_priv.ver_medicamentos,
            'antecedentes', v_priv.ver_antecedentes,
            'cirugias',     v_priv.ver_cirugias,
            'contacto',     v_priv.ver_contacto),
        'tipo_sangre', CASE WHEN v_priv.ver_sangre THEN pm.tipo_sangre END,
        'alergias', CASE WHEN v_priv.ver_alergias THEN
            (SELECT COALESCE(jsonb_agg(descripcion ORDER BY id), '[]'::jsonb)
               FROM items_medicos WHERE usuario_id = u.id AND categoria = 'alergia') END,
        'medicamentos', CASE WHEN v_priv.ver_medicamentos THEN
            (SELECT COALESCE(jsonb_agg(descripcion ORDER BY id), '[]'::jsonb)
               FROM items_medicos WHERE usuario_id = u.id AND categoria = 'medicamento') END,
        'antecedentes', CASE WHEN v_priv.ver_antecedentes THEN
            (SELECT COALESCE(jsonb_agg(descripcion ORDER BY id), '[]'::jsonb)
               FROM items_medicos WHERE usuario_id = u.id AND categoria = 'antecedente') END,
        'cirugias', CASE WHEN v_priv.ver_cirugias THEN
            (SELECT COALESCE(jsonb_agg(descripcion ORDER BY id), '[]'::jsonb)
               FROM items_medicos WHERE usuario_id = u.id AND categoria = 'cirugia') END,
        'contactos', CASE WHEN v_priv.ver_contacto THEN
            (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'nombre', nombre, 'relacion', relacion, 'telefono', telefono)
                        ORDER BY es_principal DESC, id), '[]'::jsonb)
               FROM contactos_emergencia WHERE usuario_id = u.id) END
    ) INTO v_res
    FROM usuarios u
    JOIN perfiles_medicos pm ON pm.usuario_id = u.id
    WHERE u.id = p_usuario;

    RETURN v_res;
END;
$$;

-- 6.4 Vista pública por token; devuelve NULL si el enlace no existe, venció o fue revocado
CREATE OR REPLACE FUNCTION fn_vista_emergencia_por_token(p_token TEXT) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
    v_enl enlaces_compartidos%ROWTYPE;
BEGIN
    SELECT * INTO v_enl FROM enlaces_compartidos
     WHERE token = p_token AND NOT revocado AND expira_en > NOW();

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE enlaces_compartidos
       SET accesos = accesos + 1, ultimo_acceso = NOW()
     WHERE id = v_enl.id;

    RETURN fn_vista_emergencia(v_enl.usuario_id);
END;
$$;

-- 6.5 Resumen para el dashboard
CREATE OR REPLACE FUNCTION fn_resumen_dashboard(p_usuario INT) RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'nombre',         u.nombre_completo,
        'tipo_sangre',    pm.tipo_sangre,
        'aseguradora',    pm.aseguradora,
        'n_alergias',     (SELECT COUNT(*) FROM items_medicos WHERE usuario_id = u.id AND categoria = 'alergia'),
        'n_medicamentos', (SELECT COUNT(*) FROM items_medicos WHERE usuario_id = u.id AND categoria = 'medicamento'),
        'n_contactos',    (SELECT COUNT(*) FROM contactos_emergencia WHERE usuario_id = u.id),
        'ultima_actualizacion', (SELECT to_char(MAX(fecha) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                   FROM auditoria
                                  WHERE usuario_id = u.id
                                    AND tabla IN ('items_medicos', 'contactos_emergencia', 'perfiles_medicos')))
      FROM usuarios u
      JOIN perfiles_medicos pm ON pm.usuario_id = u.id
     WHERE u.id = p_usuario;
$$;
