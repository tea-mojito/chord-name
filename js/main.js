import { initMIDI, setInputFilter, setChannelFilter, panic as midiPanic } from "./midi.js";
import { detectChords, setKeyState } from "./chordRecognizer.js";
import { formatChordDisplayName, noteNameToPC, setKeySignaturePreference } from "./constants.js";
import { ensureAudioStarted, setSynthType, setMasterVolume, startNote, stopNote, allNotesOff, loadVoiceSamples } from "./audioEngine.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const STORAGE_KEYS = {
  keySel: "mvp:key_sel",
  lock: "mvp:candidate_lock",
  midiInput: "mvp:midi_input",
  labelPreset: "mvp:label_preset",
  wave: "mvp:wave",
  volume: "mvp:volume",
  mute: "mvp:mute",
  showTones: "mvp:show_tones",
  showMeta: "mvp:show_meta",
  showHeld: "mvp:show_held",
  showHist: "mvp:show_hist",
  showLoose: "mvp:show_loose",
  showPiano: "mvp:show_piano",
  pianoRange: "mvp:piano_range",
  fontSize: "mvp:font_scale"
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
const showLooseSel = document.getElementById("showLooseSel");
const showPianoSel = document.getElementById("showPianoSel");
const showPianoRangeSel = document.getElementById("showPianoRangeSel");
const controlPanelEl = document.querySelector(".control-panel");
const pianoWrapperEl = document.getElementById("pianoWrapper");
const heldNotesEl = document.getElementById("heldNotes");
const candidateListEl = document.getElementById("candidateList");
const pianoKeyboardEl = document.getElementById("pianoKeyboard");
const keyIndicatorEl = document.getElementById("keyIndicator");
const keyPickerPopupEl = document.getElementById("keyPickerPopup");
const fontSizeSlider = document.getElementById("fontSizeSlider");

const heldNotes = new Set();
let isLocked = false;
let lockedCandidates = [];

let chordLabelPreset = "general";
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
let showLoose = true;
let showPiano = true;
let pianoRange = "normal";
let historyTimer = null;
const HISTORY_DEBOUNCE_MS = 255;

// Piano constants
const PIANO_WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);
const pianoPointerToMidi = new Map();
const pianoVirtualHoldCounts = new Map();
const keyboardPressedCodes = new Set();
const KEYBOARD_CODE_TO_MIDI = new Map([
  // C4 lane (JIS physical keys)
  ["KeyQ", 60],        // C4
  ["Digit2", 61],      // C#4
  ["KeyW", 62],        // D4
  ["Digit3", 63],      // D#4
  ["KeyE", 64],        // E4
  ["KeyR", 65],        // F4
  ["Digit5", 66],      // F#4
  ["KeyT", 67],        // G4
  ["Digit6", 68],      // G#4
  ["KeyY", 69],        // A4
  ["Digit7", 70],      // A#4
  ["KeyU", 71],        // B4
  ["KeyI", 72],        // C5
  ["Digit9", 73],      // C#5
  ["KeyO", 74],        // D5
  ["Digit0", 75],      // D#5
  ["KeyP", 76],        // E5
  ["BracketLeft", 77], // F5  (@)
  ["Equal", 78],       // F#5 (^)
  ["BracketRight", 79],// G5  ([)
  ["IntlYen", 80],     // G#5 (\)
  // C3 lane (JIS physical keys)
  ["KeyZ", 48],        // C3
  ["KeyS", 49],        // C#3
  ["KeyX", 50],        // D3
  ["KeyD", 51],        // D#3
  ["KeyC", 52],        // E3
  ["KeyV", 53],        // F3
  ["KeyG", 54],        // F#3
  ["KeyB", 55],        // G3
  ["KeyH", 56],        // G#3
  ["KeyN", 57],        // A3
  ["KeyJ", 58],        // A#3
  ["KeyM", 59],        // B3
  ["Comma", 60],       // C4
  ["KeyL", 61],        // C#4
  ["Period", 62],      // D4
  ["Semicolon", 63],   // D#4
  ["Slash", 64],       // E4
  ["IntlRo", 65],      // F4  (\)
  ["Backslash", 66],   // F#4 (])
  ["ShiftRight", 67]   // G4
]);

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
  const matchClass =
    item.candidateKind === "exact"
      ? "match-exact"
      : item.candidateKind === "loose"
        ? "match-loose"
        : "match-partial";
  card.className = isHistory
    ? "candidate-card match-exact card-history"
    : `candidate-card ${matchClass}`;

  const name = document.createElement("h3");
  name.className = "candidate-name";
  const chordLabel = formatChordDisplayName(item.name, chordLabelPreset);
  name.append(chordLabel);

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

