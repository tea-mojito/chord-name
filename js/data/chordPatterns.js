/**
 * Chord Pattern Database
 *
 * このファイルには、コード認識に使用される全てのコードパターン定義が含まれます。
 *
 * パターンの構造:
 * - name: コード名（ルート音を除く）例: "m7", "Δ9", "7(b9)"
 * - core: 必須構成音（半音単位、ルートからの距離）
 * - opt: 任意構成音（あってもなくてもよい）
 * - deg: 音度（0=ルート, 1=2度, 2=3度, 3=4度, 4=5度, 5=6度, 6=7度）
 * - description: コードの説明（編集用）
 */

/* ================= BASE PATTERNS ================= */
export const BASE_PATTERNS = [
  { name: "", core: [0, 4], opt: [7], deg: [0, 2, 4], description: "Major triad" },
  { name: "m", core: [0, 3], opt: [7], deg: [0, 2, 4], description: "Minor triad" },
  { name: "+", core: [0, 4, 8], opt: [], deg: [0, 2, 4], description: "Augmented triad" },
  { name: "o", core: [0, 3, 6], opt: [], deg: [0, 2, 4], description: "Diminished triad" },
  { name: "sus2", core: [0, 2, 7], opt: [], deg: [0, 1, 4], description: "Suspended 2nd" },
  { name: "sus4", core: [0, 5, 7], opt: [], deg: [0, 3, 4], description: "Suspended 4th" },
  { name: "6", core: [0, 4, 9], opt: [7], deg: [0, 2, 5, 4], description: "Major sixth" },
  { name: "m6", core: [0, 3, 9], opt: [7], deg: [0, 2, 5, 4], description: "Minor sixth" },
  { name: "7", core: [0, 4, 10], opt: [7], deg: [0, 2, 6, 4], description: "Dominant seventh" },
  { name: "-5", core: [0, 4, 6], opt: [], deg: [0, 2, 4], description: "Major flat five" },
  { name: "7-5", core: [0, 4, 6, 10], opt: [], deg: [0, 2, 4, 6], description: "Dominant seven flat five" },
  { name: "Δ7", core: [0, 4, 11], opt: [7], deg: [0, 2, 6, 4], description: "Major seventh" },
  { name: "m7", core: [0, 3, 10], opt: [7], deg: [0, 2, 6, 4], description: "Minor seventh" },
  { name: "ø7", core: [0, 3, 6, 10], opt: [], deg: [0, 2, 4, 6], description: "Half-diminished seventh" },
  { name: "o7", core: [0, 3, 6, 9], opt: [], deg: [0, 2, 4, 6], description: "Diminished seventh" },
  { name: "7+5", core: [0, 4, 8, 10], opt: [], deg: [0, 2, 4, 7], description: "Dominant seven sharp five" },
  { name: "69", core: [0, 4, 9, 14], opt: [7], deg: [0, 2, 5, 1, 4], description: "Six nine (5th optional)" },
  { name: "7sus2", core: [0, 2, 7, 10], opt: [], deg: [0, 1, 4, 6], description: "Dominant seven suspended 2nd" },
  { name: "7sus4", core: [0, 5, 7, 10], opt: [], deg: [0, 3, 4, 6], description: "Dominant seven suspended 4th" },
  { name: "mΔ7", core: [0, 3, 11], opt: [7], deg: [0, 2, 6, 4], description: "Minor major seventh" }
];

