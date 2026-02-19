/* ================= Constants and Utilities ================= */

// ===== Musical Constants =====
export const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const ENHARMONIC_PC = {
  1: ["C#", "Db"],
  3: ["D#", "Eb"],
  6: ["F#", "Gb"],
  8: ["G#", "Ab"],
  10: ["A#", "Bb"]
};
export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
export const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ===== Chord Display Maps =====
export const GENERAL_CHORD_HEAD_MAP = {
  "": "",
  "m": "m",
  "+": "aug",
  "o": "dim",
  "-5": "(b5)",
  "7-5": "7(b5)",
  "7+5": "7(#5)",
  "Δ7": "Maj7",
  "Δ9": "Maj9",
  "Δ11": "Maj11",
  "Δ13": "Maj13",
  "mΔ7": "mMaj7",
  "mΔ9": "mMaj9",
  "mΔ11": "mMaj11",
  "mΔ13": "mMaj13",
  "ø7": "m7(b5)",
  "o7": "dim7"
};

// ===== Real-time Staff Spelling Maps =====
export const RT_BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export const RT_SPELL_MAJ = {
  "C": { 1: "Db", 3: "Eb", 6: "F#", 8: "Ab", 10: "Bb" },
  "Db": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },
  "D": { 1: "C#", 3: "Eb", 6: "F#", 8: "G#", 10: "Bb" },
  "Eb": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },
  "E": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" },
  "F": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },
  "F#": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" },
  "G": { 1: "C#", 3: "Eb", 6: "F#", 8: "Ab", 10: "Bb" },
  "Ab": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },
  "A": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "Bb" },
  "Bb": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },
  "B": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" }
};

export const RT_SPELL_MIN = {
  "A": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "Bb" },   // Am
  "Bb": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },  // Bbm
  "B": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" },   // Bm
  "C": { 1: "Db", 3: "Eb", 6: "F#", 8: "Ab", 10: "Bb" },   // Cm
  "C#": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" },  // C#m
  "D": { 1: "C#", 3: "Eb", 6: "F#", 8: "G#", 10: "Bb" },   // Dm
  "D#": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" },  // D#m
  "Eb": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },  // Ebm
  "E": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" },   // Em
  "F": { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" },   // Fm
  "F#": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" },  // F#m
  "G": { 1: "C#", 3: "Eb", 6: "F#", 8: "Ab", 10: "Bb" },   // Gm
  "G#": { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" }   // G#m
};

// ===== Key Signature Data =====
export const MAJ_SIG_COUNT = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7
};

export const MIN_REL_MAJ = {
  A: 'C', E: 'G', B: 'D', 'F#': 'A', 'C#': 'E', 'G#': 'B', 'D#': 'F#', 'A#': 'C#',
  D: 'F', G: 'Bb', C: 'Eb', F: 'Ab', Bb: 'Db', Eb: 'Gb', Ab: 'Cb'
};

export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

// ===== Utility Functions =====

/** Calculate pitch class (0-11) from MIDI note */
export const pc = n => ((n % 12) + 12) % 12;

/** Convert pitch class to note name(s) string */
export function pcToNamesPair(p) {
  return ENHARMONIC_PC[p] ? ENHARMONIC_PC[p].join(" / ") : NOTE_NAMES_SHARP[p];
}

/** Get array of possible root names for a pitch class */
export function rootNamesForPC(p) {
  return ENHARMONIC_PC[p] ? ENHARMONIC_PC[p] : [NOTE_NAMES_SHARP[p]];
}

/** Select single root name for a pitch class based on key */
export function selectRootNameForPC(p, keyName, keyMode) {
  // For natural notes (no enharmonic alternatives), return immediately
  if (!ENHARMONIC_PC[p]) {
    return NOTE_NAMES_SHARP[p];
  }

  // If no key is set, default to C major
  if (!keyName) {
    keyName = 'C';
    keyMode = 'maj';
  }

  // Select appropriate spelling map
  const isMinor = (keyMode && keyMode.startsWith('min'));
  const map = isMinor ? RT_SPELL_MIN[keyName] : RT_SPELL_MAJ[keyName];

  // If key is found in map, use its spelling preference
  if (map && map[p]) {
    return map[p];
  }

  // Fallback to first enharmonic option
  return ENHARMONIC_PC[p][0];
}

/** Remove duplicates from array */
export function uniq(arr) {
  return [...new Set(arr)];
}

/** Parse note name into letter and offset (accidentals) */
export function spelledNameToOff(name) {
  const letter = name[0];
  const acc = name.slice(1);
  if (acc === "bb") return { letter, off: -2 };
  if (acc === "b") return { letter, off: -1 };
  if (acc === "x") return { letter, off: +2 };
  if (acc === "#") return { letter, off: +1 };
  return { letter, off: 0 };
}

