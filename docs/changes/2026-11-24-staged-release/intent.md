# Despliegue a Production en dos pasos (construir y promover)

- **Pidió:** Diego · 2026-11-24 · chat
- **Por qué es mediano:** despliegue a producción (cada merge a `main` publicaba solo)

## Lo que se pidió
Pendiente de `STATE.md`: «Recuperar el despliegue controlado a Production: hoy cada merge a `main` despliega solo (Vercel conectado a GitHub)».

> Antes de avanzar, revisa si es la recomendación y buenas prácticas utilizadas actualmente para verificar que es la mejor opción con la cuál avanzar

> Verifiquemos si con mi cuenta actual es viable avanzar con la opción D

> Avanza con la verificación desde tu lado

> Si, para tener el nuevo flujo establecido dentro del proyecto

(Opción D: Git conectado, deploy de Production en espera y publicación con `vercel promote`.)

## Qué cuenta como terminado
- `autoAssignCustomDomains` está en `false` en el proyecto de Vercel: un merge a `main` construye pero no sirve en `pey.drkingsia.com` ni en `ya-cayo-sandy.vercel.app`.
- Publicar es `vercel promote <url>` y revertir es `vercel rollback <deployment>`; ambos con aprobación de Diego.
- El flujo y su reversión están en `CLAUDE.md` y `docs/agentes.md`; `STATE.md` deja lo pendiente.
- Verificado con la CLI (deploy en espera, promote y rollback, `/health` en 200). **Pendiente:** confirmar la ruta por merge a `main` con el primer merge real (este PR).