/* ================= TENSION PATTERNS ================= */
export const TENSION_PATTERNS = [
  // Minor family
  { name: "m9", core: [0, 3, 10, 14], opt: [7], deg: [0, 2, 6, 1, 4], description: "Minor ninth" },
  { name: "m11", core: [0, 3, 10, 14, 17], opt: [7], deg: [0, 2, 6, 1, 3, 4], description: "Minor eleventh" },
  { name: "m13", core: [0, 3, 10, 21], opt: [7, 14, 17], deg: [0, 2, 6, 5, 4, 1, 3], description: "Minor thirteenth" },
  { name: "m6/9", core: [0, 3, 9, 14], opt: [7], deg: [0, 2, 5, 1, 4], description: "Minor six nine (5th optional)" },

  // Dominant family
  { name: "9", core: [0, 4, 10, 14], opt: [7], deg: [0, 2, 6, 1, 4], description: "Dominant ninth" },
  { name: "9(b5)", core: [0, 4, 6, 10, 14], opt: [], deg: [0, 2, 4, 6, 1], description: "Dominant nine flat five" },
  { name: "9(#5)", core: [0, 4, 8, 10, 14], opt: [], deg: [0, 2, 4, 6, 1], description: "Dominant nine sharp five" },
  { name: "9(#11)", core: [0, 4, 10, 14, 18], opt: [7], deg: [0, 2, 6, 1, 3, 4], description: "Dominant nine sharp eleven" },
  { name: "11", core: [0, 4, 10, 17], opt: [7, 14], deg: [0, 2, 6, 3, 4, 1], description: "Dominant eleventh" },
  { name: "13", core: [0, 4, 10, 21], opt: [7, 14, 17], deg: [0, 2, 6, 5, 4, 1, 3], description: "Dominant thirteenth" },
  { name: "13(b5)", core: [0, 4, 6, 10, 21], opt: [14, 17], deg: [0, 2, 4, 6, 5, 1, 3], description: "Dominant thirteen flat five" },
  { name: "13(#5)", core: [0, 4, 8, 10, 21], opt: [14, 17], deg: [0, 2, 4, 6, 5, 1, 3], description: "Dominant thirteen sharp five" },

  // Major family
  { name: "Δ9", core: [0, 4, 11, 14], opt: [7], deg: [0, 2, 6, 1, 4], description: "Major ninth" },
  { name: "Δ11", core: [0, 4, 11, 17], opt: [7, 14], deg: [0, 2, 6, 3, 4, 1], description: "Major eleventh" },
  { name: "Δ13", core: [0, 4, 11, 21], opt: [7, 14, 17], deg: [0, 2, 6, 5, 4, 1, 3], description: "Major thirteenth" },

  // Minor major family
  { name: "mΔ9", core: [0, 3, 11, 14], opt: [7], deg: [0, 2, 6, 1, 4], description: "Minor major ninth" },
  { name: "mΔ11", core: [0, 3, 11, 14, 17], opt: [7], deg: [0, 2, 6, 1, 3, 4], description: "Minor major eleventh" },
  { name: "mΔ13", core: [0, 3, 11, 21], opt: [7, 14, 17], deg: [0, 2, 6, 5, 4, 1, 3], description: "Minor major thirteenth" }
];

/* ================= TENSION TAGS (for parenthetical patterns) ================= */
export const TENSION_TAGS = [
  { tag: "b9", iv: 13, deg: 1, description: "Flat ninth" },
  { tag: "9", iv: 14, deg: 1, description: "Ninth" },
  { tag: "#9", iv: 15, deg: 1, description: "Sharp ninth" },
  { tag: "11", iv: 17, deg: 3, description: "Eleventh" },
  { tag: "#11", iv: 18, deg: 3, description: "Sharp eleventh" },
  { tag: "b13", iv: 20, deg: 5, description: "Flat thirteenth" },
  { tag: "13", iv: 21, deg: 5, description: "Thirteenth" }
];

/* ================= PAREN BASES (base chords that accept parenthetical tensions) ================= */
export const PAREN_BASES = [
  {
    name: "",
    core: [0, 4, 7],
    deg: [0, 2, 4],
    allow: ["b9", "9", "#9", "11", "#11", "b13", "13"],
    description: "Major triad with parenthetical tensions"
  },
  {
    name: "7",
    core: [0, 4, 7, 10],
    deg: [0, 2, 4, 6],
    allow: ["b9", "9", "#9", "#11", "b13", "13"],
    description: "Dominant seventh with parenthetical tensions"
  },
  {
    name: "m",
    core: [0, 3, 7],
    deg: [0, 2, 4],
    allow: ["b9", "9", "11", "13"],
    description: "Minor triad with parenthetical tensions"
  },
  {
    name: "m6",
    core: [0, 3, 7, 9],
    deg: [0, 2, 4, 5],
    allow: ["b9", "9", "11"],
    description: "Minor sixth with parenthetical tensions"
  },
  {
    name: "m7",
    core: [0, 3, 7, 10],
    deg: [0, 2, 4, 6],
    allow: ["b9", "9", "11", "13"],
    description: "Minor seventh with parenthetical tensions"
  }
];