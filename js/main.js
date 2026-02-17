import { initMIDI, setInputFilter, setChannelFilter, panic as midiPanic } from "./midi.js";
import { detectChords } from "./chordRecognizer.js";
import { formatChordDisplayName, noteNameToPC } from "./constants.js";
import { ensureAudioStarted, setSynthType, setMasterVolume, startNote, stopNote, allNotesOff } from "./audioEngine.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const STORAGE_KEYS = {
  keySel: "mvp:key_sel",
  filterMode: "mvp:filter_mode",
  lock: "mvp:candidate_lock",
  labelPreset: "mvp:label_preset",
  wave: "mvp:wave",
  volume: "mvp:volume",
  mute: "mvp:mute",
  showTones: "mvp:show_tones",
  showMeta: "mvp:show_meta",
  showHeld: "mvp:show_held"
};

const midiStatusText = document.getElementById("midiStatusText");
const midiInputSel = document.getElementById("midiInputSel");
const midiChSel = document.getElementById("midiChSel");
const midiBtn = document.getElementById("midiBtn");
const panicBtn = document.getElementById("panicBtn");
const togglePanelBtn = document.getElementById("togglePanelBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const keyMajorSel = document.getElementById("keyMajorSel");
const keyMinorSel = document.getElementById("keyMinorSel");
const candidateFilterSel = document.getElementById("candidateFilterSel");
const labelPresetSel = document.getElementById("labelPresetSel");
const waveSel = document.getElementById("waveSel");
const volEl = document.getElementById("vol");
const muteBtn = document.getElementById("muteBtn");
const lockBtn = document.getElementById("lockBtn");
const showTonesSel = document.getElementById("showTonesSel");
const showMetaSel = document.getElementById("showMetaSel");
const showHeldSel = document.getElementById("showHeldSel");
const controlPanelEl = document.querySelector(".control-panel");
const heldNotesEl = document.getElementById("heldNotes");
const candidateListEl = document.getElementById("candidateList");

const heldNotes = new Set();
let filterMode = "all";
let isLocked = false;
let lockedCandidates = [];
let keyName = null;
let keyMode = null;
let chordLabelPreset = "jazz";
let stickyRenderedCandidates = [];
let hasCandidates = false;
let lastHeldCount = 0;
let noteOffUiTimer = null;
let noteOffDebouncing = false;
const NOTE_OFF_UI_DEBOUNCE_MS = 70;
let isPanelOpen = false;
let isMuted = false;
let lastVolumeBeforeMute = 1;

function pc(midi) {
  return ((midi % 12) + 12) % 12;
}

function midiToNoteLabel(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = pc(midi);
  if (pitchClass === 1) return `C#/Db${octave}`;
  if (pitchClass === 3) return `D#/Eb${octave}`;
  if (pitchClass === 6) return `F#/Gb${octave}`;
  if (pitchClass === 8) return `G#/Ab${octave}`;
  if (pitchClass === 10) return `A#/Bb${octave}`;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

function renderHeldNotes() {
  const notes = [...heldNotes].sort((a, b) => a - b);
  heldNotesEl.innerHTML = notes.length ? notes.map(midiToNoteLabel).join("&emsp;") : "-";
}

function renderCandidates(list) {
  candidateListEl.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "-";
    candidateListEl.appendChild(empty);
    return;
  }

  list.slice(0, 12).forEach((item) => {
    const card = document.createElement("article");
    const matchClass = item.exact ? "match-exact" : "match-partial";
    card.className = "candidate-card " + matchClass;

    const name = document.createElement("h3");
    name.className = "candidate-name";
    name.textContent = formatChordDisplayName(item.name, chordLabelPreset);

    const tones = document.createElement("div");
    tones.className = "candidate-tones";
    const heldPcs = new Set([...heldNotes].map(pc));
    const toneNames = item.tones || [];
    toneNames.forEach((toneName, index) => {
      const part = document.createElement("span");
      part.textContent = toneName;
      let tonePc = null;
      try {
        tonePc = noteNameToPC(toneName);
      } catch {
        tonePc = null;
      }
      if (tonePc != null && !heldPcs.has(tonePc)) {
        part.className = "tone-missing";
      }
      tones.appendChild(part);
      if (index < toneNames.length - 1) {
        tones.append("・");
      }
    });

    const meta = document.createElement("div");
    meta.className = "candidate-meta";
    meta.textContent = `match:${item.exact ? "exact" : (item.optMiss ? "opt-miss" : "partial")} / score:${item.score}`;

    card.append(name, tones, meta);
    candidateListEl.appendChild(card);
  });
}

function applyFilter(list) {
  return filterMode === "exact" ? list.filter((c) => c.exact) : list;
}

function getCandidatesFromHeld() {
  const pcs = new Set([...heldNotes].map(pc));
  if (!pcs.size) return [];
  return detectChords(pcs, null, null, keyName, keyMode);
}

function renderNoCandidates() {
  renderCandidates([]);
}

function clearNoteOffDebounce() {
  if (!noteOffUiTimer) return;
  clearTimeout(noteOffUiTimer);
  noteOffUiTimer = null;
  noteOffDebouncing = false;
}

function scheduleNoteOffUIUpdate() {
  noteOffDebouncing = true;
  if (noteOffUiTimer) clearTimeout(noteOffUiTimer);
  noteOffUiTimer = setTimeout(() => {
    noteOffUiTimer = null;
    noteOffDebouncing = false;
    refreshCandidates();
  }, NOTE_OFF_UI_DEBOUNCE_MS);
}

function refreshCandidates() {
  if (isLocked) {
    renderCandidates(applyFilter(lockedCandidates));
    return;
  }

  const heldCount = heldNotes.size;
  const isReleasing = heldCount < lastHeldCount;
  lastHeldCount = heldCount;

  if (noteOffDebouncing) return;
  if (isReleasing && hasCandidates) return;
  if (heldCount < 3) {
    if (hasCandidates) return;
    renderNoCandidates();
    stickyRenderedCandidates = [];
    hasCandidates = false;
    return;
  }

  const liveCandidates = getCandidatesFromHeld();
  const filtered = applyFilter(liveCandidates);
  if (filtered.length) {
    renderCandidates(filtered);
    stickyRenderedCandidates = filtered.slice();
    hasCandidates = true;
    return;
  }

  if (hasCandidates) {
    renderCandidates(stickyRenderedCandidates);
    return;
  }

  renderNoCandidates();
  stickyRenderedCandidates = [];
  hasCandidates = false;
}

function setFilterMode(mode) {
  filterMode = mode === "exact" ? "exact" : "all";
  if (candidateFilterSel) candidateFilterSel.value = filterMode;
  localStorage.setItem(STORAGE_KEYS.filterMode, filterMode);
  refreshCandidates();
}

function setLockState(next) {
  isLocked = !!next;
  lockBtn?.classList.toggle("active", isLocked);
  lockBtn?.setAttribute("aria-pressed", String(isLocked));
  if (isLocked) {
    lockedCandidates = getCandidatesFromHeld().slice();
  }
  localStorage.setItem(STORAGE_KEYS.lock, isLocked ? "on" : "off");
  refreshCandidates();
}

function setChordLabelPreset(mode) {
  chordLabelPreset = mode === "general" ? "general" : "jazz";
  if (labelPresetSel) labelPresetSel.value = chordLabelPreset;
  localStorage.setItem(STORAGE_KEYS.labelPreset, chordLabelPreset);
  refreshCandidates();
}

function applyShowTones(show) {
  candidateListEl?.classList.toggle("hide-tones", !show);
  if (showTonesSel) showTonesSel.value = show ? "on" : "off";
  localStorage.setItem(STORAGE_KEYS.showTones, show ? "on" : "off");
}

function applyShowMeta(show) {
  candidateListEl?.classList.toggle("hide-meta", !show);
  if (showMetaSel) showMetaSel.value = show ? "on" : "off";
  localStorage.setItem(STORAGE_KEYS.showMeta, show ? "on" : "off");
}

function applyShowHeld(show) {
  heldNotesEl?.classList.toggle("hide-held", !show);
  if (showHeldSel) showHeldSel.value = show ? "on" : "off";
  localStorage.setItem(STORAGE_KEYS.showHeld, show ? "on" : "off");
}

function applyMuteState(muted) {
  isMuted = !!muted;
  muteBtn?.classList.toggle("is-muted", isMuted);
  muteBtn?.setAttribute("aria-pressed", String(isMuted));
  localStorage.setItem(STORAGE_KEYS.mute, isMuted ? "on" : "off");
}

function syncKeySelectUI(value) {
  if (!keyMajorSel || !keyMinorSel) return;
  if (!value) {
    keyMajorSel.value = "";
    keyMinorSel.value = "";
    return;
  }
  if (value.endsWith(":maj")) {
    keyMajorSel.value = value;
    keyMinorSel.value = "";
    return;
  }
  if (value.endsWith(":min")) {
    keyMajorSel.value = "";
    keyMinorSel.value = value;
  }
}

function applyKeySelection(value) {
  const v = value || "";
  if (!v) {
    keyName = null;
    keyMode = null;
    localStorage.removeItem(STORAGE_KEYS.keySel);
    syncKeySelectUI("");
    refreshCandidates();
    return;
  }

  const [name, mode] = v.split(":");
  keyName = name;
  keyMode = mode === "min" ? "min_nat" : "maj";
  localStorage.setItem(STORAGE_KEYS.keySel, v);
  syncKeySelectUI(v);
  refreshCandidates();
}

function applyKeySelectionFromUI(source) {
  if (!keyMajorSel || !keyMinorSel) return;

  if (source === "major") {
    if (!keyMajorSel.value) {
      keyMinorSel.value = "";
      applyKeySelection("");
      return;
    }
    keyMinorSel.value = "";
    applyKeySelection(keyMajorSel.value);
    return;
  }

  if (!keyMinorSel.value) {
    keyMajorSel.value = "";
    applyKeySelection("");
    return;
  }
  keyMajorSel.value = "";
  applyKeySelection(keyMinorSel.value);
}

function onNoteOn(midi) {
  clearNoteOffDebounce();
  ensureAudioStarted();
  startNote(midi, 0.9);
  heldNotes.add(midi);
  renderHeldNotes();
  if (!isLocked) {
    refreshCandidates();
  }
}

function onNoteOff(midi) {
  stopNote(midi);
  heldNotes.delete(midi);
  renderHeldNotes();
  if (!isLocked) {
    scheduleNoteOffUIUpdate();
  }
}

function onPanic() {
  clearNoteOffDebounce();
  allNotesOff();
  heldNotes.clear();
  renderHeldNotes();
  if (!isLocked) {
    refreshCandidates();
  }
}

function installEvents() {
  midiBtn?.addEventListener("click", async () => {
    await ensureAudioStarted();
    await initMIDI({
      statusEl: midiStatusText,
      inputSel: midiInputSel,
      onNoteOn,
      onNoteOff,
      onPanic
    });
  });

  midiInputSel?.addEventListener("change", (e) => setInputFilter(e.target.value));
  midiChSel?.addEventListener("change", (e) => setChannelFilter(e.target.value));

  panicBtn?.addEventListener("click", () => {
    midiPanic();
  });

  togglePanelBtn?.addEventListener("click", () => {
    isPanelOpen = !isPanelOpen;
    controlPanelEl?.classList.toggle("collapsed", !isPanelOpen);
  });

  keyMajorSel?.addEventListener("change", () => applyKeySelectionFromUI("major"));
  keyMinorSel?.addEventListener("change", () => applyKeySelectionFromUI("minor"));

  candidateFilterSel?.addEventListener("change", (e) => {
    setFilterMode(e.target.value);
  });
  labelPresetSel?.addEventListener("change", (e) => {
    setChordLabelPreset(e.target.value);
  });

  showTonesSel?.addEventListener("change", (e) => {
    applyShowTones(e.target.value === "on");
  });
  showMetaSel?.addEventListener("change", (e) => {
    applyShowMeta(e.target.value === "on");
  });
  showHeldSel?.addEventListener("change", (e) => {
    applyShowHeld(e.target.value === "on");
  });

  waveSel?.addEventListener("change", (e) => {
    const value = e.target.value || "triangle";
    setSynthType(value);
    localStorage.setItem(STORAGE_KEYS.wave, value);
  });

  volEl?.addEventListener("input", (e) => {
    const value = Math.max(0, Math.min(1, Number(e.target.value)));
    if (!isMuted) lastVolumeBeforeMute = value;
    setMasterVolume(value);
    localStorage.setItem(STORAGE_KEYS.volume, String(value));
  });

  muteBtn?.addEventListener("click", () => {
    if (!isMuted) {
      const current = Math.max(0, Math.min(1, Number(volEl?.value ?? 1)));
      lastVolumeBeforeMute = current;
      if (volEl) volEl.value = "0";
      setMasterVolume(0);
      applyMuteState(true);
      return;
    }
    const restore = Math.max(0, Math.min(1, Number(lastVolumeBeforeMute || 1)));
    if (volEl) volEl.value = String(restore);
    setMasterVolume(restore);
    localStorage.setItem(STORAGE_KEYS.volume, String(restore));
    applyMuteState(false);
  });

  lockBtn?.addEventListener("click", () => {
    setLockState(!isLocked);
  });

  fullscreenBtn?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      // ignore
    }
  });

  document.addEventListener("fullscreenchange", updateFullscreenButtonVisibility);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButtonVisibility);
  window.addEventListener("resize", updateFullscreenButtonVisibility);
}

