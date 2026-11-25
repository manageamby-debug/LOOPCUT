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
  document.getElementById("currentTime").textContent = formatTime(moment.start);
  document.getElementById("endTime").textContent = formatTime(moment.end);
  document.getElementById("durationLabel").textContent = formatTime(moment.end - moment.start);
  captionText.value = moment.caption;
  updateCaptionOverlay();
  const startPercent = 18 + index * 9;
  const selection = document.getElementById("selectionWindow");
  selection.style.left = `${startPercent}%`;
  selection.style.width = `${43 - index * 3}%`;
  document.querySelector(".playhead").style.left = `${startPercent + 13}%`;
  if (!videoPreview.hidden && Number.isFinite(videoPreview.duration)) {
    videoPreview.currentTime = Math.min(moment.start, Math.max(0, videoPreview.duration - 0.5));
  }
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
      clearSampleMoments("The link is saved. YouTube playback is shown when available; automatic video import and analysis are not connected yet.");
      document.getElementById("sourceNote").textContent = "Link saved to your project. The source video has not been imported or analyzed.";
      setProjectTitle(title);
      showToast("Video link saved. Automatic analysis is not connected yet.");
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
videoPreview.addEventListener("timeupdate", () => {
  document.getElementById("currentTime").textContent = formatTime(videoPreview.currentTime);
  if (Number.isFinite(videoPreview.duration)) document.getElementById("endTime").textContent = formatTime(videoPreview.duration);
});
videoPreview.addEventListener("loadedmetadata", () => {
  document.getElementById("endTime").textContent = formatTime(videoPreview.duration);
  document.getElementById("durationLabel").textContent = formatTime(videoPreview.duration);
  const endInput = document.getElementById("clipEndInput");
  if (Number.isFinite(videoPreview.duration) && videoPreview.duration > 0) {
    endInput.value = Math.min(videoPreview.duration, 60).toFixed(1);
  }
  if (showingSampleMoments) applyMoment(activeMoment);
});

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
