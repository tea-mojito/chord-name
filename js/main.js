import { initMIDI, setInputFilter, setChannelFilter, panic as midiPanic } from "./midi.js";
import { detectChords, setKeyState } from "./chordRecognizer.js";
import { formatChordDisplayName, noteNameToPC, setKeySignaturePreference } from "./constants.js";
import { ensureAudioStarted, setSynthType, setMasterVolume, startNote, stopNote, allNotesOff } from "./audioEngine.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const STORAGE_KEYS = {
  keySel: "mvp:key_sel",
  lock: "mvp:candidate_lock",
  labelPreset: "mvp:label_preset",
  wave: "mvp:wave",
  volume: "mvp:volume",
  mute: "mvp:mute",
  showTones: "mvp:show_tones",
  showMeta: "mvp:show_meta",
  showHeld: "mvp:show_held",
  showHist: "mvp:show_hist",
  showPiano: "mvp:show_piano",
  pianoRange: "mvp:piano_range"
};

const midiStatusText = document.getElementById("midiStatusText");
const midiInputSel = document.getElementById("midiInputSel");
const midiChSel = document.getElementById("midiChSel");
const midiBtn = document.getElementById("midiBtn");
const panicBtn = document.getElementById("panicBtn");
const togglePanelBtn = document.getElementById("togglePanelBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const keyMajorSel = document.getElementById("keyMajorSel");
const keyMinorSel = document.getElementById("keyMinorSel");
const labelPresetSel = document.getElementById("labelPresetSel");
const waveSel = document.getElementById("waveSel");
const volEl = document.getElementById("vol");
const muteBtn = document.getElementById("muteBtn");
const lockBtn = document.getElementById("lockBtn");
const showTonesSel = document.getElementById("showTonesSel");
const showMetaSel = document.getElementById("showMetaSel");
const showHeldSel = document.getElementById("showHeldSel");
const showHistSel = document.getElementById("showHistSel");
const showPianoSel = document.getElementById("showPianoSel");
const showPianoRangeSel = document.getElementById("showPianoRangeSel");
const controlPanelEl = document.querySelector(".control-panel");
const pianoWrapperEl = document.getElementById("pianoWrapper");
const heldNotesEl = document.getElementById("heldNotes");
const candidateListEl = document.getElementById("candidateList");
const pianoKeyboardEl = document.getElementById("pianoKeyboard");
const keyIndicatorEl = document.getElementById("keyIndicator");

const heldNotes = new Set();
let isLocked = false;
let lockedCandidates = [];

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
let candidateHistory = [];
let lastTopCandidateName = null;
let showHist = true;
let showPiano = true;
let pianoRange = "normal";
let historyTimer = null;
const HISTORY_DEBOUNCE_MS = 255;

// Piano constants
const PIANO_WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);

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

function createCandidateCard(item, isHistory = false) {
  const card = document.createElement("article");
  const matchClass = item.exact ? "match-exact" : "match-partial";
  card.className = isHistory
    ? "candidate-card match-exact card-history"
    : `candidate-card ${matchClass}`;

  const name = document.createElement("h3");
  name.className = "candidate-name";
  name.textContent = formatChordDisplayName(item.name, chordLabelPreset);

  const tones = document.createElement("div");
  tones.className = "candidate-tones";
  const heldPcs = new Set([...heldNotes].map(pc));
  const optTonePCsSet = new Set(item.optTonePCs || []);
  const toneNames = item.tones || [];
  toneNames.forEach((toneName, index) => {
    const part = document.createElement("span");
    part.textContent = toneName;
    if (isHistory) {
      part.className = "tone-history";
    } else {
      let tonePc = null;
      try { tonePc = noteNameToPC(toneName); } catch { tonePc = null; }
      if (tonePc != null) {
        if (heldPcs.has(tonePc)) {
          part.className = optTonePCsSet.has(tonePc) ? "tone-held-opt" : "tone-held"; // 水色: オプション音を押している / 青: 必須音を押している
        } else if (optTonePCsSet.has(tonePc)) {
          part.className = "tone-missing";       // 赤: オプション音（relaxed含む）、押していない
        } else {
          part.className = "tone-optional-miss"; // 灰: 必須音、押していない
        }
      }
    }
    tones.appendChild(part);
    if (index < toneNames.length - 1) {
      tones.append("・");
    }
  });

  const meta = document.createElement("div");
  meta.className = "candidate-meta";
  const metaGrid = document.createElement("div");
  metaGrid.className = "meta-grid";
  for (const r of (item.scoreBreakdown || [])) {
    const lEl = document.createElement("div"); lEl.textContent = r.label;
    const dEl = document.createElement("div"); dEl.textContent = r.detail; dEl.className = "meta-detail";
    const vEl = document.createElement("div"); vEl.textContent = (r.value > 0 ? "+" : "") + r.value; vEl.className = "meta-value";
    metaGrid.append(lEl, dEl, vEl);
  }
  const sep = document.createElement("div"); sep.className = "meta-sep-row";
  const tLabel = document.createElement("div"); tLabel.textContent = "total"; tLabel.className = "meta-total";
  const tEmpty = document.createElement("div");
  const tVal = document.createElement("div"); tVal.textContent = String(item.score); tVal.className = "meta-value meta-total";
  metaGrid.append(sep, tLabel, tEmpty, tVal);
  meta.appendChild(metaGrid);

  card.append(name, tones, meta);
  return card;
}