function updateFullscreenButtonVisibility() {
  if (!fullscreenBtn) return;
  const apiFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const displayModeFullscreen = window.matchMedia?.("(display-mode: fullscreen)").matches;
  const iosStandalone = window.navigator.standalone === true;
  const browserFullscreen =
    Math.abs(window.innerHeight - window.screen.height) <= 1 &&
    Math.abs(window.innerWidth - window.screen.width) <= 1;
  fullscreenBtn.hidden = apiFullscreen || displayModeFullscreen || iosStandalone || browserFullscreen;
}

function restoreSettings() {
  const savedKey = localStorage.getItem(STORAGE_KEYS.keySel) || "";
  applyKeySelection(savedKey);

  const savedFilter = localStorage.getItem(STORAGE_KEYS.filterMode) || "exact";
  setFilterMode(savedFilter);

  localStorage.removeItem(STORAGE_KEYS.lock);
  setLockState(false);

  const savedPreset = localStorage.getItem(STORAGE_KEYS.labelPreset) || "jazz";
  setChordLabelPreset(savedPreset);

  const savedWave = localStorage.getItem(STORAGE_KEYS.wave) || "triangle";
  if (waveSel) waveSel.value = savedWave;
  setSynthType(savedWave);

  const rawVolume = Number(localStorage.getItem(STORAGE_KEYS.volume));
  const volume = Number.isFinite(rawVolume) ? Math.max(0, Math.min(1, rawVolume)) : 1;
  if (volEl) volEl.value = String(volume);
  lastVolumeBeforeMute = volume > 0 ? volume : 1;
  setMasterVolume(volume);

  const savedMute = localStorage.getItem(STORAGE_KEYS.mute) === "on";
  applyMuteState(savedMute);
  if (savedMute) {
    if (volEl) volEl.value = "0";
    setMasterVolume(0);
  }

  const savedShowTones = localStorage.getItem(STORAGE_KEYS.showTones);
  applyShowTones(savedShowTones !== "off");

  const savedShowMeta = localStorage.getItem(STORAGE_KEYS.showMeta);
  applyShowMeta(savedShowMeta === "on");

  const savedShowHeld = localStorage.getItem(STORAGE_KEYS.showHeld);
  applyShowHeld(savedShowHeld !== "off");
}

function init() {
  controlPanelEl?.classList.toggle("collapsed", !isPanelOpen);
  installEvents();
  updateFullscreenButtonVisibility();
  restoreSettings();
  setInputFilter(midiInputSel?.value || "");
  setChannelFilter(midiChSel?.value || "0");

  if (!window.isSecureContext) {
    midiStatusText.textContent = "非セキュア環境です（HTTPS or localhost で開いてください）";
  } else {
    initMIDI({
      statusEl: midiStatusText,
      inputSel: midiInputSel,
      onNoteOn,
      onNoteOff,
      onPanic
    });
  }

  renderHeldNotes();
  refreshCandidates();
}

init();
