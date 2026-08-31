// SyncStory — Sincronización Híbrida + Licencias 30 Días + Transiciones Elegantes CapCut
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

env.allowLocalModels = false;

// ==========================================
// CONFIGURACIÓN Y SEGURIDAD DE LICENCIAS
// ==========================================
const CLAVE_SECRETA_ADMIN = "OroMusic2026";
const PIN_ADMIN = "5050";

function generarFirma(fechaStr) {
  let str = fechaStr + CLAVE_SECRETA_ADMIN;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).toUpperCase();
}

window.generarLicencia = function(dias = 30) {
  const pinIngresado = prompt("Ingresa tu PIN de Administrador:");
  if (pinIngresado !== PIN_ADMIN) {
    alert("PIN incorrecto. Acceso denegado.");
    return null;
  }

  const hoy = new Date();
  hoy.setDate(hoy.getDate() + dias);
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  
  const fechaExp = `${yyyy}${mm}${dd}`;
  const firma = generarFirma(fechaExp);
  const licencia = `SYNC-${fechaExp}-${firma}`;
  
  alert(`LICENCIA GENERADA (${dias} DÍAS):\n\n${licencia}\n\nCópiala y envíala a tu cliente por WhatsApp.`);
  return licencia;
};

async function obtenerFechaRealInternet() {
  try {
    const res = await fetch("https://worldtimeapi.org/api/ip");
    const data = await res.json();
    return new Date(data.datetime);
  } catch (e) {
    try {
      const res2 = await fetch("https://timeapi.io/api/Time/current/zone?timeZone=UTC");
      const data2 = await res2.json();
      return new Date(data2.dateTime);
    } catch (err) {
      return null;
    }
  }
}

async function verificarLicenciaCliente() {
  let licenciaGuardada = localStorage.getItem("syncstory_license");
  
  if (!licenciaGuardada) {
    licenciaGuardada = prompt("Ingresa tu clave de licencia de 30 días:");
    if (!licenciaGuardada) return false;
  }

  licenciaGuardada = licenciaGuardada.trim().toUpperCase();
  const partes = licenciaGuardada.split("-");

  if (partes.length !== 3 || partes[0] !== "SYNC") {
    alert("Formato de licencia inválido.");
    localStorage.removeItem("syncstory_license");
    return false;
  }

  const fechaExpStr = partes[1];
  const firmaCliente = partes[2];

  const firmaValida = generarFirma(fechaExpStr);
  if (firmaCliente !== firmaValida) {
    alert("Licencia inválida o alterada ilegítimamente.");
    localStorage.removeItem("syncstory_license");
    return false;
  }

  const ano = parseInt(fechaExpStr.substring(0, 4));
  const mes = parseInt(fechaExpStr.substring(4, 6)) - 1;
  const dia = parseInt(fechaExpStr.substring(6, 8));
  const fechaExpiracion = new Date(ano, mes, dia, 23, 59, 59);

  const fechaHoy = await obtenerFechaRealInternet();
  
  if (!fechaHoy) {
    alert("Requieres conexión a internet para validar tu licencia.");
    return false;
  }

  if (fechaHoy > fechaExpiracion) {
    alert("Tu suscripción de 30 días ha vencido. Contacta a soporte para renovar.");
    localStorage.removeItem("syncstory_license");
    return false;
  }

  localStorage.setItem("syncstory_license", licenciaGuardada);
  return true;
}

// ==========================================
// ELEMENTOS DE LA INTERFAZ
// ==========================================

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

const ctx2d = el.canvas ? el.canvas.getContext("2d", { alpha: false }) : null;

let audioFile = null;
let imageFiles = [];
let outputBlobUrl = null;

if (el.audioInput) {
  el.audioInput.addEventListener("change", () => {
    audioFile = el.audioInput.files[0] || null;
    el.audioName.textContent = audioFile ? audioFile.name : "MP3, WAV o M4A";
    updateRunButton();
  });
}

if (el.imagesInput) {
  el.imagesInput.addEventListener("change", () => {
    imageFiles = Array.from(el.imagesInput.files || []);
    el.imagesName.textContent = imageFiles.length
      ? `${imageFiles.length} imágenes cargadas`
      : "JPG, JPEG o PNG — varias a la vez";
    el.imgCount.textContent = imageFiles.length;
    updateRunButton();
  });
}