function renderCandidates(list) {
  candidateListEl.innerHTML = "";
  const hasHistory = showHist && candidateHistory.length > 0;

  if (!list.length && !hasHistory) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "-";
    candidateListEl.appendChild(empty);
    return;
  }

  list.slice(0, 12).forEach((item) => {
    candidateListEl.appendChild(createCandidateCard(item, false));
  });

  if (showHist && candidateHistory.length > 0) {
    const sep = document.createElement("div");
    sep.className = "history-sep";
    candidateListEl.appendChild(sep);
    candidateHistory.forEach((item) => {
      candidateListEl.appendChild(createCandidateCard(item, true));
    });
  }
}

function getCandidatesFromHeld() {
  const pcs = new Set([...heldNotes].map(pc));
  if (!pcs.size) return [];
  return detectChords(pcs);
}

function updateHistory(candidates) {
  if (!candidates.length) return;
  const top = candidates[0];
  if (top.name !== lastTopCandidateName) {
    candidateHistory.unshift(top);
    lastTopCandidateName = top.name;
  }
}

function cancelHistoryTimer() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
  }
}

function scheduleHistoryUpdate() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    const liveCandidates = getCandidatesFromHeld();
    const exactCandidates = liveCandidates.filter((c) => c.exact);
    if (exactCandidates.length) {
      updateHistory(exactCandidates);
      renderCandidates(stickyRenderedCandidates);
    }
  }, HISTORY_DEBOUNCE_MS);
}

function clearHistory() {
  candidateHistory = [];
  lastTopCandidateName = null;
  if (isLocked) {
    renderCandidates(lockedCandidates);
  } else {
    renderCandidates(stickyRenderedCandidates);
  }
}

function applyShowPiano(show) {
  showPiano = !!show;
  if (showPianoSel) showPianoSel.value = show ? "on" : "off";
  if (pianoWrapperEl) pianoWrapperEl.hidden = !show;
  document.body.classList.toggle("piano-visible", show);
  localStorage.setItem(STORAGE_KEYS.showPiano, show ? "on" : "off");
}

function applyPianoRange(range) {
  pianoRange = range === "wide" ? "wide" : "normal";
  if (showPianoRangeSel) showPianoRangeSel.value = pianoRange;
  localStorage.setItem(STORAGE_KEYS.pianoRange, pianoRange);
  buildPianoKeyboard();
  updatePianoHighlight();
}

function applyShowHist(show) {
  showHist = !!show;
  if (showHistSel) showHistSel.value = show ? "on" : "off";
  localStorage.setItem(STORAGE_KEYS.showHist, show ? "on" : "off");
  if (isLocked) {
    renderCandidates(lockedCandidates);
  } else {
    renderCandidates(stickyRenderedCandidates);
  }
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
    renderCandidates(lockedCandidates);
    return;
  }

  const heldCount = heldNotes.size;
  const isReleasing = heldCount < lastHeldCount;
  lastHeldCount = heldCount;

  if (noteOffDebouncing) return;
  if (isReleasing && hasCandidates) {
    renderCandidates(stickyRenderedCandidates);
    return;
  }
  if (heldCount < 3) {
    if (hasCandidates) {
      renderCandidates(stickyRenderedCandidates);
      return;
    }
    cancelHistoryTimer();
    renderNoCandidates();
    stickyRenderedCandidates = [];
    hasCandidates = false;
    return;
  }

  const liveCandidates = getCandidatesFromHeld();
  const exactCandidates = liveCandidates.filter((c) => c.exact);
  if (exactCandidates.length) {
    scheduleHistoryUpdate();
    renderCandidates(exactCandidates);
    stickyRenderedCandidates = exactCandidates.slice();
    hasCandidates = true;
    return;
  }

  cancelHistoryTimer();
  renderNoCandidates();
  stickyRenderedCandidates = [];
  hasCandidates = false;
}