function createGroupMarker(iconName, markerClass = "") {
  const marker = document.createElement("div");
  marker.className = `candidate-group-marker ${markerClass}`.trim();
  const icon = document.createElement("span");
  icon.className = "material-symbols-rounded candidate-group-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = iconName;
  marker.appendChild(icon);
  return marker;
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

  const mainList = list.slice(0, 12);
  const primaryList = mainList.filter((item) => item.candidateKind !== "loose");
  const looseList = mainList.filter((item) => item.candidateKind === "loose");

  primaryList.forEach((item) => {
    candidateListEl.appendChild(createCandidateCard(item, false));
  });

  if (looseList.length > 0) {
    candidateListEl.appendChild(createGroupMarker("help", "loose-marker"));
    looseList.forEach((item) => {
      candidateListEl.appendChild(createCandidateCard(item, false));
    });
  }

  if (showHist && candidateHistory.length > 0) {
    const sep = document.createElement("div");
    sep.className = "history-sep";
    candidateListEl.appendChild(sep);
    candidateListEl.appendChild(createGroupMarker("schedule", "history-marker"));
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

function buildDisplayCandidates(allCandidates) {
  const filtered = allCandidates.filter((c) => (c.extras || []).length === 0);
  const exact = [];
  const optMiss = [];
  const loose = [];

  for (const c of filtered) {
    if (c.exact) {
      exact.push({ ...c, candidateKind: "exact" });
    } else if (c.optMiss) {
      optMiss.push({ ...c, candidateKind: "opt-miss" });
    } else {
      loose.push({ ...c, candidateKind: "loose" });
    }
  }

  if (!showLoose) return exact.concat(optMiss);
  return exact.concat(optMiss, loose);
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
    const exactCandidates = liveCandidates.filter((c) => c.exact && (c.extras || []).length === 0);
    if (exactCandidates.length) {
      updateHistory(exactCandidates);
      renderCandidates(stickyRenderedCandidates);
    }
  }, HISTORY_DEBOUNCE_MS);
}

function clearHistory() {
  candidateHistory = [];
  lastTopCandidateName = null;
  cancelHistoryTimer();
  stickyRenderedCandidates = [];
  lockedCandidates = [];
  hasCandidates = false;
  renderCandidates([]);
}