function updateRunButton() {
  if (el.runBtn) {
    el.runBtn.disabled = !(audioFile && imageFiles.length > 0);
  }
}

if (el.resetBtn) el.resetBtn.addEventListener("click", () => location.reload());
if (el.errorRetryBtn) {
  el.errorRetryBtn.addEventListener("click", () => {
    show(el.cardInputs);
    hide(el.cardError);
  });
}

function show(node) { if (node) node.hidden = false; }
function hide(node) { if (node) node.hidden = true; }

function setStatus(pct, line, sub = "") {
  if (el.progressBar) el.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (el.statusLine) el.statusLine.textContent = line;
  if (el.statusSub) el.statusSub.textContent = sub;
}

function fail(message) {
  console.error(message);
  hide(el.cardProgress);
  show(el.cardError);
  if (el.errorText) el.errorText.textContent = message;
}

// ==========================================
// FLUJO PRINCIPAL
// ==========================================

if (el.runBtn) {
  el.runBtn.addEventListener("click", async () => {
    const licenciaOk = await verificarLicenciaCliente();
    if (!licenciaOk) return;

    hide(el.cardInputs);
    hide(el.cardError);
    show(el.cardProgress);
    setStatus(2, "Preparando…", "Leyendo archivos");

    try {
      let wakeLock = null;
      try {
        if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      } catch {}

      setStatus(5, "Preparando…", "Decodificando audio");
      const { audioBuffer, monoData16k, objectUrl: audioUrl } = await decodeAudioForModel(audioFile);
      const duration = audioBuffer.duration;

      setStatus(10, "Preparando…", `Cargando ${imageFiles.length} imágenes`);
      const loadedImages = await loadImages(imageFiles);

      const lang = el.langSelect.value;
      const modelId = el.modelSelect.value;
      setStatus(15, "Transcribiendo…", "Cargando motor de voz e IA");
      const transcriber = await pipeline("automatic-speech-recognition", modelId, {
        progress_callback: (p) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            setStatus(15 + p.progress * 0.15, "Transcribiendo…", `Cargando modelo: ${Math.round(p.progress)}%`);
          }
        },
      });

      setStatus(35, "Analizando locución…", "Buscando pausas y cortes de voz");
      const result = await transcriber(monoData16k, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
        language: lang === "auto" ? null : lang,
        task: "transcribe",
      });

      let rawChunks = result.chunks || [];
      let speechSegments = rawChunks
        .map((c) => ({
          start: c.timestamp ? c.timestamp[0] : 0,
          end: c.timestamp ? c.timestamp[1] : duration,
          text: (c.text || "").trim()
        }))
        .filter((s) => s.end !== null && s.start !== null && s.end > s.start);

      setStatus(60, "Sincronizando escenas…", "Configurando animación y transiciones");
      const timeline = buildHybridTimeline(loadedImages, speechSegments, duration);

      setStatus(65, "Generando video…", "0%");
      const blob = await renderVideo({
        images: loadedImages,
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
}

if (el.previewBtn) {
  el.previewBtn.addEventListener("click", () => {
    el.previewVideo.scrollIntoView({ behavior: "smooth", block: "center" });
    el.previewVideo.play().catch(() => {});
  });
}

function explainError(err) {
  const msg = String(err && err.message ? err.message : err);
  if (/out of memory|allocation/i.test(msg)) {
    return "Memoria insuficiente. Prueba con el modelo 'tiny' o menos imágenes.";
  }
  if (/MediaRecorder|mimeType|not supported/i.test(msg)) {
    return "Navegador no compatible. Usa Chrome en Android o PC.";
  }
  return `Ocurrió un error: ${msg}`;
}

// ==========================================
// AUDIO & RESAMPLEO
// ==========================================

async function decodeAudioForModel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const tmpCtx = new AudioCtx();
  const audioBuffer = await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
  await tmpCtx.close();

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

function loadImages(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ img, name: file.name });
          img.onerror = () => reject(new Error(`Error al cargar la imagen ${file.name}`));
          img.src = URL.createObjectURL(file);
        })
    )
  );
}

// ==========================================
// GENERADOR DE LÍNEA DE TIEMPO MULTI-TRANSICIÓN
// ==========================================

