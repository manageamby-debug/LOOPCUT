const toast = document.getElementById("toast");
const homeView = document.getElementById("homeView");
const editorView = document.getElementById("editorView");
const sourceInput = document.getElementById("sourceInput");
const fileInput = document.getElementById("fileInput");
const videoPreview = document.getElementById("videoPreview");
const externalPreview = document.getElementById("externalPreview");
const samplePoster = document.getElementById("samplePoster");
const rightsConfirmed = document.getElementById("rightsConfirmed");
const captionText = document.getElementById("captionText");
const captionLine = document.getElementById("captionLine");
const captionWord = document.querySelector(".caption-word");
const previewFrame = document.getElementById("previewFrame");
const momentData = [
  { title: "The mindset shift nobody talks about", start: 42, end: 88, caption: "The mindset shift nobody talks about yet." },
  { title: "My first product failed — here's why", start: 196, end: 242, caption: "My first product failed. Here's what I learned." },
  { title: "The advice I wish I heard at 22", start: 510, end: 555, caption: "The advice I wish I heard at 22." },
];
let activeMoment = 0;
let objectUrl = null;
let currentProjectId = null;
let showingSampleMoments = true;
let toastTimer;

// Docker page (localhost:8088) talks to the API on 8001; otherwise use the local API on 8000.
const API_BASE_URL = window.location.port === "8088"
  ? "http://localhost:8001/api/v1"
  : "http://127.0.0.1:8000/api/v1";

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new Error("Loopcut could not reach the API. Start it with .\\scripts\\run-api.ps1 (local) or Docker, then reload this page.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || `The API returned an error (${response.status}).`);
  }
  return payload;
}

function getClipRange() {
  const value = document.getElementById("clipLength").value;
  if (value === "under 30 sec") return { min_clip_seconds: 10, max_clip_seconds: 29 };
  if (value === "60-90 sec") return { min_clip_seconds: 60, max_clip_seconds: 90 };
  if (value === "up to 3 min") return { min_clip_seconds: 60, max_clip_seconds: 180 };
  return { min_clip_seconds: 30, max_clip_seconds: 60 };
}

function getCaptionLanguage() {
  const language = document.getElementById("captionLanguage").value;
  const codes = { English: "en", Kiswahili: "sw", Spanish: "es", French: "fr", Arabic: "ar" };
  return codes[language.replace(" captions", "")] || "en";
}

function getYouTubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1] || "";
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : "";
  } catch {
    return "";
  }
}

function clearSampleMoments(message) {
  showingSampleMoments = false;
  document.getElementById("momentsTitle").textContent = "No moments generated yet";
  document.getElementById("momentList").innerHTML = `<div class="empty-state">${message}</div>`;
  document.getElementById("captionOverlay").hidden = true;
  document.getElementById("playPreview").hidden = true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function switchView(view) {
  const editor = view === "editor";
  homeView.classList.toggle("active", !editor);
  editorView.classList.toggle("active", editor);
  document.getElementById("crumb-current").textContent = editor ? "Clip editor" : "Overview";
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === (editor ? "editor" : "home") && item.textContent.includes(editor ? "Clip editor" : "Overview"));
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === "templates" || button.dataset.view === "brand") {
      showToast("This workspace section will be built after the clip editor.");
      return;
    }
    switchView(button.dataset.view);
  });
});

document.querySelectorAll("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.toast));
});

function setProjectTitle(name) {
  const clean = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  document.getElementById("projectTitle").textContent = clean || "Untitled video";
}

function applyMoment(index) {
  activeMoment = index;
  const moment = momentData[index];
  document.querySelectorAll(".moment-card").forEach((card) => card.classList.toggle("selected", Number(card.dataset.moment) === index));
  document.getElementById("previewClipName").textContent = `Moment ${String(index + 1).padStart(2, "0")}`;
  captionText.value = moment.caption;
  updateCaptionOverlay();
  setClipRange(moment.start, moment.end, { commit: false });
  seekTo(clipRange.start);
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function updateCaptionOverlay() {
  const words = captionText.value.trim().split(/\s+/).filter(Boolean);
  const last = words.length > 4 ? words.pop() : "";
  captionLine.textContent = words.join(" ").toUpperCase();
  captionWord.textContent = last.toUpperCase();
  captionWord.hidden = !last;
}

document.querySelectorAll(".moment-card").forEach((card) => {
  card.addEventListener("click", () => applyMoment(Number(card.dataset.moment)));
});
document.querySelectorAll("[data-open-editor]").forEach((button) => button.addEventListener("click", () => {
  currentProjectId = null;
  switchView("editor");
  showToast("This is a demo project. Upload a video to create a real export.");
}));

document.getElementById("uploadButton").addEventListener("click", () => fileInput.click());
document.getElementById("newProjectCard").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => sourceInput.focus(), 250);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  sourceInput.value = "";
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  videoPreview.src = objectUrl;
  setProjectTitle(file.name);
  document.getElementById("sourceNote").textContent = `${file.name} selected. Click “Find my moments” to save it to Loopcut.`;
});

