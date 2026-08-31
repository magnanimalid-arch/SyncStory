// SyncStory — 100% en el navegador, sin backend.
// Transcripción: transformers.js (Whisper) vía WASM/WebGPU.
// Video: Canvas + MediaRecorder (WebCodecs no está aún disponible en Chrome Android
// para muxing de audio+video con la fiabilidad necesaria, así que usamos MediaRecorder,
// que sí es soportado ampliamente).

import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

// Los modelos se descargan una sola vez desde el CDN de Hugging Face y quedan
// cacheados en el navegador (Cache Storage) para usos futuros sin conexión.
env.allowLocalModels = false;

const el = {
  audioInput: document.getElementById("audioInput"),
  imagesInput: document.getElementById("imagesInput"),
  formatSelect: document.getElementById("formatSelect"),
  audioName: document.getElementById("audioName"),
  imagesName: document.getElementById("imagesName"),
  imgCount: document.getElementById("imgCount"),
  langSelect: document.getElementById("langSelect"),
  modelSelect: document.getElementById("modelSelect"),
  runBtn: document.getElementById("runBtn"),
  cardInputs: document.getElementById("card-inputs"),
  cardProgress: document.getElementById("card-progress"),
  cardResult: document.getElementById("card-result"),
  cardError: document.getElementById("card-error"),
  errorText: document.getElementById("errorText"),
  errorRetryBtn: document.getElementById("errorRetryBtn"),
  progressBar: document.getElementById("progressBar"),
  statusLine: document.getElementById("statusLine"),
  statusSub: document.getElementById("statusSub"),
  previewVideo: document.getElementById("previewVideo"),
  previewBtn: document.getElementById("previewBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  resetBtn: document.getElementById("resetBtn"),
  canvas: document.getElementById("workCanvas"),
};

const ctx2d = el.canvas.getContext("2d", { alpha: false });

let audioFile = null;
let imageFiles = []; // ordenados
let outputBlobUrl = null;

// ---------- 1. Selección de archivos ----------

el.audioInput.addEventListener("change", () => {
  audioFile = el.audioInput.files[0] || null;
  el.audioName.textContent = audioFile ? audioFile.name : "MP3, WAV o M4A";
  updateRunButton();
});

el.imagesInput.addEventListener("change", () => {
  const files = Array.from(el.imagesInput.files || []);
  // Orden natural por nombre: 001.png, 002.png, ... 10.png > 2.png resuelto correctamente.
  imageFiles = files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
  el.imagesName.textContent = imageFiles.length
    ? `${imageFiles.length} imágenes — de "${imageFiles[0].name}" a "${imageFiles[imageFiles.length - 1].name}"`
    : "JPG, JPEG o PNG — varias a la vez";
  el.imgCount.textContent = imageFiles.length;
  updateRunButton();
});

function updateRunButton() {
  el.runBtn.disabled = !(audioFile && imageFiles.length > 0);
}

el.resetBtn.addEventListener("click", () => location.reload());
el.errorRetryBtn.addEventListener("click", () => {
  show(el.cardInputs);
  hide(el.cardError);
});

function show(node) { node.hidden = false; }
function hide(node) { node.hidden = true; }

function setStatus(pct, line, sub = "") {
  el.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  el.statusLine.textContent = line;
  el.statusSub.textContent = sub;
}

function fail(message) {
  console.error(message);
  hide(el.cardProgress);
  show(el.cardError);
  el.errorText.textContent = message;
}

// ---------- 2. Flujo principal ----------

el.runBtn.addEventListener("click", async () => {
  hide(el.cardInputs);
  hide(el.cardError);
  show(el.cardProgress);
  setStatus(2, "Preparando…", "Leyendo archivos");

  try {
    let wakeLock = null;
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch { /* opcional: si falla, seguimos igual */ }

    // 2.1 Decodificar audio para transcripción (mono, 16kHz — lo que espera Whisper)
    setStatus(5, "Preparando…", "Decodificando audio");
    const { audioBuffer, monoData16k, objectUrl: audioUrl } = await decodeAudioForModel(audioFile);
    const duration = audioBuffer.duration;

    // 2.2 Cargar imágenes en memoria como HTMLImageElement, en orden
    setStatus(10, "Preparando…", `Cargando ${imageFiles.length} imágenes`);
    const images = await loadImagesInOrder(imageFiles);

    // 2.3 Transcribir con Whisper (local, WASM/WebGPU)
    const lang = el.langSelect.value;
    const modelId = el.modelSelect.value;
    setStatus(15, "Transcribiendo…", "Descargando modelo (una sola vez)");
    const transcriber = await pipeline("automatic-speech-recognition", modelId, {
      progress_callback: (p) => {
        if (p.status === "progress" && typeof p.progress === "number") {
          setStatus(15 + p.progress * 0.15, "Transcribiendo…", `Descargando modelo: ${Math.round(p.progress)}%`);
        }
      },
    });

    setStatus(32, "Transcribiendo…", "Analizando el audio, puede tardar unos minutos");
    const result = await transcriber(monoData16k, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      language: lang === "auto" ? null : lang,
      task: "transcribe",
    });

    let segments = (result.chunks || [])
      .map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? duration, text: c.text }))
      .filter((s) => s.end > s.start);

    if (segments.length === 0) {
      // Sin fragmentos detectables (audio muy corto o silencioso): un único segmento.
      segments = [{ start: 0, end: duration, text: "" }];
    }
    segments = normalizeSegments(segments, duration);

    setStatus(60, "Calculando sincronización…", `${segments.length} fragmentos hablados detectados`);
    const timeline = buildTimeline(segments, images.length, duration);

    // 2.4 Generar el video
    setStatus(65, "Generando video…", "0%");
    const blob = await renderVideo({
      images,
      timeline,
      audioUrl,
      duration,
      onProgress: (frac) => setStatus(65 + frac * 35, "Generando video…", `${Math.round(frac * 100)}%`),
    });

    outputBlobUrl = URL.createObjectURL(blob);
    el.previewVideo.src = outputBlobUrl;
    el.downloadBtn.href = outputBlobUrl;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    el.downloadBtn.download = `syncstory-${stamp}.webm`;

    setStatus(100, "Finalizado", `Video de ${formatTime(duration)} listo`);
    show(el.cardResult);
    hide(el.cardProgress);

    if (wakeLock) wakeLock.release().catch(() => {});
  } catch (err) {
    fail(explainError(err));
  }
});

