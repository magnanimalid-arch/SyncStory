# SyncStory

Convierte un audio narrado + una serie de imágenes numeradas en un video sincronizado con la transcripción, **100% en el navegador**, sin backend, sin API de pago, sin subir nada a ningún servidor.

## Qué usa por dentro (y por qué)

| Tarea | Tecnología | Motivo |
|---|---|---|
| Transcripción con timestamps | [`@xenova/transformers`](https://github.com/xenova/transformers.js) ejecutando **Whisper** (tiny/base) vía WASM/WebGPU, cargado desde CDN público de jsDelivr | Corre localmente en el dispositivo, sin API key, sin costo por minuto. Usa WebGPU si el navegador lo soporta; si no, WASM (más lento, pero funciona). |
| Sincronización imagen↔audio | Algoritmo propio en `app.js` (reparto por duración de fragmentos, no división uniforme) | Ver sección "Cómo sincroniza" abajo. |
| Generación del video | `<canvas>` + `canvas.captureStream()` + `MediaRecorder` + Web Audio API para mezclar el audio original | Es la combinación con soporte más amplio y confiable en Chrome Android hoy. `ffmpeg.wasm` se evaluó y se descartó: requiere cabeceras `COOP/COEP` y mucha RAM, y falla con frecuencia en celulares de gama media/baja. WebCodecs por sí solo no resuelve el muxing de audio+video en el navegador sin una librería adicional de contenedor. |
| Instalación como app | Web App Manifest + Service Worker (PWA) | "Añadir a pantalla de inicio" desde Chrome Android. |

## Limitaciones reales (léelas antes de usarla)

1. **La transcripción tarda.** Con el modelo *tiny* en un celular de gama media, esperá algo así como 0.3–1x la duración del audio (un audio de 3 minutos puede tardar 1–3 minutos). El modelo *base* es más preciso pero más lento y pesado.
2. **La generación del video es en "tiempo real".** No hay atajo posible sin backend: como se graba con `MediaRecorder` mientras se reproduce el audio, un audio de 5 minutos tarda ~5 minutos en convertirse en video.
3. **Mantené la pantalla encendida y la pestaña en primer plano** durante la generación. Los navegadores móviles frenan (throttle) el JavaScript en segundo plano o con la pantalla apagada, lo que puede arruinar la sincronización o detener la grabación. La app pide un "wake lock" automáticamente si el navegador lo soporta, pero no todos lo soportan.
4. **El formato de salida es `.webm` (VP9/VP8 + Opus)**, no `.mp4`. Es lo que `MediaRecorder` soporta de forma confiable en Chrome Android. **CapCut importa `.webm` sin problema**, así que cumple el objetivo de ser editable después. Si necesitás `.mp4` sí o sí, tenés que convertirlo con una app aparte (por ejemplo, el propio CapCut al exportar).
5. **Memoria del celular.** Con ~40–60 imágenes y audios de varios minutos funciona bien en un celular de gama media-alta. Con cientos de imágenes en simultáneo puede ir lento o quedarse sin memoria; si eso pasa, la app te avisa con un mensaje claro.
6. **Primera vez = descarga del modelo.** La primera transcripción descarga el modelo de Whisper (40–75 MB) desde el CDN. Usos posteriores lo reutilizan desde el caché del navegador, incluso sin conexión.

## Cómo sincroniza (sin dividir tiempo total ÷ nº de imágenes)

1. Whisper transcribe el audio y devuelve fragmentos con marca de inicio/fin.
2. Si hay **igual número de imágenes que de fragmentos** → una imagen por fragmento, en orden.
3. Si hay **menos imágenes que fragmentos** → se agrupan fragmentos consecutivos en tantos bloques como imágenes haya, balanceando la duración total de cada bloque (una imagen puede cubrir varios fragmentos).
4. Si hay **más imágenes que fragmentos** → las imágenes sobrantes se reparten entre los fragmentos más largos (método del resto mayor), y dentro de un mismo fragmento se subdividen en partes iguales de tiempo.
5. En todos los casos: **las imágenes nunca se reordenan**, no se descarta ninguna, no se corta el audio, y el video dura exactamente lo mismo que el audio.

## Cómo ejecutarla

Los navegadores no permiten `import` de módulos ES ni Service Workers desde `file://`, así que hace falta un servidor local muy simple (no es un backend de la app, solo sirve los archivos estáticos).

### Opción A — con Node.js (en tu computadora)

```bash
cd syncstory
npx serve .
```

Esto imprime una URL local, por ejemplo `http://localhost:3000`.

### Opción B — con Python (si no tenés Node)

```bash
cd syncstory
python3 -m http.server 8000
```

Abrí `http://localhost:8000` en el navegador.

### Opción C — directo desde el celular, sin computadora

1. Subí la carpeta `syncstory/` a un hosting estático gratuito (GitHub Pages, Netlify, Vercel, Cloudflare Pages). Cualquiera de estos sirve HTTPS gratis, que es requisito para Service Workers y para algunas APIs de audio.
2. Abrí la URL resultante desde Chrome en tu Android.

> No hace falta `package.json` ni ninguna dependencia para instalar: `transformers.js` se carga directamente desde CDN en `app.js` (`import ... from "https://cdn.jsdelivr.net/..."`). Si preferís no depender del CDN en cada carga, podés descargar ese archivo y servirlo vos mismo, pero no es necesario para que funcione.

## Cómo abrirla desde Android

1. Abrí **Chrome** en tu Android.
2. Andá a la URL donde publicaste la app (ver Opción C arriba), o a la URL de tu servidor local si estás en la misma red que tu computadora (por ejemplo `http://192.168.x.x:8000`, reemplazando por la IP de tu compu).
3. Usá la app normalmente: seleccionar audio, seleccionar imágenes, elegir idioma, tocar "ANALIZAR Y SINCRONIZAR".

## Cómo instalarla como app (PWA)

1. Con la app abierta en Chrome Android, tocá el menú (⋮, arriba a la derecha).
2. Elegí **"Añadir a pantalla de inicio"** o **"Instalar aplicación"** (el texto exacto varía según la versión de Chrome).
3. Confirmá. Queda un ícono en tu pantalla de inicio que abre SyncStory en modo app, sin barra de navegador.

## Estructura del proyecto

```
syncstory/
├── index.html      → interfaz
├── style.css        → estilos
├── app.js            → transcripción, sincronización y generación de video
├── manifest.json    → configuración de la PWA
├── sw.js             → service worker (cache del shell para instalación/offline)
├── icon.svg          → ícono de la app
└── README.md         → este archivo
```

Se incluye un `package.json` mínimo solo como metadata / conveniencia opcional para computadora — no es necesario en Android, y no hay build ni dependencias reales que instalar: todo se resuelve en el navegador.

## Verificaciones realizadas antes de entregar este proyecto

Se comprobó, de forma automatizada, en este entorno de construcción:

- ✅ Sintaxis válida de `app.js` y `sw.js` (`node --check`).
- ✅ `manifest.json` y `package.json` son JSON válido.
- ✅ Todas las rutas referenciadas en `index.html` (`href`/`src`) apuntan a archivos que existen en el proyecto.
- ✅ Los 22 IDs que `app.js` busca con `getElementById` existen todos en `index.html` (ninguno falta).
- ✅ Los archivos listados para precache en `sw.js` y el ícono referenciado en `manifest.json` existen.

## Lo que NO se pudo comprobar en este entorno (léelo con atención)

Este proyecto se construyó en un entorno de servidor sin navegador y **sin acceso a red**, así que lo siguiente no se ejecutó de punta a punta, solo se revisó por lectura de código:

- ❌ No se pudo cargar `@xenova/transformers` desde el CDN (jsDelivr) ni descargar un modelo Whisper real, porque este entorno no tiene salida a internet.
- ❌ No se ejecutó una transcripción real con audio de prueba.
- ❌ No se probó `canvas.captureStream()` + `MediaRecorder` generando un `.webm` real, ni se verificó el archivo resultante en un reproductor.
- ❌ No se probó en un navegador Chrome/Android real (ni emulado): compatibilidad de APIs, memoria, rendimiento con imágenes/audio reales, ni la instalación como PWA.
- ❌ No se probó el flujo completo "subir audio + imágenes → sincronizar → previsualizar → descargar" con archivos reales.

Todas las tecnologías usadas (`transformers.js`, `MediaRecorder`, `canvas.captureStream`, Web Audio API, Service Workers) son estándar y ampliamente documentadas en Chrome para Android, y el código se escribió siguiendo su uso documentado — pero no equivale a una prueba real. Si algo no funciona como se espera en tu celular, decímelo con el mensaje de error exacto (la app muestra errores explicativos, no genéricos) y lo ajusto.
