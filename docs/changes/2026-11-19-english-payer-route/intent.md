# Ruta del pagador y archivos públicos en inglés

- **Pidió:** Diego · 2026-11-19 · chat
- **Por qué es mediano:** producción (la ruta del enlace de pago que reciben los pagadores)

## Lo que se pidió
> Sobre el punto b, si tenemos que homologar el idioma de las rutas porque ya tenemos algunas en inglés, migremos las que falten a ese idioma para homologar

Contexto (de `STATE.md`, decisión pendiente): rutas en español `/pagar/:token`, `public/pagar.html`, `public/maqueta.html`; cambiarlas rompe enlaces de pago ya emitidos.

## Qué cuenta como terminado
- La URL pública del pagador es `/pay/:token` y la caja emite enlaces con esa ruta.
- Un enlace ya emitido `/pagar/:token` sigue mostrando la misma página (no rompe enlaces emitidos).
- `public/caja.html`, `public/pagar.html` y `public/maqueta.html` pasan a `cashier.html`, `pay.html` y `mockup.html`; `/` sigue abriendo la caja y `.vercelignore`, `vercel.json` y `src/server.js` lo reflejan. La maqueta sigue sin servirse (ni en Vercel ni en local).
- `scripts/secrets-sweep.sh` consulta `/pay/x` además de `/pagar/x`.
- La ruta nueva y el alias responden lo mismo, sin PIN y con los mismos headers de seguridad.
- Ninguna otra ruta o archivo público queda en español, y la excepción de idioma desaparece de `CLAUDE.md`, `AGENTS.md`, `REVIEW.md` y `docs/agentes.md` (queda solo la nota del alias heredado).
- `node --test` en verde, con prueba de ambas rutas y del `vercel.json`.
- No se despliega nada: Production se redespliega aparte, cuando Diego lo pida.

## Modelo de amenaza
- Repo propio, sin adversario. P1 = un enlace de pago emitido deja de abrir, o la ruta nueva se sirve sin el mismo control que la vieja (headers, sin PIN), o una página que no debe ser pública (`maqueta`) queda servida.
- Lo demás (estilo, docs históricos) es P2.

## Fuera de alcance
- Textos visibles a la persona usuaria (siguen en español).
- Docs históricos en `docs/changes/` (no se reescriben).
- Redesplegar Production y tocar Vercel o Supabase.
- Retirar el alias `/pagar/:token` (decisión futura).
