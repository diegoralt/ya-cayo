# Plan: despliegue a Production en dos pasos

- **Intent:** [intent.md](intent.md)
- **Aprobado:** 2026-11-24 por Diego, en chat (opción D, tras comparar con desconectar Git, rama `production` e Ignored Build Step)
- **Revisado por:** Codex, solo en el PR #16 (hallazgo P2 que pidió esta carpeta). El intent y el plan no tuvieron revisión previa propia.
- **Presupuesto:** no medido

Cambios:
- Vercel (fuera de git): `autoAssignCustomDomains` de `true` a `false` por API. Hecho el 24-nov.
- `CLAUDE.md`, `docs/agentes.md`, `.claude/STATE.md`: flujo nuevo y pendientes. Este PR.
- No se toca código, Supabase, variables de entorno ni `vercel.json`.

Reversión: mismo PATCH con `autoAssignCustomDomains=true` (cada merge vuelve a publicar solo). Para volver a un deploy anterior: `vercel rollback`.

## Hitos
- [x] H1 Ajuste en `false` · valida: `vercel api /v9/projects/<id>` muestra `autoAssignCustomDomains: false`
- [x] H2 Deploy de Production por CLI queda en espera, `promote` y `rollback` mueven ambos dominios con `/health` en 200 (24-nov)
- [x] H3 Ruta por merge: el merge de este PR genera un deploy de Production que no sirve los dominios · valida: `vercel inspect pey.drkingsia.com` sigue en el deploy anterior
- [ ] H4 `DATABASE_URL` de Preview apuntando a una base distinta de la de Producción (siguiente PR)