sourceInput.addEventListener("input", () => {
  if (sourceInput.value && fileInput.files.length) {
    fileInput.value = "";
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    videoPreview.removeAttribute("src");
  }
});

document.getElementById("generateButton").addEventListener("click", async () => {
  const source = sourceInput.value.trim();
  const file = fileInput.files && fileInput.files[0];
  if (!source && !file) {
    showToast("Paste a video link or upload a video to start.");
    sourceInput.focus();
    return;
  }
  if (source && file) {
    showToast("Choose either a video link or a file, not both.");
    return;
  }
  if (!rightsConfirmed.checked) {
    showToast("Please confirm that you have permission to process this video.");
    rightsConfirmed.focus();
    return;
  }

  const button = document.getElementById("generateButton");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = 'Saving project… <span class="loading-spark">✳</span>';
  document.getElementById("sourceNote").textContent = "Saving your source to Loopcut…";
  try {
    const clipRange = getClipRange();
    const title = file
      ? file.name.replace(/\.[^.]+$/, "")
      : `${new URL(source).hostname.replace(/^www\./, "")} video`;
    const project = await apiRequest("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        source_type: file ? "upload" : "url",
        ...(source ? { source_url: source } : {}),
        rights_confirmed: true,
        caption_language: getCaptionLanguage(),
        aspect_ratio: document.getElementById("outputRatio").value,
        ...clipRange,
      }),
    });
    currentProjectId = project.id;

    if (file) {
      const form = new FormData();
      form.append("file", file, file.name);
      await apiRequest(`/projects/${project.id}/upload`, { method: "POST", body: form });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      videoPreview.src = objectUrl;
      videoPreview.hidden = false;
      externalPreview.hidden = true;
      externalPreview.src = "";
      document.getElementById("sourceLink").hidden = true;
      samplePoster.hidden = true;
      clearSampleMoments("Your video has been uploaded and saved. Transcription and automatic moment detection are the next processing step.");
      document.getElementById("sourceNote").textContent = "Video uploaded and saved. Analysis has not started yet.";
      setProjectTitle(file.name);
      showToast("Video uploaded to your project.");
    } else {
      const embedUrl = getYouTubeEmbedUrl(source);
      videoPreview.pause();
      videoPreview.hidden = true;
      videoPreview.removeAttribute("src");
      externalPreview.hidden = !embedUrl;
      externalPreview.src = embedUrl;
      const sourceLink = document.getElementById("sourceLink");
      sourceLink.href = source;
      sourceLink.hidden = false;
      samplePoster.hidden = true;
      clearSampleMoments("The link is saved. Downloading the video so you can clip it\u2026");
      document.getElementById("sourceNote").textContent = "Link saved. Importing the video so you can clip and export it\u2026";
      setProjectTitle(title);
      showToast("Link saved. Importing the video so you can clip it\u2026");
      importLinkSource(project.id); // runs in the background; progress shows in the editor
    }
    switchView("editor");
  } catch (error) {
    document.getElementById("sourceNote").textContent = error.message;
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
});

document.getElementById("dismissNote").addEventListener("click", () => {
  document.querySelector(".prototype-note").hidden = true;
});

document.querySelectorAll(".inspector-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".inspector-tab").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".inspector-panel").forEach((panel) => panel.classList.remove("active"));
    document.getElementById(`${tab.dataset.tab}Panel`).classList.add("active");
  });
});