function setLockState(next) {
  isLocked = !!next;
  lockBtn?.classList.toggle("active", isLocked);
  lockBtn?.setAttribute("aria-pressed", String(isLocked));
  if (isLocked) {
    lockedCandidates = getCandidatesFromHeld().filter((c) => c.exact);
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
    setKeyState({ keySignaturePref: null, neutralKeyBase: null, keyTonicPC: null, keyMode: null, keySelMode: 'manual', currentKeyName: null, currentKeyMode: null });
    localStorage.removeItem(STORAGE_KEYS.keySel);
    syncKeySelectUI("");
    if (keyIndicatorEl) keyIndicatorEl.textContent = "key:none";
    refreshCandidates();
    return;
  }

  const [name, mode] = v.split(":");
  const keyModeStr = mode === "min" ? "min_nat" : "maj";
  const { keySignaturePref, neutralKeyBase } = setKeySignaturePreference(name, keyModeStr);
  setKeyState({ keySignaturePref, neutralKeyBase, keyTonicPC: noteNameToPC(name), keyMode: keyModeStr, keySelMode: 'manual', currentKeyName: name, currentKeyMode: mode });
  localStorage.setItem(STORAGE_KEYS.keySel, v);
  syncKeySelectUI(v);
  if (keyIndicatorEl) keyIndicatorEl.textContent = `key:${name}${mode === "min" ? "m" : ""}`;
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

function buildPianoKeyboard() {
  if (!pianoKeyboardEl) return;
  const pianoStart = pianoRange === "wide" ? 24 : 36;
  const pianoEnd = pianoRange === "wide" ? 108 : 96;
  let totalWhite = 0;
  for (let midi = pianoStart; midi <= pianoEnd; midi++) {
    if (PIANO_WHITE_PC.has(((midi % 12) + 12) % 12)) totalWhite++;
  }
  pianoKeyboardEl.innerHTML = "";
  let whiteIndex = 0;
  for (let midi = pianoStart; midi <= pianoEnd; midi++) {
    const p = ((midi % 12) + 12) % 12;
    const key = document.createElement("div");
    key.dataset.midi = String(midi);
    if (PIANO_WHITE_PC.has(p)) {
      key.className = "piano-key piano-white";
      key.style.left = `${(whiteIndex / totalWhite) * 100}%`;
      key.style.width = `${(1 / totalWhite) * 100}%`;
      if (p === 0) {
        const label = document.createElement("span");
        label.className = "piano-key-label";
        label.textContent = `C${Math.floor(midi / 12) - 1}`;
        key.appendChild(label);
      }
      whiteIndex++;
    } else {
      const blackWidth = (0.6 / totalWhite) * 100;
      const center = (whiteIndex / totalWhite) * 100;
      key.className = "piano-key piano-black";
      key.style.left = `${center - blackWidth / 2}%`;
      key.style.width = `${blackWidth}%`;
    }
    pianoKeyboardEl.appendChild(key);
  }
}

function updatePianoHighlight() {
  if (!pianoKeyboardEl) return;
  pianoKeyboardEl.querySelectorAll(".piano-key").forEach((key) => {
    const midi = Number(key.dataset.midi);
    key.classList.toggle("piano-key-held", heldNotes.has(midi));
  });
}

function onNoteOn(midi) {
  clearNoteOffDebounce();
  ensureAudioStarted();
  startNote(midi, 0.9);
  heldNotes.add(midi);
  renderHeldNotes();
  updatePianoHighlight();
  if (!isLocked) {
    refreshCandidates();
  }
}

function onNoteOff(midi) {
  stopNote(midi);
  heldNotes.delete(midi);
  renderHeldNotes();
  updatePianoHighlight();
  if (!isLocked) {
    scheduleNoteOffUIUpdate();
  }
}

function onPanic() {
  clearNoteOffDebounce();
  cancelHistoryTimer();
  allNotesOff();
  heldNotes.clear();
  renderHeldNotes();
  updatePianoHighlight();
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
  showHistSel?.addEventListener("change", (e) => {
    applyShowHist(e.target.value === "on");
  });
  showPianoSel?.addEventListener("change", (e) => {
    applyShowPiano(e.target.value === "on");
  });
  showPianoRangeSel?.addEventListener("change", (e) => {
    applyPianoRange(e.target.value);
  });

  clearHistoryBtn?.addEventListener("click", () => {
    clearHistory();
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

  const savedShowHist = localStorage.getItem(STORAGE_KEYS.showHist);
  applyShowHist(savedShowHist !== "off");

  const savedShowPiano = localStorage.getItem(STORAGE_KEYS.showPiano);
  applyShowPiano(savedShowPiano !== "off");

  const savedPianoRange = localStorage.getItem(STORAGE_KEYS.pianoRange) || "normal";
  applyPianoRange(savedPianoRange);
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