el.previewBtn.addEventListener("click", () => {
  el.previewVideo.scrollIntoView({ behavior: "smooth", block: "center" });
  el.previewVideo.play().catch(() => {});
});

function explainError(err) {
  const msg = String(err && err.message ? err.message : err);
  if (/out of memory|allocation/i.test(msg)) {
    return "El dispositivo se quedó sin memoria. Prueba con menos imágenes, un audio más corto, o el modelo 'Rápida (tiny)'.";
  }
  if (/MediaRecorder|mimeType|not supported/i.test(msg)) {
    return "Este navegador no admite grabación de video (MediaRecorder). Usa Chrome actualizado en Android.";
  }
  if (/decodeAudioData|EncodingError/i.test(msg)) {
    return "No se pudo leer el archivo de audio. Prueba con MP3 o WAV.";
  }
  return `Ocurrió un problema: ${msg}`;
}

// ---------- 3. Audio: decodificación y resampleo a 16kHz mono ----------

async function decodeAudioForModel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const tmpCtx = new AudioCtx();
  const audioBuffer = await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
  await tmpCtx.close();

  // Mezclar a mono
  let mono;
  if (audioBuffer.numberOfChannels === 1) {
    mono = audioBuffer.getChannelData(0);
  } else {
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    mono = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) / 2;
  }

  const monoData16k = resampleLinear(mono, audioBuffer.sampleRate, 16000);
  const objectUrl = URL.createObjectURL(file);
  return { audioBuffer, monoData16k, objectUrl };
}