function setRatio(ratio) {
  previewFrame.classList.remove("ratio-9-16", "ratio-4-5", "ratio-1-1", "ratio-16-9");
  previewFrame.classList.add(`ratio-${ratio.replace(":", "-")}`);
  document.querySelectorAll(".ratio-button").forEach((button) => button.classList.toggle("active", button.dataset.ratio === ratio));
  document.querySelectorAll(".ratio-choice").forEach((button) => button.classList.toggle("active", button.dataset.ratio === ratio));
  document.getElementById("outputRatio").value = ratio;
}
document.querySelectorAll("[data-ratio]").forEach((button) => button.addEventListener("click", () => setRatio(button.dataset.ratio)));
document.getElementById("outputRatio").addEventListener("change", (event) => setRatio(event.target.value));

captionText.addEventListener("input", updateCaptionOverlay);
document.getElementById("resetCaption").addEventListener("click", () => {
  captionText.value = momentData[activeMoment].caption;
  updateCaptionOverlay();
  showToast("Caption reset to the suggested text.");
});
document.getElementById("captionLanguage").addEventListener("change", (event) => {
  document.getElementById("editorLanguage").value = event.target.value.replace(" captions", "");
  showToast("Language preference saved for this preview.");
});
document.getElementById("editorLanguage").addEventListener("change", (event) => {
  document.getElementById("captionLanguage").value = `${event.target.value} captions`;
});
document.getElementById("translateButton").addEventListener("click", () => showToast("Choose a caption language above; translation will connect to the language service."));

document.querySelectorAll(".style-swatch").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".style-swatch").forEach((item) => item.classList.toggle("active", item === button));
    previewFrame.classList.remove("caption-style-bold", "caption-style-highlight", "caption-style-clean");
    previewFrame.classList.add(`caption-style-${button.dataset.style}`);
  });
});

document.getElementById("fontSize").addEventListener("input", (event) => {
  const size = Number(event.target.value);
  document.getElementById("fontSizeLabel").textContent = ["Compact", "Large", "Extra large"][size - 1];
  document.querySelector(".caption-overlay").style.fontSize = `${10 + size * 2}px`;
});

function toggleButton(button) {
  const on = button.classList.toggle("on");
  button.setAttribute("aria-pressed", String(on));
}
document.querySelectorAll(".toggle-switch").forEach((button) => button.addEventListener("click", () => toggleButton(button)));

document.getElementById("trackingButton").addEventListener("click", () => {
  document.getElementById("trackingButton").classList.add("active-setting");
  document.getElementById("centerButton").classList.remove("active-setting");
});
document.getElementById("centerButton").addEventListener("click", () => {
  document.getElementById("centerButton").classList.add("active-setting");
  document.getElementById("trackingButton").classList.remove("active-setting");
});

function togglePlayback() {
  if (!externalPreview.hidden) return;
  if (videoPreview.hidden) {
    showToast("Choose a file or open a supported video link to preview it.");
    return;
  }
  if (videoPreview.paused) {
    // Play only the selected clip: start from the in-point if the playhead is outside it.
    if (videoPreview.currentTime < clipRange.start - 0.05 || videoPreview.currentTime >= clipRange.end - 0.05) {
      videoPreview.currentTime = clipRange.start;
    }
    playingSelection = true;
    videoPreview.play().catch(() => showToast("This video format cannot be previewed in the browser."));
  } else {
    videoPreview.pause();
  }
}
document.getElementById("playPreview").addEventListener("click", togglePlayback);
document.getElementById("transportPlay").addEventListener("click", togglePlayback);
document.getElementById("skipBack").addEventListener("click", () => { if (!videoPreview.hidden) videoPreview.currentTime = Math.max(0, videoPreview.currentTime - 5); });
document.getElementById("skipForward").addEventListener("click", () => { if (!videoPreview.hidden) videoPreview.currentTime = Math.min(videoPreview.duration || 0, videoPreview.currentTime + 5); });
videoPreview.addEventListener("play", () => { document.getElementById("playPreview").textContent = "Ⅱ"; document.getElementById("transportPlay").textContent = "Ⅱ"; });
videoPreview.addEventListener("pause", () => { document.getElementById("playPreview").textContent = "▶"; document.getElementById("transportPlay").textContent = "▶"; });
videoPreview.addEventListener("timeupdate", () => renderPlayhead());
videoPreview.addEventListener("seeked", () => renderPlayhead());
videoPreview.addEventListener("loadedmetadata", () => {
  if (!Number.isFinite(videoPreview.duration) || videoPreview.duration <= 0) return;
  resetTimelineForVideo();
});

