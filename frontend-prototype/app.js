const toast = document.getElementById("toast");
const homeView = document.getElementById("homeView");
const editorView = document.getElementById("editorView");
const sourceInput = document.getElementById("sourceInput");
const fileInput = document.getElementById("fileInput");
const videoPreview = document.getElementById("videoPreview");
const samplePoster = document.getElementById("samplePoster");
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
let toastTimer;

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
document.querySelectorAll("[data-open-editor]").forEach((button) => button.addEventListener("click", () => switchView("editor")));

document.getElementById("uploadButton").addEventListener("click", () => fileInput.click());
document.getElementById("newProjectCard").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => sourceInput.focus(), 250);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  videoPreview.src = objectUrl;
  videoPreview.hidden = false;
  samplePoster.hidden = true;
  setProjectTitle(file.name);
  document.getElementById("sourceNote").innerHTML = '<span class="tiny-check">✓</span> Video loaded for local preview. AI processing will be connected to the worker pipeline next.';
  switchView("editor");
  showToast("Video loaded for preview. It has not been uploaded.");
});

document.getElementById("generateButton").addEventListener("click", () => {
  const source = sourceInput.value.trim();
  if (!source && !fileInput.files.length) {
    showToast("Paste a video link or upload a video to start.");
    sourceInput.focus();
    return;
  }
  const button = document.getElementById("generateButton");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = 'Finding moments… <span class="loading-spark">✳</span>';
  if (source && !videoPreview.src) {
    try {
      const url = new URL(source);
      const host = url.hostname.replace(/^www\./, "");
      setProjectTitle(`${host} video project`);
    } catch {
      setProjectTitle("New video project");
    }
  }
  setTimeout(() => {
    switchView("editor");
    button.disabled = false;
    button.innerHTML = original;
    showToast("Sample moments are ready to explore. AI analysis connects next.");
  }, 900);
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
  if (videoPreview.hidden) {
    showToast("Upload a video file to play a real preview.");
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
  applyMoment(activeMoment);
});

document.getElementById("exportButton").addEventListener("click", () => showToast("Your clip settings are ready. The FFmpeg render worker is the next backend step."));
document.getElementById("fontSize").value = "2";

const waveform = document.getElementById("waveform");
for (let index = 0; index < 95; index += 1) {
  const bar = document.createElement("span");
  const height = 5 + Math.abs(Math.sin(index * 1.7) * Math.cos(index * 0.23)) * 25;
  bar.style.height = `${height}px`;
  waveform.appendChild(bar);
}

applyMoment(0);
