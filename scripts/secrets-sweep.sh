#!/bin/sh
# Barrido de secretos antes de publicar. Sale ≠0 ante hallazgo O ante error de lectura/ejecución.
# Nunca imprime valores: solo qué clave o patrón y dónde. Uso: sh scripts/secrets-sweep.sh [URL_PUBLICA]
# Escanea: árbol (versionado + sin versionar no ignorado), `git log -p --all`, public/, docs/ (evidencias),
# y, si se pasa la URL, las respuestas de éxito y de error de la app pública.
# ponytail: un valor de .env muy corto (p. ej. un PIN de 4 dígitos) puede dar falsos positivos; revisar el archivo señalado.
set -u
cd "$(dirname "$0")/.." || { echo "ERROR: no pude entrar al repo"; exit 2; }
FINDINGS=0
ERRORS=0
TMP=$(mktemp -d) || { echo "ERROR: mktemp"; exit 2; }
trap 'rm -rf "$TMP"' EXIT

finding() { echo "HALLAZGO: $1"; FINDINGS=$((FINDINGS + 1)); }
error() { echo "ERROR: $1"; ERRORS=$((ERRORS + 1)); }

PATTERN='whsec_[A-Za-z0-9+/=]{8,}|Bearer [A-Za-z0-9._~+/=-]{16,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|TunnelSecret|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|token|passw(or)?d)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9+/_=-]{12,}["'"'"']|^\+?[A-Z_]*(KEY|SECRET|TOKEN|PIN)[A-Z_]*=[^[:space:]]{6,}'
# Claves de .env cuyo VALOR es sensible (las DATABASE_URL* llevan la contraseña de Postgres; PORT, DB_PATH, HOLDER_NAME, CARD_FEE_RATE no lo son).
SECRET_KEYS='KEY|SECRET|TOKEN|PIN|PASS|CREDENTIAL|DATABASE_URL'

# 1) Lista de archivos: versionados + sin versionar que no estén ignorados.
git ls-files -co --exclude-standard > "$TMP/files" 2>/dev/null || error "git ls-files falló"
[ -s "$TMP/files" ] || error "no hay archivos que escanear"
# 2) Historial completo (no imprime el contenido).
git log -p --all > "$TMP/history" 2>/dev/null || error "git log -p falló"

# 3) Valores reales de .env (no se imprimen).
[ -r .env ] || error ".env ilegible o ausente: no puedo comparar los valores reales"
if [ -r .env ]; then
  grep -v '^[[:space:]]*#' .env | grep '=' > "$TMP/env" 2>/dev/null
  while IFS= read -r line; do
    key=${line%%=*}
    value=${line#*=}
    value=$(printf '%s' "$value" | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
    printf '%s' "$key" | grep -qE "$SECRET_KEYS" || continue
    [ ${#value} -ge 4 ] || continue
    # Una URL de conexión también se busca por su sola contraseña (user:pass@host).
    pw=$(printf '%s' "$value" | sed -n 's|^[A-Za-z]*://[^:/@]*:\([^@]*\)@.*|\1|p')
    for value in "$value" "$pw"; do
    [ ${#value} -ge 4 ] || continue
    # DEMO_PIN es público por decisión de Diego (2026-11-15): se permite solo en README.md e instrucciones.md y en el historial.
    # Cualquier otra clave, y el PIN en cualquier otro archivo o en las respuestas de la URL pública, sigue siendo hallazgo.
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      [ "$key" = DEMO_PIN ] && case "$f" in README.md|docs/entrega/instrucciones.md) continue ;; esac
      grep -qF -e "$value" "$f" 2>/dev/null && finding "valor de $key aparece en $f"
    done < "$TMP/files"
    [ "$key" = DEMO_PIN ] || { grep -qF -e "$value" "$TMP/history" && finding "valor de $key aparece en el historial de git"; }
    done
  done < "$TMP/env"
fi

# 4) Patrones de key/secreto/token en el árbol y en el historial.
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in package-lock.json|scripts/secrets-sweep.sh) continue ;; esac
  grep -IqE "$PATTERN" "$f" 2>/dev/null && finding "patrón de secreto en $f"
done < "$TMP/files"
# En el historial solo se cuentan líneas añadidas, sin la propia regla del barrido (con su nombre actual y el anterior, que sigue en el historial).
grep -E '^\+' "$TMP/history" | grep -vE 'PATTERN=|SECRET_KEYS=|secrets-sweep|PATRON=|CLAVES_SECRETAS=|barrido-secretos' | grep -qE "$PATTERN" && finding "patrón de secreto en el historial de git"

# 5) Archivos que no deben estar versionados.
for p in .env 'ya-cayo.sqlite*' '*.pem' 'cert.pem' '*credentials*.json'; do
  git ls-files "$p" | grep -q . && finding "archivo sensible versionado: $p"
done

# 6) Respuestas de la URL pública (éxito y error), si se pasó.
if [ "${1:-}" != "" ]; then
  URL=${1%/}
  for route in / /health /pagar/x /api/payment/x /api/orders /api/metrics /webhook /.env /package.json /ya-cayo.sqlite /nada; do
    code=$(curl -sS -m 15 -o "$TMP/resp" -w '%{http_code}' "$URL$route" 2>/dev/null) || { error "no pude consultar $URL$route"; continue; }
    grep -IqE "$PATTERN" "$TMP/resp" 2>/dev/null && finding "patrón de secreto en la respuesta de $route ($code)"
    while IFS= read -r line; do
      key=${line%%=*}; value=${line#*=}
      value=$(printf '%s' "$value" | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
      printf '%s' "$key" | grep -qE "$SECRET_KEYS" || continue
      [ ${#value} -ge 6 ] || continue
      grep -qF -e "$value" "$TMP/resp" && finding "valor de $key en la respuesta de $route ($code)"
    done < "$TMP/env"
    case "$route:$code" in /.env:200|/package.json:200|/ya-cayo.sqlite:200) finding "$route se sirve públicamente ($code)" ;; esac
  done
fi

if [ "$ERRORS" -gt 0 ]; then echo "FALLO: $ERRORS error(es) de lectura/ejecución, $FINDINGS hallazgo(s)"; exit 2; fi
if [ "$FINDINGS" -gt 0 ]; then echo "FALLO: $FINDINGS hallazgo(s). Detener publicación, sanear y rotar key y secreto."; exit 1; fi
echo "OK: sin hallazgos (árbol, historial${1:+, URL pública})"