/* ---------- Interactive timeline editor ---------- */
const DEMO_DURATION = 600;
const MAX_CLIP_SECONDS = 180; // the API rejects longer exports
const MIN_CLIP_SECONDS = 0.5;
const timelineTrack = document.getElementById("timelineTrack");
const timelineRuler = document.getElementById("timelineRuler");
const selectionWindow = document.getElementById("selectionWindow");
const selectionLabel = selectionWindow.querySelector(".selection-label");
const playheadEl = timelineTrack.querySelector(".playhead");
const clipStartField = document.getElementById("clipStartInput");
const clipEndField = document.getElementById("clipEndInput");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const zoomInButton = document.getElementById("zoomInButton");
const zoomOutButton = document.getElementById("zoomOutButton");

const clipRange = { start: 0, end: 30 };          // selected clip, in seconds
const viewport = { start: 0, end: DEMO_DURATION }; // visible part of the timeline, in seconds
let editHistory = [{ start: 0, end: 30 }];
let historyIndex = 0;
let drag = null;
let playingSelection = false;
let demoTime = 0;
let rafId = 0;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function totalDuration() {
  const duration = videoPreview.duration;
  return videoPreview.getAttribute("src") && Number.isFinite(duration) && duration > 0 ? duration : DEMO_DURATION;
}

function minClipLength() { return Math.min(MIN_CLIP_SECONDS, totalDuration() / 2); }
function timeToPercent(time) { return ((time - viewport.start) / (viewport.end - viewport.start)) * 100; }
function currentPlayTime() { return videoPreview.getAttribute("src") ? (videoPreview.currentTime || 0) : demoTime; }