function buildHybridTimeline(loadedImages, segments, totalDuration) {
  const nImages = loadedImages.length;
  if (nImages === 0) return [];

  let cutPoints = [0];
  const targetDuration = totalDuration / nImages;
  
  if (segments && segments.length > 0) {
    let accumulatedTime = 0;
    let currentImgCount = 0;
    for (const seg of segments) {
      accumulatedTime += (seg.end - seg.start);
      if (accumulatedTime >= targetDuration && currentImgCount < nImages - 1) {
        cutPoints.push(seg.end);
        accumulatedTime = 0;
        currentImgCount++;
      }
    }
  }

  while (cutPoints.length < nImages) {
    const lastCut = cutPoints[cutPoints.length - 1];
    cutPoints.push(lastCut + ((totalDuration - lastCut) / (nImages - cutPoints.length + 1)));
  }

  // Animaciones de Zoom
  const zoomTypes = ["zoom_in", "zoom_out", "pull_out_dramatic"];
  
  // Catálogo extendido de 8 transiciones elegantes
  const transitionCatalog = [
    "crossfade", 
    "smooth_slide_right", 
    "smooth_slide_left", 
    "soft_flash", 
    "zoom_blur", 
    "fade_dark", 
    "slide_up", 
    "soft_vignette"
  ];
  
  let timeline = [];
  let transitionState = { mode: "transition", remainingInBlock: Math.floor(Math.random() * 3) + 1 };
  let recentTransitions = [];

  for (let i = 0; i < nImages; i++) {
    const zoomMode = zoomTypes[i % zoomTypes.length];
    let activeTransition = "none";

    if (i < nImages - 1) {
      if (transitionState.remainingInBlock <= 0) {
        if (transitionState.mode === "transition") {
          transitionState.mode = "hard_cut";
          transitionState.remainingInBlock = Math.floor(Math.random() * 2) + 2; // 2 o 3 sin transición
        } else {
          transitionState.mode = "transition";
          transitionState.remainingInBlock = Math.floor(Math.random() * 3) + 1; // 1, 2 o 3 con transición
        }
      }

      if (transitionState.mode === "transition") {
        // Filtrar para no repetir transiciones recientes
        let available = transitionCatalog.filter(t => !recentTransitions.includes(t));
        if (available.length === 0) available = transitionCatalog; // Resguardo

        activeTransition = available[Math.floor(Math.random() * available.length)];
        
        // Mantener memoria de las últimas 3 transiciones usadas
        recentTransitions.push(activeTransition);
        if (recentTransitions.length > 3) recentTransitions.shift();
      }
      transitionState.remainingInBlock--;
    }

    timeline.push({
      imageIndex: i,
      start: cutPoints[i],
      end: (i === nImages - 1) ? totalDuration : cutPoints[i + 1],
      zoomType: zoomMode,
      transition: activeTransition,
      transDuration: 0.6
    });
  }

  return timeline;
}

// ==========================================
// RENDERIZADO CANVAS CON ZOOMS Y TRANSICIONES
// ==========================================

