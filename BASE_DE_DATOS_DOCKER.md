# HealthPass · Base de datos con Docker (PostgreSQL)

Guía para **copiar y pegar**, desde crear el contenedor hasta tener toda la base lista
(tablas, triggers, procedimientos y funciones).

> **Importante:** Docker es solo para trabajar en tu computador. Cuando publiques el proyecto en Railway,
> la base de datos vive en un **PostgreSQL de Railway que está encendido 24/7** y no necesitas tener Docker
> prendido. La aplicación crea las tablas sola al arrancar (usa el mismo `database/init.sql`).

---

## PASO 1 · Crear el contenedor

Requisito: tener **Docker Desktop** instalado y abierto. Pega esto en una terminal (PowerShell, CMD o Bash), todo en una sola línea:

```bash
docker run -d --name healthpass-db -e POSTGRES_USER=healthpass -e POSTGRES_PASSWORD=healthpass_dev -e POSTGRES_DB=healthpass -p 5432:5432 -v healthpass_data:/var/lib/postgresql/data --restart unless-stopped postgres:16-alpine
```

- `-v healthpass_data:...` guarda los datos en un volumen: **no se pierden** aunque apagues o borres el contenedor.
- Si el puerto 5432 está ocupado (ya tienes PostgreSQL instalado), cambia `-p 5432:5432` por `-p 5433:5432`.

## PASO 2 · Comprobar que está encendido

```bash
docker ps
```

Debes ver `healthpass-db` con estado `Up`.

## PASO 3 · Entrar a la consola SQL

```bash
docker exec -it healthpass-db psql -U healthpass -d healthpass
```

Aparece el prompt `healthpass=#`. Desde aquí pega **cada bloque SQL de abajo, en orden** (puedes pegar bloques grandes de una sola vez).

> **Atajo:** si prefieres no pegar bloque por bloque, sal con `\q` y ejecuta el archivo completo.
> En Bash/CMD: `docker exec -i healthpass-db psql -U healthpass -d healthpass < database/init.sql`
> En PowerShell: `Get-Content database/init.sql -Raw | docker exec -i healthpass-db psql -U healthpass -d healthpass`

---

## PASO 3 (continuación) · Activar la extensión pgcrypto

Sirve para generar los tokens de los enlaces compartidos y cifrar la contraseña del usuario demo.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## PASO 4 · Crear las tablas

Usuarios, perfil médico, listas (alergias/medicamentos/etc.), contactos, privacidad, enlaces compartidos y auditoría.

```sql
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
```

---

## PASO 5 · Funciones de los triggers

Lógica que se ejecuta automáticamente (límites, contacto principal, auditoría...). Aún no están activas: se activan en el paso 6.

```sql
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

-- 2.6 Garantiza un único contacto principal; el primero que se crea es el principal
CREATE OR REPLACE FUNCTION fn_gestionar_principal() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT'
       AND NOT EXISTS (SELECT 1 FROM contactos_emergencia WHERE usuario_id = NEW.usuario_id) THEN
        NEW.es_principal := TRUE;
    END IF;
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

-- 2.7 Si se borra el contacto principal, el contacto más antiguo pasa a ser el principal
CREATE OR REPLACE FUNCTION fn_promover_principal() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.es_principal THEN
        UPDATE contactos_emergencia
           SET es_principal = TRUE
         WHERE id = (SELECT id FROM contactos_emergencia
                      WHERE usuario_id = OLD.usuario_id
                      ORDER BY creado_en, id LIMIT 1);
    END IF;
    RETURN NULL;
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
```

---

## PASO 6 · Crear los triggers

Conectan las funciones del paso anterior con las tablas.

```sql
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

DROP TRIGGER IF EXISTS trg_contactos_promover ON contactos_emergencia;
CREATE TRIGGER trg_contactos_promover AFTER DELETE ON contactos_emergencia
    FOR EACH ROW EXECUTE FUNCTION fn_promover_principal();

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
```

---

## PASO 7 · Vista

Une usuarios con su perfil médico en una sola consulta.

```sql
CREATE OR REPLACE VIEW v_perfil_completo AS
SELECT u.id AS usuario_id, u.nombre_completo, u.email, u.username,
       p.fecha_nacimiento, p.info_basica, p.tipo_sangre,
       p.aseguradora, p.tipo_afiliacion, p.numero_afiliacion
  FROM usuarios u
  JOIN perfiles_medicos p ON p.usuario_id = u.id;
```