function resampleLinear(data, fromRate, toRate) {
  if (fromRate === toRate) return data;
  const ratio = fromRate / toRate;
  const newLength = Math.round(data.length / ratio);
  const out = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, data.length - 1);
    const frac = srcPos - i0;
    out[i] = data[i0] * (1 - frac) + data[i1] * frac;
  }
  return out;
}

// ---------- 4. Imágenes ----------

function loadImagesInOrder(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`No se pudo cargar la imagen ${file.name}`));
          img.src = URL.createObjectURL(file);
        })
    )
  );
}

// ---------- 5. Sincronización: mapear imágenes a fragmentos hablados ----------
// Reglas: nunca reordenar imágenes; cubrir todo el audio sin cortes; el orden
// numérico de las imágenes se respeta siempre.

function normalizeSegments(segments, duration) {
  // Asegura cobertura continua de 0 a duration, sin huecos ni solapes.
  segments = segments.slice().sort((a, b) => a.start - b.start);
  segments[0].start = 0;
  for (let i = 1; i < segments.length; i++) {
    segments[i].start = segments[i - 1].end;
  }
  segments[segments.length - 1].end = duration;
  return segments.filter((s) => s.end - s.start > 0.001);
}

function buildTimeline(segments, nImages, duration) {
  const nSeg = segments.length;

  if (nImages >= nSeg) {
    // Hay imágenes suficientes (o de sobra) para dar al menos una por fragmento.
    // Repartimos las imágenes extra entre los fragmentos más largos (método del
    // resto mayor), y dentro de cada fragmento se subdividen en partes iguales.
    const counts = distributeExtra(segments, nImages);
    const timeline = [];
    let imgIdx = 0;
    for (let i = 0; i < nSeg; i++) {
      const seg = segments[i];
      const n = counts[i];
      const step = (seg.end - seg.start) / n;
      for (let k = 0; k < n; k++) {
        timeline.push({
          imageIndex: imgIdx++,
          start: seg.start + step * k,
          end: k === n - 1 ? seg.end : seg.start + step * (k + 1),
        });
      }
    }
    return timeline;
  }

  // Menos imágenes que fragmentos: agrupamos fragmentos consecutivos en
  // nImages "cubetas" de duración lo más equilibrada posible, preservando el orden.
  const groups = partitionSegmentsIntoGroups(segments, nImages);
  return groups.map((g, i) => ({
    imageIndex: i,
    start: g[0].start,
    end: g[g.length - 1].end,
  }));
}

function distributeExtra(segments, nImages) {
  const nSeg = segments.length;
  const durations = segments.map((s) => s.end - s.start);
  const total = durations.reduce((a, b) => a + b, 0);
  // Cada fragmento recibe al menos 1 imagen; el resto (nImages - nSeg) se
  // reparte proporcionalmente a la duración (método del resto mayor / Hamilton).
  const extra = nImages - nSeg;
  const raw = durations.map((d) => (extra * d) / total);
  const base = raw.map(Math.floor);
  let assigned = base.reduce((a, b) => a + b, 0);
  const remainders = raw.map((r, i) => ({ i, frac: r - base[i] })).sort((a, b) => b.frac - a.frac);
  let r = 0;
  while (assigned < extra) {
    base[remainders[r % remainders.length].i]++;
    assigned++;
    r++;
  }
  return base.map((b) => b + 1); // +1: mínimo una imagen por fragmento
}

