#!/bin/sh
# Postgres 16 desechable para pruebas: roles tipo Supabase (anon, authenticated), rol de servidor
# ya_cayo_app (sin superusuario) y las migraciones de supabase/migrations/. Requiere Docker arrancado.
# Cada corrida recrea el contenedor y su volumen. Escribe .pg-test.env (ignorado) con las URLs locales.
# Uso: sh scripts/pg-test.sh  ·  Apagar: docker rm -f ya-cayo-pg-test
set -eu
cd "$(dirname "$0")/.."
NOMBRE=ya-cayo-pg-test
PUERTO=${PG_TEST_PORT:-54329}
PW=test-local # solo para este contenedor, ligado a 127.0.0.1

docker info >/dev/null 2>&1 || { echo "ERROR: Docker no está arrancado"; exit 1; }
docker rm -f "$NOMBRE" >/dev/null 2>&1 || true
sleep 1; docker volume rm -f "$NOMBRE-data" >/dev/null
docker run -d --rm -v "$NOMBRE-data:/var/lib/postgresql/data" --name "$NOMBRE" \
  -e POSTGRES_PASSWORD="$PW" -p "127.0.0.1:$PUERTO:5432" postgres:16 >/dev/null

# Readiness real: el contenedor reinicia una vez tras el init, así que se exige una consulta que responda.
i=0
until docker exec "$NOMBRE" psql -U postgres -tAc 'select 1' >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -le 60 ] || { echo "ERROR: Postgres no respondió en 60 s"; exit 1; }
  sleep 1
done
sleep 1
docker exec "$NOMBRE" psql -U postgres -tAc 'select 1' >/dev/null || { echo "ERROR: Postgres no estable"; exit 1; }

psql_admin() { docker exec -i "$NOMBRE" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

# Roles como en Supabase (globales). Los privilegios por defecto son por base: se fijan en cada una, para
# probar que la migración los revoca. `postgres` sirve a rls.test.js; ya_cayo_tpl es la plantilla de la que
# cada prueba crea su base propia (test/helpers/pg.js).
psql_admin <<SQL
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE ya_cayo_app LOGIN PASSWORD '$PW' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE ya_cayo_tpl;
SQL

for base in postgres ya_cayo_tpl; do
  psql_admin -d "$base" <<SQL
GRANT USAGE ON SCHEMA public TO anon, authenticated, ya_cayo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
SQL
  for f in supabase/migrations/*.sql; do
    echo "migración ($base): $f"
    psql_admin -d "$base" < "$f"
  done
done

umask 077
cat > .pg-test.env <<ENV
DATABASE_URL_TEST=postgres://ya_cayo_app:$PW@127.0.0.1:$PUERTO/postgres
DATABASE_URL_TEST_ADMIN=postgres://postgres:$PW@127.0.0.1:$PUERTO/postgres
ENV
echo "listo: Postgres de pruebas en 127.0.0.1:$PUERTO (URLs en .pg-test.env)"
