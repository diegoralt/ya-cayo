# Uso del cambio

Inicio: 2026-11-15T20:16:24.000Z

Atribución: Codex tokens = solo input_tokens de sesiones con cwd en esta carpeta, incremento desde el inicio (cota inferior si se implementó desde la raíz); Codex pp = cuenta entera, indicativo (nominal + 1 pp por segmento), sin acotar descensos ni segmentos incompletos y sin freno; Claude = registros con cwd dentro del repo (incluye subagentes y worktrees), n/m si otro cambio tuvo archivos modificados (mtime: no detecta lectura ni sesiones sin archivos, cambia con checkout/pull) o hay registros sin cwd. n/m = no medible; nunca se lee como 0.

| fecha | fase | ventana | Claude M acum | Claude M fase | Codex tok M acum | Codex pp nominal | Codex pp indicativo | Codex pp indicativo fase | sesiones | nota |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-15T20:31 | 1 | 2026-11-15T20:16→20:31 | n/m | n/m | 1.64 | 1.0 | 2.0 | 2.0 | fce71d10,84c1e473,875abf8a | otro cambio activo: 2026-11-15-agente-v2 |
| 2026-11-15T20:31 | 2 | 2026-11-15T20:16→20:31 | n/m | n/m | 1.64 | 1.0 | 2.0 | 0.0 | fce71d10,84c1e473,875abf8a | otro cambio activo: 2026-11-15-agente-v2 |