function partitionSegmentsIntoGroups(segments, nGroups) {
  const durations = segments.map((s) => s.end - s.start);
  const total = durations.reduce((a, b) => a + b, 0);
  const target = total / nGroups;

  const groups = [];
  let current = [];
  let currentDur = 0;
  let groupsLeft = nGroups;

  for (let i = 0; i < segments.length; i++) {
    const remainingSegments = segments.length - i;
    current.push(segments[i]);
    currentDur += durations[i];

    const mustCloseNow = remainingSegments === groupsLeft; // hay que dejar al menos 1 fragmento por grupo restante
    const enoughDuration = currentDur >= target && groups.length < nGroups - 1;

    if (groupsLeft > 1 && (enoughDuration || mustCloseNow)) {
      groups.push(current);
      current = [];
      currentDur = 0;
      groupsLeft--;
    }
  }
  if (current.length) groups.push(current);
  // Por seguridad: si por redondeo sobran/faltan grupos, fusiona el remanente en el último.
  while (groups.length > nGroups) {
    const last = groups.pop();
    groups[groups.length - 1] = groups[groups.length - 1].concat(last);
  }
  return groups;
}

// ---------- 6. Render del video: Canvas (modo cover) + MediaRecorder ----------

function drawCover(image, canvas) {
  const cw = canvas.width, ch = canvas.height;
  const iw = image.naturalWidth, ih = image.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale, dh = ih * scale;
  const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0, 0, cw, ch);
  ctx2d.drawImage(image, dx, dy, dw, dh);
}

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  throw new Error("MediaRecorder no soportado en este navegador");
}

function renderVideo({ images, timeline, audioUrl, duration, onProgress }) {
  return new Promise((resolve, reject) => {
    // 1. Configurar las dimensiones reales del canvas antes de grabar
    const format = el.formatSelect ? el.formatSelect.value : "16:9";
    if (format === "9:16" || format === "vertical") {
      el.canvas.width = 1080;
      el.canvas.height = 1920;
    } else {
      el.canvas.width = 1920;
      el.canvas.height = 1080;
    }
    const audioEl = new Audio();
    audioEl.src = audioUrl;
    audioEl.preload = "auto";
    audioEl.crossOrigin = "anonymous";

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const sourceNode = audioCtx.createMediaElementSource(audioEl);
    const destNode = audioCtx.createMediaStreamDestination();
    // Solo enviamos el audio al stream que se graba (no a los altavoces),
    // para no reproducir sonido de fondo mientras se genera el video.
    sourceNode.connect(destNode);

    const canvasStream = el.canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destNode.stream.getAudioTracks(),
    ]);

    let mimeType;
    try {
      mimeType = pickMimeType();
    } catch (e) {
      reject(e);
      return;
    }

    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    let rafId = null;
    let finished = false;

    function cleanupAndResolve() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      audioCtx.close().catch(() => {});
      resolve(new Blob(chunks, { type: "video/webm" }));
    }

    recorder.onstop = cleanupAndResolve;
    recorder.onerror = (e) => { finished = true; cancelAnimationFrame(rafId); reject(e.error || new Error("Fallo en MediaRecorder")); };

    function findImageIndexAt(t) {
      for (const entry of timeline) {
        if (t >= entry.start && t < entry.end) return entry.imageIndex;
      }
      return timeline[timeline.length - 1].imageIndex;
    }

    function frameLoop() {
      if (finished) return;
      const t = audioEl.currentTime;
      const idx = findImageIndexAt(t);
      drawCover(images[Math.min(idx, images.length - 1)], el.canvas);
      onProgress(Math.min(1, t / duration));

      if (t >= duration - 0.05 || audioEl.ended) {
        // Aseguramos que el último frame se mantenga exactamente hasta el final del audio.
        if (recorder.state === "recording") recorder.stop();
        return;
      }
      rafId = requestAnimationFrame(frameLoop);
    }

    audioEl.onended = () => { if (recorder.state === "recording") recorder.stop(); };
    audioEl.onerror = () => reject(new Error("No se pudo reproducir el audio para generar el video"));

    audioEl.oncanplaythrough = () => {
      // Primer frame dibujado antes de iniciar grabación, para no perder el inicio.
      drawCover(images[0], el.canvas);
      recorder.start(250);
      audioEl.currentTime = 0;
      audioEl.play().then(() => {
        rafId = requestAnimationFrame(frameLoop);
      }).catch(reject);
    };
  });
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- 7. PWA: registrar service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
