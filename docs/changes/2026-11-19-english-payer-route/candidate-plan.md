# Plan candidato: ruta del pagador y archivos públicos en inglés

Archivos que cambian:
- `git mv` de `public/caja.html`→`cashier.html`, `public/pagar.html`→`pay.html`, `public/maqueta.html`→`mockup.html`; `.vercelignore` apunta a `public/mockup.html`.
- `vercel.json`: `/`→`/cashier.html`; `/pay/:token`→`/pay.html`; `/pagar/:token`→`/pay.html` (alias heredado).
- `src/server.js`: `/` sirve `cashier.html`; `/^\/(pay|pagar)\/[\w-]+$/` sirve `pay.html`.
- `public/cashier.html`: ejemplo (`/pay/…`) y enlace generado (`/pay/`+token).
- `test/server.test.js` (y los que citan `caja.html`): ambas rutas, mapa de rewrites, headers del pagador, maqueta 404; el enlace emitido (`cashier.html` arma `/pay/`+token y no contiene `/pagar/` en su ejemplo ni en el `href`); `.vercelignore` excluye exactamente `public/mockup.html`.
- `test/language.test.js` (nuevo): ni `vercel.json`, `src/`, `public/`, `scripts/` ni `.vercelignore` citan `caja.html`, `pagar.html` o `maqueta.html`; `/pagar/` solo aparece como alias (rewrite, regex del servidor); los cuatro docs de reglas no conservan la excepción de idioma. Se permiten los textos visibles («Vas a pagar», «maqueta»).
- `scripts/secrets-sweep.sh`: rutas `/pay/x` y `/pagar/x`; prueba que lo exige.
- `CLAUDE.md`, `AGENTS.md`, `REVIEW.md`, `docs/agentes.md`: se retira la excepción de idioma y queda la nota del alias; `.claude/STATE.md`: decisión (b) resuelta, retiro del alias como decisión futura.
- No se tocan: `docs/changes/` históricos, textos visibles, Supabase, Vercel.

Verificación: `node --test` (con `sh scripts/pg-test.sh` antes) y `sh scripts/secrets-sweep.sh`. No pasa por la compuerta a producción: no se despliega.

## Hitos
- [ ] H1 Archivos renombrados y servidos: `/` y `/pay/:token` y `/pagar/:token` dan 200 con la misma página; `mockup.html` da 404 · valida: `node --test test/server.test.js`
- [ ] H2 Caja emite `/pay/…` (prueba del `href` y del texto del enlace); headers de seguridad probados en ambas rutas del pagador sin PIN · valida: `node --test test/server.test.js` (falla si se restaura el prefijo `/pagar/` en la caja)
- [ ] H3 `vercel.json` y `.vercelignore` reflejan los nombres; el mapa de rewrites tiene `/pay/:token` y el alias, y `.vercelignore` excluye `public/mockup.html` · valida: `node --test test/server.test.js` (falla si se restaura la exclusión antigua)
- [ ] H4 El barrido consulta `/pay/x` y `/pagar/x` · valida: `node --test test/secrets-sweep.test.js`
- [ ] H5 Docs y código sin referencias técnicas en español salvo el alias; sin la excepción de idioma en los cuatro docs · valida: `node --test test/language.test.js` (falla al reintroducir una excepción o un nombre viejo)