function drawImageWithZoom(image, canvas, progress, zoomType) {
  const cw = canvas.width, ch = canvas.height;
  const iw = image.naturalWidth, ih = image.naturalHeight;
  
  let scaleFactor = 1.0;

  if (zoomType === "zoom_in") {
    scaleFactor = 1.0 + (progress * 0.12);
  } else if (zoomType === "zoom_out") {
    scaleFactor = 1.15 - (progress * 0.12);
  } else if (zoomType === "pull_out_dramatic") {
    if (progress < 0.85) {
      scaleFactor = 1.0 + (progress * 0.08);
    } else {
      const pullProgress = (progress - 0.85) / 0.15;
      scaleFactor = 1.068 - (pullProgress * 0.10);
    }
  }

  const baseScale = Math.max(cw / iw, ch / ih);
  const finalScale = baseScale * scaleFactor;
  
  const dw = iw * finalScale, dh = ih * finalScale;
  const dx = (cw - dw) / 2, dy = (ch - dh) / 2;

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
    const format = el.formatSelect ? el.formatSelect.value : "16:9";
    if (format === "9:16" || format === "vertical") {
      el.canvas.width = 1080;
      el.canvas.height = 1920;
    } else {
      el.canvas.width = 1920;
      el.canvas.height = 1080;
    }

    const rawImgs = images.map(item => item.img);

    const audioEl = new Audio();
    audioEl.src = audioUrl;
    audioEl.preload = "auto";
    audioEl.crossOrigin = "anonymous";

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const sourceNode = audioCtx.createMediaElementSource(audioEl);
    const destNode = audioCtx.createMediaStreamDestination();
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

    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 4_500_000 });
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
    recorder.onerror = (e) => { finished = true; cancelAnimationFrame(rafId); reject(e.error || new Error("Error en MediaRecorder")); };

    function frameLoop() {
      if (finished) return;
      const t = audioEl.currentTime;

      let currentIdx = 0;
      for (let i = 0; i < timeline.length; i++) {
        if (t >= timeline[i].start && t < timeline[i].end) {
          currentIdx = i;
          break;
        }
      }

      const item = timeline[currentIdx];
      const sceneDuration = item.end - item.start;
      const sceneProgress = Math.min(1, Math.max(0, (t - item.start) / sceneDuration));
      
      const timeRemaining = item.end - t;
      const isTrans = item.transition !== "none" && timeRemaining <= item.transDuration && currentIdx < timeline.length - 1;

      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, el.canvas.width, el.canvas.height);

      if (!isTrans) {
        drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
      } else {
        const nextItem = timeline[currentIdx + 1];
        const transProgress = 1 - (timeRemaining / item.transDuration);

        if (item.transition === "crossfade") {
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          ctx2d.save();
          ctx2d.globalAlpha = transProgress;
          drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          ctx2d.restore();
        } 
        else if (item.transition === "smooth_slide_right") {
          const shiftX = el.canvas.width * (1 - transProgress);
          ctx2d.save();
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          ctx2d.translate(shiftX, 0);
          drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          ctx2d.restore();
        } 
        else if (item.transition === "smooth_slide_left") {
          const shiftX = -el.canvas.width * (1 - transProgress);
          ctx2d.save();
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          ctx2d.translate(shiftX, 0);
          drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          ctx2d.restore();
        }
        else if (item.transition === "slide_up") {
          const shiftY = el.canvas.height * (1 - transProgress);
          ctx2d.save();
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          ctx2d.translate(0, shiftY);
          drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          ctx2d.restore();
        }
        else if (item.transition === "soft_flash") {
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          ctx2d.fillStyle = `rgba(255, 255, 255, ${Math.sin(transProgress * Math.PI) * 0.35})`;
          ctx2d.fillRect(0, 0, el.canvas.width, el.canvas.height);
          if (transProgress > 0.5) {
            drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          }
        } 
        else if (item.transition === "zoom_blur") {
          ctx2d.save();
          ctx2d.globalAlpha = 1 - transProgress;
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          ctx2d.globalAlpha = transProgress;
          drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          ctx2d.restore();
        }
        else if (item.transition === "fade_dark") {
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          ctx2d.fillStyle = `rgba(0, 0, 0, ${Math.sin(transProgress * Math.PI)})`;
          ctx2d.fillRect(0, 0, el.canvas.width, el.canvas.height);
          if (transProgress > 0.5) {
            drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          }
        }
        else if (item.transition === "soft_vignette") {
          drawImageWithZoom(rawImgs[item.imageIndex], el.canvas, sceneProgress, item.zoomType);
          const gradient = ctx2d.createRadialGradient(
            el.canvas.width / 2, el.canvas.height / 2, el.canvas.width * 0.3,
            el.canvas.width / 2, el.canvas.height / 2, el.canvas.width * 0.7
          );
          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(1, `rgba(0,0,0,${Math.sin(transProgress * Math.PI) * 0.6})`);
          ctx2d.fillStyle = gradient;
          ctx2d.fillRect(0, 0, el.canvas.width, el.canvas.height);
          if (transProgress > 0.5) {
            drawImageWithZoom(rawImgs[nextItem.imageIndex], el.canvas, 0, nextItem.zoomType);
          }
        }
      }

      onProgress(Math.min(1, t / duration));

      if (t >= duration - 0.05 || audioEl.ended) {
        if (recorder.state === "recording") recorder.stop();
        return;
      }
      rafId = requestAnimationFrame(frameLoop);
    }

    audioEl.onended = () => { if (recorder.state === "recording") recorder.stop(); };
    audioEl.onerror = () => reject(new Error("Error al reproducir el audio para el renderizado"));

    audioEl.oncanplaythrough = () => {
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