function formatPrecise(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${(safe % 60).toFixed(1).padStart(4, "0")}`;
}

function pointerTime(event) {
  const rect = timelineTrack.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  return viewport.start + ratio * (viewport.end - viewport.start);
}

function renderRuler() {
  const span = viewport.end - viewport.start;
  const precise = span < 30;
  timelineRuler.innerHTML = "";
  for (let index = 0; index < 5; index += 1) {
    const time = viewport.start + (span * index) / 4;
    const label = document.createElement("span");
    label.textContent = precise ? formatPrecise(time) : formatTime(time);
    timelineRuler.appendChild(label);
  }
}

function renderPlayhead() {
  const time = currentPlayTime();
  const percent = timeToPercent(time);
  playheadEl.style.display = percent < 0 || percent > 100 ? "none" : "";
  playheadEl.style.left = `${percent}%`;
  document.getElementById("currentTime").textContent = formatTime(time);
  document.getElementById("endTime").textContent = formatTime(totalDuration());
}

function renderTimeline() {
  const total = totalDuration();
  if (viewport.end > total + 0.01 || viewport.end - viewport.start <= 0) {
    viewport.start = 0;
    viewport.end = total;
    renderRuler();
  }
  const left = timeToPercent(clipRange.start);
  const right = timeToPercent(clipRange.end);
  selectionWindow.style.left = `${left}%`;
  selectionWindow.style.width = `${Math.max(right - left, 0.3)}%`;
  const length = clipRange.end - clipRange.start;
  selectionLabel.textContent = `${formatTime(clipRange.start)} \u2013 ${formatTime(clipRange.end)} \u00b7 ${length.toFixed(1)}s`;
  document.getElementById("durationLabel").textContent = formatTime(length);
  const span = viewport.end - viewport.start;
  zoomOutButton.disabled = span >= total - 0.01;
  zoomInButton.disabled = span <= Math.min(5, total) + 0.01;
  renderPlayhead();
}

function syncRangeInputs() {
  clipStartField.value = clipRange.start.toFixed(1);
  clipEndField.value = clipRange.end.toFixed(1);
}

function updateHistoryButtons() {
  undoButton.disabled = historyIndex <= 0;
  redoButton.disabled = historyIndex >= editHistory.length - 1;
}

function pushHistory() {
  const last = editHistory[historyIndex];
  if (last && Math.abs(last.start - clipRange.start) < 0.001 && Math.abs(last.end - clipRange.end) < 0.001) return;
  editHistory = editHistory.slice(0, historyIndex + 1);
  editHistory.push({ start: clipRange.start, end: clipRange.end });
  if (editHistory.length > 100) editHistory.shift();
  historyIndex = editHistory.length - 1;
  updateHistoryButtons();
}

function applyHistoryStep() {
  const step = editHistory[historyIndex];
  setClipRange(step.start, step.end, { commit: false });
  updateHistoryButtons();
}
function undoRange() { if (historyIndex > 0) { historyIndex -= 1; applyHistoryStep(); } }
function redoRange() { if (historyIndex < editHistory.length - 1) { historyIndex += 1; applyHistoryStep(); } }

function setClipRange(start, end, { commit = true, anchor = "start" } = {}) {
  const total = totalDuration();
  const minLength = minClipLength();
  start = clamp(Number(start) || 0, 0, Math.max(0, total - minLength));
  end = clamp(Number(end) || 0, start + minLength, total);
  if (end - start > MAX_CLIP_SECONDS) {
    if (anchor === "end") start = end - MAX_CLIP_SECONDS;
    else end = start + MAX_CLIP_SECONDS;
  }
  clipRange.start = start;
  clipRange.end = end;
  syncRangeInputs();
  renderTimeline();
  if (commit) pushHistory();
}

function seekTo(time) {
  const target = clamp(time, 0, totalDuration());
  if (videoPreview.getAttribute("src")) {
    if (Number.isFinite(videoPreview.duration)) videoPreview.currentTime = target;
  } else {
    demoTime = target;
  }
  renderPlayhead();
}

function setViewport(start, end) {
  const total = totalDuration();
  const span = clamp(end - start, Math.min(5, total), total);
  const from = clamp(start, 0, total - span);
  viewport.start = from;
  viewport.end = from + span;
  renderRuler();
  renderTimeline();
}

function resetTimelineForVideo() {
  const total = totalDuration();
  viewport.start = 0;
  viewport.end = total;
  renderRuler();
  setClipRange(0, Math.min(total, 60), { commit: false });
  editHistory = [{ start: clipRange.start, end: clipRange.end }];
  historyIndex = 0;
  updateHistoryButtons();
}

/* Drag handling: trim handles, move the whole clip, scrub the playhead, pan the ruler */
function startDrag(mode, event, target) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  drag = {
    mode,
    pointerId: event.pointerId,
    origin: pointerTime(event),
    clientX: event.clientX,
    start: clipRange.start,
    end: clipRange.end,
    viewStart: viewport.start,
    viewEnd: viewport.end,
    moved: false,
  };
  try { target.setPointerCapture(event.pointerId); } catch { /* not supported */ }
  (mode === "pan" ? timelineRuler : timelineTrack).classList.add("dragging");
}

function onDragMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (Math.abs(event.clientX - drag.clientX) > 3) drag.moved = true;
  const total = totalDuration();
  const minLength = minClipLength();
  if (drag.mode === "pan") {
    const rect = timelineTrack.getBoundingClientRect();
    const delta = -((event.clientX - drag.clientX) / rect.width) * (drag.viewEnd - drag.viewStart);
    setViewport(drag.viewStart + delta, drag.viewEnd + delta);
    return;
  }
  const time = pointerTime(event);
  if (drag.mode === "scrub") {
    seekTo(time);
  } else if (drag.mode === "left") {
    const start = Math.max(clamp(time, 0, drag.end - minLength), drag.end - MAX_CLIP_SECONDS);
    setClipRange(start, drag.end, { commit: false, anchor: "end" });
    seekTo(clipRange.start);
  } else if (drag.mode === "right") {
    const end = Math.min(clamp(time, drag.start + minLength, total), drag.start + MAX_CLIP_SECONDS);
    setClipRange(drag.start, end, { commit: false });
    seekTo(Math.max(0, clipRange.end - 0.05));
  } else if (drag.mode === "move" && drag.moved) {
    const length = drag.end - drag.start;
    const start = clamp(drag.start + (time - drag.origin), 0, total - length);
    setClipRange(start, start + length, { commit: false });
  }
}

function endDrag(event) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  if (drag.mode === "move" && !drag.moved) seekTo(drag.origin); // a plain click on the clip just seeks
  if (drag.mode === "left" || drag.mode === "right" || drag.mode === "move") pushHistory();
  drag = null;
  timelineTrack.classList.remove("dragging");
  timelineRuler.classList.remove("dragging");
}

window.addEventListener("pointermove", onDragMove);
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);
selectionWindow.querySelector(".left-handle").addEventListener("pointerdown", (event) => startDrag("left", event, event.currentTarget));
selectionWindow.querySelector(".right-handle").addEventListener("pointerdown", (event) => startDrag("right", event, event.currentTarget));
selectionWindow.addEventListener("pointerdown", (event) => startDrag("move", event, selectionWindow));
timelineTrack.addEventListener("pointerdown", (event) => {
  startDrag("scrub", event, timelineTrack);
  if (drag) seekTo(drag.origin);
});
timelineRuler.addEventListener("pointerdown", (event) => startDrag("pan", event, timelineRuler));

/* Zoom + pan */
function zoomInOnClip() {
  const center = (clipRange.start + clipRange.end) / 2;
  const span = (viewport.end - viewport.start) / 2;
  setViewport(center - span / 2, center + span / 2);
}
function zoomOutTimeline() {
  const center = (viewport.start + viewport.end) / 2;
  const span = (viewport.end - viewport.start) * 2;
  setViewport(center - span / 2, center + span / 2);
}
function fitClipInView() {
  const length = clipRange.end - clipRange.start;
  setViewport(clipRange.start - length * 0.5, clipRange.end + length * 0.5);
}
zoomInButton.addEventListener("click", zoomInOnClip);
zoomOutButton.addEventListener("click", zoomOutTimeline);
selectionWindow.addEventListener("dblclick", fitClipInView);
timelineTrack.addEventListener("wheel", (event) => {
  const span = viewport.end - viewport.start;
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const time = pointerTime(event);
    const ratio = (time - viewport.start) / span;
    const newSpan = span * (event.deltaY < 0 ? 0.8 : 1.25);
    setViewport(time - ratio * newSpan, time - ratio * newSpan + newSpan);
  } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault();
    const delta = ((event.deltaX || event.deltaY) / 600) * span;
    setViewport(viewport.start + delta, viewport.end + delta);
  }
}, { passive: false });

/* Playback: draw the playhead smoothly and stop at the end of the selection */
function playbackTick() {
  const time = videoPreview.currentTime;
  if (time > viewport.end || time < viewport.start) {
    const span = viewport.end - viewport.start;
    setViewport(time - span * 0.1, time + span * 0.9);
  }
  renderPlayhead();
  if (playingSelection && time >= clipRange.end) {
    playingSelection = false;
    videoPreview.pause();
    videoPreview.currentTime = clipRange.start;
    renderPlayhead();
    return;
  }
  rafId = videoPreview.paused ? 0 : requestAnimationFrame(playbackTick);
}
videoPreview.addEventListener("play", () => {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(playbackTick);
});
videoPreview.addEventListener("pause", () => {
  playingSelection = false;
  cancelAnimationFrame(rafId);
  rafId = 0;
  renderPlayhead();
});

/* Number fields, set-in/out buttons, undo/redo */
clipStartField.addEventListener("change", () => {
  const start = Number(clipStartField.value);
  if (!clipStartField.value.trim() || !Number.isFinite(start)) { syncRangeInputs(); return; }
  setClipRange(start, Math.max(clipRange.end, start + minClipLength()), { anchor: "start" });
  seekTo(clipRange.start);
});
clipEndField.addEventListener("change", () => {
  const end = Number(clipEndField.value);
  if (!clipEndField.value.trim() || !Number.isFinite(end)) { syncRangeInputs(); return; }
  setClipRange(Math.min(clipRange.start, end - minClipLength()), end, { anchor: "end" });
});

function setClipStartHere() {
  const time = currentPlayTime();
  const length = clipRange.end - clipRange.start;
  const end = time < clipRange.end - minClipLength() ? clipRange.end : Math.min(totalDuration(), time + length);
  setClipRange(time, end, { anchor: "start" });
}
function setClipEndHere() {
  const time = currentPlayTime();
  const length = clipRange.end - clipRange.start;
  const start = time > clipRange.start + minClipLength() ? clipRange.start : Math.max(0, time - length);
  setClipRange(start, time, { anchor: "end" });
}
document.getElementById("setStartButton").addEventListener("click", setClipStartHere);
document.getElementById("setEndButton").addEventListener("click", setClipEndHere);
undoButton.addEventListener("click", undoRange);
redoButton.addEventListener("click", redoRange);

/* Keyboard shortcuts (editor only): Space, I, O, arrows, Ctrl+Z / Ctrl+Y */
document.addEventListener("keydown", (event) => {
  if (!editorView.classList.contains("active")) return;
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target.isContentEditable) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
    event.preventDefault();
    if (key === "y" || event.shiftKey) redoRange(); else undoRange();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === " " && tag !== "BUTTON") { event.preventDefault(); togglePlayback(); }
  else if (key === "i") setClipStartHere();
  else if (key === "o") setClipEndHere();
  else if (key === "arrowleft") { event.preventDefault(); seekTo(currentPlayTime() - (event.shiftKey ? 5 : 1)); }
  else if (key === "arrowright") { event.preventDefault(); seekTo(currentPlayTime() + (event.shiftKey ? 5 : 1)); }
});

renderRuler();
renderTimeline();
updateHistoryButtons();

let importInProgress = false;

function setImportMessage(message) {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.textContent = message;
  document.getElementById("momentList").replaceChildren(box);
}

// Download the video behind a saved link, then load it into the editor so it can be clipped.
async function importLinkSource(projectId) {
  importInProgress = true;
  const note = document.getElementById("sourceNote");
  try {
    setImportMessage("Downloading the video from your link\u2026 0%");
    let job = await apiRequest(`/projects/${projectId}/import`, { method: "POST" });
    const deadline = Date.now() + 30 * 60 * 1000;
    while (job.status !== "complete") {
      if (job.status === "failed") throw new Error(job.error_message || "The video could not be imported.");
      if (Date.now() > deadline) throw new Error("The import is taking too long. Please try again shortly.");
      setImportMessage(`Downloading the video from your link\u2026 ${job.progress}%`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (currentProjectId !== projectId) return; // another project was opened meanwhile
      job = await apiRequest(`/projects/${projectId}/import`);
    }
    if (currentProjectId !== projectId) return;
    externalPreview.hidden = true;
    externalPreview.src = "";
    videoPreview.src = `${API_BASE_URL}/projects/${projectId}/source`; // loadedmetadata sets up the timeline
    videoPreview.hidden = false;
    try {
      const project = await apiRequest(`/projects/${projectId}`);
      setProjectTitle(project.title);
    } catch { /* keep the current title */ }
    setImportMessage("Video imported. Drag the green handles on the timeline to choose your clip, then press Export.");
    note.textContent = "Video imported. You can now clip and export it.";
    showToast("Video imported. You can now clip and export it.");
  } catch (error) {
    setImportMessage(`Import failed: ${error.message}`);
    note.textContent = error.message;
    showToast(error.message);
  } finally {
    importInProgress = false;
  }
}

async function pollExport(exportId, button) {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await apiRequest(`/projects/${currentProjectId}/exports/${exportId}`);
    if (job.status === "failed") throw new Error(job.error_message || "The render failed.");
    if (job.status === "complete") {
      if (!job.download_url) throw new Error("The clip is ready, but its download link is missing.");
      showToast("Your clip is ready. Starting download.");
      window.location.assign(job.download_url);
      return;
    }
    button.innerHTML = job.status === "queued"
      ? "Waiting for render… <span>◷</span>"
      : `Rendering ${job.progress}% <span class="loading-spark">✳</span>`;
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  throw new Error("The render is still running. Please check again shortly.");
}

document.getElementById("exportButton").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!currentProjectId) {
    showToast("Open a saved project before exporting.");
    return;
  }
  if (importInProgress) {
    showToast("The video is still downloading. Please wait until it finishes.");
    return;
  }
  const startSeconds = Number(document.getElementById("clipStartInput").value);
  const endSeconds = Number(document.getElementById("clipEndInput").value);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) {
    showToast("Enter a valid start and end time for the clip.");
    return;
  }

  const originalButton = button.innerHTML;
  button.disabled = true;
  button.textContent = "Queueing export…";
  try {
    const job = await apiRequest(`/projects/${currentProjectId}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        aspect_ratio: document.getElementById("outputRatio").value,
      }),
    });
    showToast("Export queued. You can keep this page open while it renders.");
    await pollExport(job.id, button);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = originalButton;
  }
});
document.getElementById("fontSize").value = "2";

const waveform = document.getElementById("waveform");
for (let index = 0; index < 95; index += 1) {
  const bar = document.createElement("span");
  const height = 5 + Math.abs(Math.sin(index * 1.7) * Math.cos(index * 0.23)) * 25;
  bar.style.height = `${height}px`;
  waveform.appendChild(bar);
}

applyMoment(0);