/** Convert note name to pitch class */
export function noteNameToPC(name) {
  const letter = name[0];
  let acc = name.slice(1);
  let off = 0;
  while (acc.startsWith("bb")) { off -= 2; acc = acc.slice(2); }
  while (acc.startsWith("b")) { off -= 1; acc = acc.slice(1); }
  while (acc.startsWith("x")) { off += 2; acc = acc.slice(1); }
  while (acc.startsWith("#")) { off += 1; acc = acc.slice(1); }
  return ((NATURAL_PC[letter] + off) % 12 + 12) % 12;
}

/** Generate power set of an array */
export function powerSet(arr) {
  const res = [[]];
  for (const x of arr) {
    const len = res.length;
    for (let i = 0; i < len; i++) {
      res.push(res[i].concat(x));
    }
  }
  return res;
}

/** Get key accidental map for current key */
export function getKeyAccMap(currentKeyName, currentKeyMode) {
  let maj = 'C';
  if (currentKeyName) {
    if (currentKeyMode === 'maj') {
      maj = currentKeyName;
    } else if (currentKeyMode && currentKeyMode.startsWith('min')) {
      maj = MIN_REL_MAJ[currentKeyName] || 'C';
    }
  }
  const count = MAJ_SIG_COUNT[maj];
  const map = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  if (!count) return map;
  if (count > 0) {
    for (let i = 0; i < count; i++) { map[SHARP_ORDER[i]] = +1; }
  } else {
    const n = -count;
    for (let i = 0; i < n; i++) { map[FLAT_ORDER[i]] = -1; }
  }
  return map;
}

/** Get ABC notation accidental prefix */
export function accPrefixFor(letter, offWanted, keyMap) {
  const def = keyMap[letter] || 0;
  if (offWanted === def) return '';
  if (offWanted === 0) return '='; // natural
  if (offWanted === -2) return '__';
  if (offWanted === -1) return '_';
  if (offWanted === +1) return '^';
  if (offWanted === +2) return '^^';
  return '';
}

/** Find nearest MIDI note for target pitch class around center */
export function midiForNearest(pcTarget, center) {
  const base = center - pc(center);
  const cand1 = base + pcTarget;
  const cand2 = cand1 + 12;
  const cand0 = cand1 - 12;
  const arr = [cand0, cand1, cand2];
  arr.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return arr[0];
}