---

## PASO 8 · Procedimientos almacenados

Se invocan con `CALL`.

```sql
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
```

---

## PASO 9 · Funciones de negocio

Enlaces compartidos, vista de emergencia (respeta la privacidad) y resumen del dashboard.

```sql
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
        'n_contactos',    (SELECT COUNT(*) FROM contactos_emergencia WHERE usuario_id = u.id))
      FROM usuarios u
      JOIN perfiles_medicos pm ON pm.usuario_id = u.id
     WHERE u.id = p_usuario;
$$;
```

---

## PASO 10 · (Opcional) Usuario de demostración

Crea a **Carlos Herrera** con datos de ejemplo. Usuario: `carlosherrera` · Contraseña: `Demo1234!`

```sql
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
```

---

## PASO 11 · Verificar que todo quedó bien

```sql
-- Tablas creadas (deben ser 7)
\dt

-- Triggers creados (15 triggers; salen 22 filas porque algunos se activan con varios eventos)
SELECT event_object_table AS tabla, trigger_name, event_manipulation AS evento
FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY 1, 2;

-- Procedimientos y funciones
SELECT routine_name, routine_type FROM information_schema.routines
WHERE routine_schema = 'public' AND (routine_name LIKE 'sp\_%' OR routine_name LIKE 'fn\_%') ORDER BY 2, 1;

-- Probar la vista de emergencia del usuario demo
SELECT jsonb_pretty(fn_vista_emergencia(id)) FROM usuarios WHERE username = 'carlosherrera';

-- Probar el resumen del dashboard
SELECT fn_resumen_dashboard(id) FROM usuarios WHERE username = 'carlosherrera';
```

Salir de la consola: `\q`

---

## Probar los triggers (ejemplos)

```sql
-- Cambiar el contacto principal: el trigger deja solo UNO como principal
UPDATE contactos_emergencia SET es_principal = TRUE WHERE nombre = 'Roberto Herrera';
SELECT nombre, es_principal FROM contactos_emergencia;

-- Fecha de nacimiento futura: el trigger la rechaza
UPDATE perfiles_medicos SET fecha_nacimiento = '2999-01-01' WHERE usuario_id = 1;

-- Auditoría: quién cambió qué y cuándo (sin guardar datos médicos)
SELECT usuario_id, tabla, operacion, registro_id, fecha FROM auditoria ORDER BY id DESC LIMIT 10;

-- Generar y revocar un enlace compartido
SELECT * FROM fn_generar_enlace(1, 24);
SELECT fn_revocar_enlace(1);
```

---

## Conectar la aplicación a esta base

Con el contenedor encendido, en la carpeta `backend/`:

```bash
cp ../.env.example .env        # (en Windows: copy ..\.env.example .env)
npm install
npm start
```

Abre http://localhost:3000. El `DATABASE_URL` del `.env.example` ya apunta a este contenedor:
`postgresql://healthpass:healthpass_dev@localhost:5432/healthpass`

Alternativa **todo en Docker** (base + aplicación) desde la raíz del proyecto:

```bash
docker compose up -d --build
```

---

## Comandos útiles de Docker

| Qué quieres hacer | Comando |
|---|---|
| Apagar la base | `docker stop healthpass-db` |
| Encenderla otra vez | `docker start healthpass-db` |
| Ver los registros (logs) | `docker logs healthpass-db` |
| Copia de seguridad | `docker exec healthpass-db pg_dump -U healthpass healthpass > respaldo.sql` |
| Restaurar copia | `docker exec -i healthpass-db psql -U healthpass -d healthpass < respaldo.sql` |
| **Borrar todo y empezar de cero** | `docker rm -f healthpass-db` y luego `docker volume rm healthpass_data` |

---

## ¿Y en producción (Railway)?

No usas este contenedor. En Railway agregas un servicio **PostgreSQL** al proyecto y la aplicación se conecta
con la variable `DATABASE_URL`. Al arrancar, la aplicación ejecuta `database/init.sql` automáticamente
(es idempotente: no borra datos), así que **no tienes que pegar nada a mano**. Mira el `README.md` para el paso a paso.
