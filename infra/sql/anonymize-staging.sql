-- Anonimiza una copia de producción para poder usarla en staging.
--
-- Se corre SIEMPRE sobre la base de staging, nunca sobre la de producción. El
-- script empieza abortando si detecta que lo están corriendo donde no va.
--
-- Qué hace, en orden de importancia:
--  1. Borra las credenciales de terceros. Fueron cifradas con las claves de
--     producción, así que en staging no se pueden ni descifrar — pero además
--     no queremos que un ambiente de prueba tenga con qué cobrar o facturar
--     de verdad si alguien copia esas claves por error.
--  2. Reemplaza los datos de contacto de los compradores por valores falsos
--     con dominio .invalid, que por norma no existe: aunque algo mande un
--     email, no puede llegarle a una persona.
--  3. Vacía sesiones y tokens: nadie sigue logueado en staging con una sesión
--     de producción.
--
-- Los usuarios del panel conservan su email y sus tiendas (son del propio equipo)
-- pero pierden la contraseña y las sesiones (paso 3): quien entra a staging usa
-- "Olvidé mi contraseña" (ver docs/despliegue.md). El catálogo no se toca: sin
-- catálogo real, staging no sirve para probar lo que importa.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF current_setting('tiendafy.allow_anonymize', true) IS DISTINCT FROM 'yes' THEN
        RAISE EXCEPTION
            'Falta la confirmación explícita. Correr con: psql -v ON_ERROR_STOP=1 -c "SET tiendafy.allow_anonymize = ''yes''" -f anonymize-staging.sql';
    END IF;
END $$;

BEGIN;

-- 1) Credenciales e integraciones: fuera.
DELETE FROM mp_connections;
DELETE FROM payway_connections;
DELETE FROM meli_connections;
DELETE FROM meta_ads_connections;
DELETE FROM social_accounts;
DELETE FROM whatsapp_connections;
DELETE FROM fiscal_certificates;
DELETE FROM fiscal_access_tokens;
DELETE FROM correo_argentino_configs;
DELETE FROM andreani_configs;
DELETE FROM zipnova_configs;

-- 2) Datos de contacto de compradores.
UPDATE customers SET
    name = 'Cliente de prueba',
    email = 'cliente-' || left(md5(id::text), 8) || '@example.invalid',
    phone = NULL,
    address = NULL,
    notes = NULL,
    -- Nadie tiene que poder entrar a staging con una contraseña de producción.
    password_hash = NULL,
    google_subject = NULL
WHERE email IS NOT NULL OR phone IS NOT NULL;

UPDATE orders SET
    buyer_name = 'Comprador de prueba',
    buyer_email = 'comprador-' || left(md5(id::text), 8) || '@example.invalid',
    buyer_phone = NULL,
    shipping_address = 'Dirección de prueba 123';

UPDATE checkout_sessions SET
    buyer_name = 'Comprador',
    buyer_last_name = 'De prueba',
    email = 'checkout-' || left(md5(id::text), 8) || '@example.invalid',
    phone = NULL,
    shipping_address = 'Dirección de prueba 123';

UPDATE contact_messages SET
    name = 'Consulta de prueba',
    email = 'contacto-' || left(md5(id::text), 8) || '@example.invalid',
    body = '[contenido reemplazado al anonimizar]';

UPDATE support_conversations SET
    customer_email = 'soporte-' || left(md5(id::text), 8) || '@example.invalid'
WHERE customer_email IS NOT NULL;

UPDATE newsletter_subscribers SET
    email = 'suscriptor-' || left(md5(id::text), 8) || '@example.invalid';

UPDATE campaign_recipients SET
    email = 'destinatario-' || left(md5(id::text), 8) || '@example.invalid';

-- Lista de rebotes: son emails reales que no aportan nada en staging.
DELETE FROM email_suppressions;

-- 3) Sesiones y tokens de compradores.
DELETE FROM customer_sessions;
DELETE FROM customer_tokens;

-- 3b) Usuarios del panel: una copia de producción no puede dejar entrar a staging
--    con las contraseñas de producción. Sin hash no hay contraseña que valga;
--    cambiar el security_stamp invalida las cookies de sesión que ya existan
--    (la API las revalida contra él) y los logins externos (Google) y tokens
--    de recuperación viejos se borran.
UPDATE users SET
    password_hash = NULL,
    security_stamp = gen_random_uuid()::text,
    concurrency_stamp = gen_random_uuid()::text,
    two_factor_enabled = false,
    access_failed_count = 0,
    lockout_end = NULL;
DELETE FROM user_logins;
DELETE FROM user_tokens;

-- 4) Colas y webhooks pendientes: si quedan, staging intenta procesar trabajo
--    de producción (facturar, avisar, despachar) contra servicios de prueba.
DELETE FROM payment_webhook_events;
DELETE FROM fiscal_emission_jobs;
DELETE FROM meli_notifications;
DELETE FROM notification_events;

COMMIT;

\echo 'Listo: la copia quedó anonimizada.'