/** Select spelling for pitch class based on key */
export function selectRTSpellingForPC(pcVal, currentKeyName, currentKeyMode) {
  const keyName = currentKeyName || "C";
  const keyMap = getKeyAccMap(keyName, currentKeyMode || 'maj');

  // First, try an exact key-signature fit (including white keys like Cb/Fb).
  const candidates = [];
  for (const letter of LETTERS) {
    const base = NATURAL_PC[letter];
    for (let off = -2; off <= 2; off++) {
      if (pc(base + off) !== pcVal) continue;
      const keyOff = keyMap[letter] || 0;
      const score =
        Math.abs(off - keyOff) * 100 + // prefer no accidental override vs key signature
        Math.abs(off) * 10 +           // then prefer simpler accidental
        (off === 0 ? 0 : 1);           // tiny bias toward natural spelling when tied
      candidates.push({ letter, off, score });
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    const acc = best.off === -2 ? "bb" : best.off === -1 ? "b" : best.off === 1 ? "#" : best.off === 2 ? "x" : "";
    return best.letter + acc;
  }

  // Backward-compatible fallback for edge cases.
  if (!RT_BLACK_PCS.has(pcVal)) return NOTE_NAMES_SHARP[pcVal];
  const isMinor = (currentKeyMode && currentKeyMode.startsWith('min'));
  const map = isMinor ? RT_SPELL_MIN[keyName] : RT_SPELL_MAJ[keyName];
  if (!map) return (ENHARMONIC_PC[pcVal] || [NOTE_NAMES_SHARP[pcVal]])[0];
  return map[pcVal] || (ENHARMONIC_PC[pcVal] || [NOTE_NAMES_SHARP[pcVal]])[0];
}

/** Build chord spelling from root and chord definition */
export function buildChordSpelling(rootName, chordDef) {
  const rootLetter = rootName[0];
  const rootPC = noteNameToPC(rootName);
  const rootLetterIndex = LETTERS.indexOf(rootLetter);
  const rawOrder = (chordDef.core || []).concat(chordDef.opt || []);
  const rawDeg = (chordDef.deg || []);
  const pairs = rawOrder.map((iv, i) => ({ iv, d: rawDeg[i] }));
  pairs.sort((a, b) => a.iv - b.iv);
  const tones = [];
  for (let i = 0; i < pairs.length; i++) {
    const semis = ((pairs[i].iv % 12) + 12) % 12;
    const degree = pairs[i].d % 7;
    const targetLetter = LETTERS[(rootLetterIndex + degree) % 7];
    const basePC = NATURAL_PC[targetLetter];
    const targetPC = (rootPC + semis) % 12;
    let diff = (targetPC - basePC + 12) % 12;
    if (diff > 6) diff -= 12;
    while (diff > 2) diff -= 12;
    while (diff < -2) diff += 12;
    let acc = "";
    if (diff === -2) acc = "bb";
    else if (diff === -1) acc = "b";
    else if (diff === 1) acc = "#";
    else if (diff === 2) acc = "x";
    tones.push(targetLetter + acc);
  }
  return tones;
}

/** Format chord display name based on preset */
export function formatChordDisplayName(name, chordLabelPreset) {
  if (chordLabelPreset !== 'general' || !name) return name;
  const m = name.match(/^([A-G](?:#|b|x)?)(.*)$/);
  if (!m) return name;
  const root = m[1];
  let rest = m[2] || "";
  let head = rest;
  let tail = "";
  const firstDelim = rest.search(/[(/]/);
  if (firstDelim >= 0) {
    head = rest.slice(0, firstDelim);
    tail = rest.slice(firstDelim);
  }
  const slashIndex = head.indexOf('/');
  if (slashIndex >= 0) {
    tail = head.slice(slashIndex) + tail;
    head = head.slice(0, slashIndex);
  }
  const mappedHead = Object.prototype.hasOwnProperty.call(GENERAL_CHORD_HEAD_MAP, head)
    ? GENERAL_CHORD_HEAD_MAP[head]
    : head;
  return root + mappedHead + tail;
}

/** Convert MIDI note to ABC notation token */
export function midiToAbcToken(spelledName, midi, currentKeyName, currentKeyMode) {
  const { letter, off } = spelledNameToOff(spelledName);
  const base = NATURAL_PC[letter];
  const o = Math.round((midi - (base + off)) / 12) - 1;
  let sym = letter;
  let suffix = "";
  if (o <= 4) {
    sym = letter.toUpperCase();
    const commas = 4 - o;
    suffix = commas > 0 ? ",".repeat(commas) : "";
  } else {
    sym = letter.toLowerCase();
    const apos = o - 5;
    suffix = apos > 0 ? "'".repeat(apos) : "";
  }
  const keyMap = getKeyAccMap(currentKeyName, currentKeyMode);
  const pref = accPrefixFor(letter, off, keyMap);
  return pref + sym + suffix;
}

/** Set key signature preference based on key name and mode */
export function setKeySignaturePreference(keyName, mode) {
  const SHARP_MAJ = new Set(["G", "D", "A", "E", "B", "F#", "C#"]);
  const FLAT_MAJ = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);
  const SHARP_MIN = new Set(["E", "B", "F#", "C#", "G#", "D#", "A#"]);
  const FLAT_MIN = new Set(["D", "G", "C", "F", "Bb", "Eb", "Ab"]);

  let keySignaturePref = null;
  let neutralKeyBase = null;

  if (mode === "maj") {
    if (SHARP_MAJ.has(keyName)) keySignaturePref = 'sharp';
    else if (FLAT_MAJ.has(keyName)) keySignaturePref = 'flat';
    else { keySignaturePref = null; neutralKeyBase = keyName; } // C
  } else {
    if (SHARP_MIN.has(keyName)) keySignaturePref = 'sharp';
    else if (FLAT_MIN.has(keyName)) keySignaturePref = 'flat';
    else { keySignaturePref = null; neutralKeyBase = keyName; } // A
  }

  return { keySignaturePref, neutralKeyBase };
}

// ===== UI Constants =====
export const GRAND_STAFF_SPLIT_POINT = 58; // A#3/Bb3 divides treble/bass clefs
export const CONTROL_PANEL_MARGIN_PX = 24; // Vertical margin for control panel height calculation

// ===== Audio Constants =====
export const NOTE_STOP_CLEANUP_DELAY_MS = 140; // Delay before voice cleanup after note stop
export const PIANO_SYNTH_DURATION_SEC = 3.5; // Piano synthesis envelope duration

// ===== Chord Recognition Scoring Constants =====
export const SCORE_EXACT_MATCH = 10; // Score for exact chord match (all tones present)
export const SCORE_OPT_MISS = 11; // Score for optional tone miss (core tones present)
export const MAX_CHORD_CANDIDATES = 32; // Maximum number of chord candidates to return
