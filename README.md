# Programa de Enfermedades Huérfanas · Indicadores y resultados en salud

Sitio estático (GitHub Pages). No contiene datos de pacientes. `robots.txt` y `noindex` impiden la indexación.

## Estructura
- `index.html`, `assets/` — sitio (rutas: `#construccion`, `#e-<id>`, `#resultados`, `#consulta`).
- `data/enfermedades.json` — enfermedades e indicadores en revisión (versión en `version`).
- `data/resultados.json` — resultados agregados (temporal: informe del 27 oct 2026).
- `assets/config.js` — URLs de los Apps Script.
- `apps-script/Revisiones.gs` — recibe las revisiones en una hoja de Google (solo agrega filas).
- `apps-script/Consulta.gs` + `Consulta.html` — consulta de solo lectura, restringida a cuentas @hptu.org.co. **No va en el sitio**: se instala en Apps Script.

## Ciclo de revisión
1. Los equipos revisan cada ficha y envían.
2. Las respuestas llegan a la hoja «Revisiones de indicadores».
3. Se consolidan, se actualiza `data/enfermedades.json` (sube `version`) y se hace commit.

## Tablero de resultados (`resultados/`)
`resultados/index.html` es el tablero 1.0 **cifrado** con StatiCrypt (AES-256, PBKDF2). Las fuentes sin cifrar
(HTML, `contenido.js`, `graficos.js`, CSV) **no** se suben a este repositorio. Para actualizarlo: unir el tablero
en un solo HTML, cifrarlo con la misma contraseña y reemplazar `resultados/index.html`.
