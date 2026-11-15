# Estado — ya-cayo

> Se sobrescribe cada sesión. Última actualización: 2026-11-14 (cierre de sesión larga; seguir en sesión nueva tras `/clear`).

## Siguiente acción (en este orden; el plan manda: `docs/changes/2026-11-14-ya-cayo-primer-corte/plan.md`, primera casilla vacía)
1. **H4, resto:** `checklist-e2e.md` ya escrito (ejecutarlo con el pago real, tras H0/H1); `public/caja.html` y `public/pagar.html` revisadas en vista de celular (390 px) con un pey simulado: esperando → pagado → entregado, sin desborde. Falta verlas con un QR real de pey y en tablet. Formato real de `qrImage` de pey NO VERIFICADO (se asume PNG base64).
2. **H6 en curso:** barrido listo (`sh scripts/barrido-secretos.sh <URL>`; repetir antes de publicar y tras cada cambio). Descripción e instrucciones (versiones del formulario con PIN y nombre en `docs/entrega/*.local.md`, ignorados) casi listas; el titular es el de la CLABE de prueba de los organizadores: su nombre va solo en `*.local.md` y en la demo, no en el repo; al dar de alta la cuenta propia, cambiar `TITULAR` y los textos. Faltan: apellido y correo del integrante, URL del repo, qué casos se probaron con pago real (depende de H1), video (≤ 3 min, QR vencido preparado y rotulado), repo público `diegoralt/ya-cayo` (solo `main`) y formulario a las 12:00. Rotar el PIN de demo tras el evento.
3. **H0 hecho:** Diego verificó `curl https://pey.drkingsia.com/health` → `{"ok":true,"app":"ya-cayo"}` (el 14-nov).
4. **H1 (bloqueado):** nadie con CoDi para pagar $0.01. H3 y el e2e de H4 quedan abiertos hasta H1.
Entrega: dom 15-nov 1:00 PM CDMX; congelar alcance 10:30; formulario 12:00.

## Estado del trabajo
Maqueta confirmada por Diego (se mejora solo si hace falta). H4 implementado en local (rutas, PIN, tope, máx. 3 vivos, `pagada_en`, `/pagar/:token`, métricas; `node --test` 26/26), commiteado. Preguntar a Diego antes de cada commit.
Hay una sonda desechable fuera del repo en el scratchpad de la sesión anterior (`receptor.py`, `crear-qr.sh`, `consultar-qr.sh`); el scratchpad cambia con la sesión, si hace falta se recrean.

## Decisiones tomadas hoy (no reabrir)
- Sin descuento automático: la app **recomienda** al vendedor un bono por usar CoDi, financiado con la comisión de tarjeta evitada; el vendedor decide. «Tarjeta o efectivo» solo registra para medir aceptación.
- Guía «¿Aún no tienes CoDi?»: **imágenes genéricas generadas con Codex** (sin logos ni marcas de bancos, rotuladas como ilustración genérica; pasos del banco reales NO VERIFICADOS por banco). Video, si llega, en el 2.º corte; sin enlaces inventados.
- Pagador: página con estado en vivo (cada 2 s), sin notificaciones push/SMS/correo; el aviso lo da el banco (CoDi notifica a ambos).
- Mobile-first (tablet/celular), no apps nativas. Captura manual de concepto y monto en el 1.er corte; catálogo y agente #1 después.
- Hosting: túnel Cloudflare con subdominio propio desde el Mac de Diego; migrar a host fijo (H7) tras el envío. Presupuesto: Claude ≤ 6M, Codex ≤ 5% semanal.

## Decisiones abiertas
- Quién paga el QR de prueba (H1); «polling solo» solo con aprobación escrita de Diego.
- ¿La cuenta permite `stripe` (respaldo con tarjeta)? Portal → Perfil → Finanzas.
- Normativa/contrato de adquirente sobre bonos por método de pago: NO VERIFICADO.
- Agente #1 (H5; decide dom 9:00); `docs/agentes.md`/`contrato-agentes: v1`; `integración: push`; titular real a declarar; qué análisis de `docs/` se publica.