function applyFontScale(value) {
  const v = Math.max(0.5, Math.min(2, Number(value) || 1));
  const candidateMinWidth = Math.max(110, Math.min(220, Math.round(160 * v)));
  document.documentElement.style.setProperty("--chord-font-scale", String(v));
  document.documentElement.style.setProperty("--candidate-min-width", `${candidateMinWidth}px`);
  if (fontSizeSlider) fontSizeSlider.value = String(v);
  localStorage.setItem(STORAGE_KEYS.fontSize, String(v));
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

function applyShowLoose(show) {
  showLoose = !!show;
  if (showLooseSel) showLooseSel.value = show ? "on" : "off";
  localStorage.setItem(STORAGE_KEYS.showLoose, show ? "on" : "off");
  if (isLocked) {
    lockedCandidates = buildDisplayCandidates(getCandidatesFromHeld());
    renderCandidates(lockedCandidates);
  } else {
    refreshCandidates();
  }
}

function renderNoCandidates() {
  renderCandidates([]);
}

function applySavedMidiInputSelection() {
  const savedInputId = localStorage.getItem(STORAGE_KEYS.midiInput) || "";
  if (!midiInputSel) return;
  if (!savedInputId) {
    midiInputSel.value = "";
    setInputFilter("");
    return;
  }
  const exists = [...midiInputSel.options].some((opt) => opt.value === savedInputId);
  if (!exists) return;
  midiInputSel.value = savedInputId;
  setInputFilter(savedInputId);
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
  if (heldCount < 2) {
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
  const exactCandidates = liveCandidates.filter((c) => c.exact && (c.extras || []).length === 0);
  const displayCandidates = buildDisplayCandidates(liveCandidates);
  if (exactCandidates.length) {
    scheduleHistoryUpdate();
    renderCandidates(displayCandidates);
    stickyRenderedCandidates = displayCandidates.slice();
    hasCandidates = displayCandidates.length > 0;
    return;
  }

  if (displayCandidates.length) {
    cancelHistoryTimer();
    renderCandidates(displayCandidates);
    stickyRenderedCandidates = displayCandidates.slice();
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
    lockedCandidates = buildDisplayCandidates(getCandidatesFromHeld());
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
    if (keyIndicatorEl) keyIndicatorEl.textContent = "KEY:none";
    refreshCandidates();
    return;
  }

  const [name, mode] = v.split(":");
  const keyModeStr = mode === "min" ? "min_nat" : "maj";
  const { keySignaturePref, neutralKeyBase } = setKeySignaturePreference(name, keyModeStr);
  setKeyState({ keySignaturePref, neutralKeyBase, keyTonicPC: noteNameToPC(name), keyMode: keyModeStr, keySelMode: 'manual', currentKeyName: name, currentKeyMode: mode });
  localStorage.setItem(STORAGE_KEYS.keySel, v);
  syncKeySelectUI(v);
  if (keyIndicatorEl) keyIndicatorEl.textContent = `KEY:${name}${mode === "min" ? "m" : ""}`;
  refreshCandidates();
}

function applyKeySelectionFromUI(source) {
  if (!keyMajorSel || !keyMinorSel) return;

  if (source === "major") {
    if (!keyMajorSel.value) {
      keyMinorSel.value = "";
      applyKeySelection("");
    } else {
      keyMinorSel.value = "";
      applyKeySelection(keyMajorSel.value);
    }
  } else {
    if (!keyMinorSel.value) {
      keyMajorSel.value = "";
      applyKeySelection("");
    } else {
      keyMajorSel.value = "";
      applyKeySelection(keyMinorSel.value);
    }
  }

  if (keyPickerPopupEl) keyPickerPopupEl.hidden = true;
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

function resolveKeyboardMidi(event) {
  if (KEYBOARD_CODE_TO_MIDI.has(event.code)) {
    return KEYBOARD_CODE_TO_MIDI.get(event.code);
  }

  // Fallback for environments where JIS-specific codes are unavailable.
  if (event.key === "\\") return 80;
  if (event.key === "¥") return 80;
  if (event.key === "]") return 66;
  return null;
}

function shouldIgnoreKeyboardEvent(event) {
  const target = event.target;
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function installComputerKeyboardEvents() {
  window.addEventListener("keydown", (event) => {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const midi = resolveKeyboardMidi(event);
    if (midi == null) return;
    event.preventDefault();
    if (event.repeat || keyboardPressedCodes.has(event.code)) return;
    keyboardPressedCodes.add(event.code);
    onNoteOn(midi);
  });

  window.addEventListener("keyup", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const midi = resolveKeyboardMidi(event);
    if (midi == null) return;
    event.preventDefault();
    if (!keyboardPressedCodes.has(event.code)) return;
    keyboardPressedCodes.delete(event.code);
    onNoteOff(midi);
  });

  window.addEventListener("blur", () => {
    const releasingCodes = [...keyboardPressedCodes];
    keyboardPressedCodes.clear();
    for (const code of releasingCodes) {
      const midi = KEYBOARD_CODE_TO_MIDI.get(code);
      if (midi != null) onNoteOff(midi);
    }
  });
}

function midiFromPianoKeyElement(el) {
  if (!el) return null;
  const midi = Number(el.dataset.midi);
  return Number.isFinite(midi) ? midi : null;
}

function findPianoKeyElementFromPoint(x, y) {
  if (!pianoKeyboardEl) return null;
  const target = document.elementFromPoint(x, y);
  if (!target) return null;
  const keyEl = target.closest?.(".piano-key");
  if (!keyEl || !pianoKeyboardEl.contains(keyEl)) return null;
  return keyEl;
}

function holdVirtualKey(midi) {
  const count = (pianoVirtualHoldCounts.get(midi) || 0) + 1;
  pianoVirtualHoldCounts.set(midi, count);
  if (count === 1) {
    onNoteOn(midi);
  }
}

function releaseVirtualKeyByMidi(midi) {
  const count = pianoVirtualHoldCounts.get(midi) || 0;
  if (count <= 1) {
    pianoVirtualHoldCounts.delete(midi);
    onNoteOff(midi);
    return;
  }
  pianoVirtualHoldCounts.set(midi, count - 1);
}

function pressVirtualKey(pointerId, midi) {
  const currentMidi = pianoPointerToMidi.get(pointerId);
  if (currentMidi === midi) return;
  if (currentMidi != null) {
    releaseVirtualKeyByMidi(currentMidi);
  }
  pianoPointerToMidi.set(pointerId, midi);
  holdVirtualKey(midi);
}

function releaseVirtualKeyByPointer(pointerId) {
  const midi = pianoPointerToMidi.get(pointerId);
  if (midi == null) return;
  pianoPointerToMidi.delete(pointerId);
  releaseVirtualKeyByMidi(midi);
}

function moveVirtualKey(pointerId, clientX, clientY) {
  if (!pianoPointerToMidi.has(pointerId)) return;
  const keyEl = findPianoKeyElementFromPoint(clientX, clientY);
  if (!keyEl) {
    releaseVirtualKeyByPointer(pointerId);
    return;
  }
  const midi = midiFromPianoKeyElement(keyEl);
  if (midi == null) {
    releaseVirtualKeyByPointer(pointerId);
    return;
  }
  pressVirtualKey(pointerId, midi);
}

function installPianoPointerEvents() {
  if (!pianoKeyboardEl) return;

  pianoKeyboardEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const keyEl = e.target.closest?.(".piano-key");
    const midi = midiFromPianoKeyElement(keyEl);
    if (midi == null) return;
    e.preventDefault();
    pressVirtualKey(e.pointerId, midi);
    try {
      pianoKeyboardEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  });

  pianoKeyboardEl.addEventListener("pointermove", (e) => {
    if (!pianoPointerToMidi.has(e.pointerId)) return;
    e.preventDefault();
    moveVirtualKey(e.pointerId, e.clientX, e.clientY);
  });

  const releaseByEvent = (e) => releaseVirtualKeyByPointer(e.pointerId);
  pianoKeyboardEl.addEventListener("pointerup", releaseByEvent);
  pianoKeyboardEl.addEventListener("pointercancel", releaseByEvent);
  pianoKeyboardEl.addEventListener("lostpointercapture", releaseByEvent);

  window.addEventListener("blur", () => {
    const pointerIds = [...pianoPointerToMidi.keys()];
    pointerIds.forEach((pointerId) => releaseVirtualKeyByPointer(pointerId));
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
  pianoPointerToMidi.clear();
  pianoVirtualHoldCounts.clear();
  keyboardPressedCodes.clear();
  allNotesOff();
  heldNotes.clear();
  renderHeldNotes();
  updatePianoHighlight();
  if (!isLocked) {
    refreshCandidates();
  }
}

function installEvents() {
  installPianoPointerEvents();
  installComputerKeyboardEvents();

  midiBtn?.addEventListener("click", async () => {
    await ensureAudioStarted();
    await initMIDI({
      statusEl: midiStatusText,
      inputSel: midiInputSel,
      onNoteOn,
      onNoteOff,
      onPanic
    });
    applySavedMidiInputSelection();
  });

  midiInputSel?.addEventListener("change", (e) => {
    const inputId = e.target.value || "";
    setInputFilter(inputId);
    if (inputId) localStorage.setItem(STORAGE_KEYS.midiInput, inputId);
    else localStorage.removeItem(STORAGE_KEYS.midiInput);
  });
  midiChSel?.addEventListener("change", (e) => setChannelFilter(e.target.value));

  panicBtn?.addEventListener("click", () => {
    midiPanic();
  });

  togglePanelBtn?.addEventListener("click", () => {
    isPanelOpen = !isPanelOpen;
    controlPanelEl?.classList.toggle("collapsed", !isPanelOpen);
  });

  keyIndicatorEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (keyPickerPopupEl) keyPickerPopupEl.hidden = !keyPickerPopupEl.hidden;
  });

  document.addEventListener("click", (e) => {
    if (keyPickerPopupEl && !keyPickerPopupEl.hidden) {
      if (!keyPickerPopupEl.contains(e.target) && e.target !== keyIndicatorEl) {
        keyPickerPopupEl.hidden = true;
      }
    }
    if (isPanelOpen && controlPanelEl && !controlPanelEl.contains(e.target) && !togglePanelBtn?.contains(e.target)) {
      isPanelOpen = false;
      controlPanelEl.classList.add("collapsed");
    }
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
  showLooseSel?.addEventListener("change", (e) => {
    applyShowLoose(e.target.value === "on");
  });
  showPianoSel?.addEventListener("change", (e) => {
    applyShowPiano(e.target.value === "on");
  });
  showPianoRangeSel?.addEventListener("change", (e) => {
    applyPianoRange(e.target.value);
  });

  fontSizeSlider?.addEventListener("input", (e) => {
    applyFontScale(e.target.value);
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

  const savedPreset = localStorage.getItem(STORAGE_KEYS.labelPreset) || "general";
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

  const savedShowLoose = localStorage.getItem(STORAGE_KEYS.showLoose);
  applyShowLoose(savedShowLoose !== "off");

  const savedShowPiano = localStorage.getItem(STORAGE_KEYS.showPiano);
  applyShowPiano(savedShowPiano !== "off");

  const savedPianoRange = localStorage.getItem(STORAGE_KEYS.pianoRange) || "normal";
  applyPianoRange(savedPianoRange);

  const savedFontScale = localStorage.getItem(STORAGE_KEYS.fontSize) || "1";
  applyFontScale(savedFontScale);
}

function init() {
  loadVoiceSamples();
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
    }).then(() => {
      applySavedMidiInputSelection();
    });
  }

  renderHeldNotes();
  refreshCandidates();
}

init();
