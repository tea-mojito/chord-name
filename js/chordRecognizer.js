/* ================= Chord Recognition Module ================= */

import {
  pc,
  noteNameToPC,
  buildChordSpelling,
  powerSet,
  rootNamesForPC,
  selectRootNameForPC,
  uniq,
  NOTE_NAMES_SHARP,
  ENHARMONIC_PC,
  selectRTSpellingForPC,
  SCORE_EXACT_MATCH,
  SCORE_OPT_MISS,
  MAX_CHORD_CANDIDATES
} from './constants.js';

// Import chord patterns from external data file
import {
  BASE_PATTERNS,
  TENSION_PATTERNS,
  TENSION_TAGS,
  PAREN_BASES
} from './data/chordPatterns.js';

// Re-export for backward compatibility
export { BASE_PATTERNS, TENSION_PATTERNS };

/* 品質ごとに ( ) テンションを1〜3個で生成 */
function generateParenCombos(baseDef, maxCount = 3) {
  const out = [];
  const allow = new Set(baseDef.allow);
  const combos = powerSet(TENSION_TAGS).filter(s =>
    s.length > 0 && s.length <= maxCount && s.every(x => allow.has(x.tag))
  );
  for (const s of combos) {
    out.push({
      name: baseDef.name + "(" + s.map(x => x.tag).join(",") + ")",
      core: baseDef.core.slice(),
      opt: s.map(x => x.iv),
      deg: baseDef.deg.concat(s.map(x => x.deg))
    });
  }
  return out;
}

export const PAREN_PATTERNS = PAREN_BASES.flatMap(b => generateParenCombos(b, 3));

/* 総合パターン */
export const PATTERNS = BASE_PATTERNS.concat(TENSION_PATTERNS).concat(PAREN_PATTERNS);

/* ================= Key-Related State (module-level) ================= */
// These can be set/accessed by external code
let keySignaturePref = null;  // 'sharp' | 'flat' | null (neutral)
let neutralKeyBase = null;    // 'C' | 'A' | null
let keyTonicPC = null; // 0..11, null= None
let keyMode = null;    // 'maj' | 'min_nat' | 'min_har' | 'min_mel' | null
let keySelMode = 'manual'; // 'manual' | 'auto'
let currentKeyName = null;
let currentKeyMode = null;

// Export getters and setters for key-related state
export function getKeyState() {
  return { keySignaturePref, neutralKeyBase, keyTonicPC, keyMode, keySelMode, currentKeyName, currentKeyMode };
}

export function setKeyState({
  keySignaturePref: ksp = null,
  neutralKeyBase: nkb = null,
  keyTonicPC: ktpc = null,
  keyMode: km = null,
  keySelMode: ksm = 'manual',
  currentKeyName: ckn = null,
  currentKeyMode: ckm = null
} = {}) {
  keySignaturePref = ksp;
  neutralKeyBase = nkb;
  keyTonicPC = ktpc;
  keyMode = km;
  keySelMode = ksm;
  currentKeyName = ckn;
  currentKeyMode = ckm;
}

/* ====== 表示名で除外するブラックリスト規則 ====== */
function shouldHideName(name){
  // 先頭のルート名を除去（C, Db, F#, E# など）
  const base = name.replace(/^[A-G](?:#|b|x)?/i,"");
  // ▼ Key-based enharmonic pruning
  try{
    if(keySignaturePref!==undefined){
      const m = name.match(/^[A-G](?:#|b)?/i);
      if(m){
        const rn = m[0];
        const acc = rn.includes('#') ? '#' : (rn.includes('b') ? 'b' : '');
        const p = noteNameToPC(rn);
        const isBlack = (p===1||p===3||p===6||p===8||p===10);
        if(isBlack && acc){
          if(keySignaturePref==='sharp' && acc==='b') return true;  // hide flats in sharp keys
          if(keySignaturePref==='flat'  && acc==='#') return true;  // hide sharps in flat keys
          if(keySignaturePref===null){ // neutral (C maj / A min)
            const isNeutralC = (neutralKeyBase==='C' && keyMode==='maj');
            const isNeutralA = (neutralKeyBase==='A' && keyMode==='min');
            if(isNeutralC || isNeutralA){
              if(p===6){ if(acc==='b') return true; }        // prefer F# over Gb
              else { if(acc==='#') return true; }            // prefer Db/Eb/Ab/Bb over sharps
            }
          }
        }
      }
    }
  }catch(e){
    console.warn('[ChordRecognizer] Key/note name filtering error in shouldHideName:', name, e);
  }


  // 既存の除外
  if(/add7/i.test(base)) return true;                        // 例: add7(9)
  const extractTags = (inside)=>{
    return inside.split(",").map(s=>s.trim()).filter(Boolean);
  };
  const hasPlainTag = (tags, num)=>tags.some(t=>t.replace(/\s+/g,"").toLowerCase()===String(num).toLowerCase());
  const hasAccTag = (tags, num)=>tags.some(t=>{
    const cleaned=t.replace(/\s+/g,"");
    if(cleaned.length<=1) return false;
    const accidental = cleaned[0];
    const rest = cleaned.slice(1).toLowerCase();
    return (accidental==='b' || accidental==='#') && rest===String(num).toLowerCase();
  });
  const add9Match = base.match(/add9\(([^)]*)\)/i);
  if(add9Match){
    const tags = extractTags(add9Match[1]);
    if(hasPlainTag(tags,11) && !hasAccTag(tags,11)) return true; // add9(11) は表示を抑制
  }
  const sevenMatch = base.match(/7\(([^)]*)\)/i);
  if(sevenMatch){
    const tags = extractTags(sevenMatch[1]);
    if(hasPlainTag(tags,11) && hasPlainTag(tags,13) && !hasAccTag(tags,11) && !hasAccTag(tags,13)) return true; // 例: 7(11,13)
    if(hasPlainTag(tags,9) && hasPlainTag(tags,11) && !hasAccTag(tags,9) && !hasAccTag(tags,11)) return true; // 例: 7(9,11)
    const hasSharp11 = tags.some(t=>t.replace(/\s+/g,"").toLowerCase()==="#11");
    if(hasPlainTag(tags,9) && hasSharp11) return true; // 例: 7(9,#11) → 9(#11) に統一
  }

  // ▼ 新規: 冗長併記を除外
  // ?7(9) / ?7(9,11) / ?7(9,11,13)
  if(/^[A-Za-z]*7\(\s*9\s*\)$/i.test(base)) return true;

  // ?9(11) / ?9(11,13)  → それぞれ ?11 / ?13 に統合（#11 や b11 を含む場合は除外しない）
  const nineMatch = base.match(/9\(([^)]*)\)/i);
  if(nineMatch){
    const tags = extractTags(nineMatch[1]);
    if(hasPlainTag(tags,11) && !hasAccTag(tags,11)) return true;
  }

  // ?11(13) → ?13 に統合（#13 / b13 は残す）
  const elevenMatch = base.match(/11\(([^)]*)\)/i);
  if(elevenMatch){
    const tags = extractTags(elevenMatch[1]);
    if(hasPlainTag(tags,13) && !hasAccTag(tags,13)) return true;
  }

  // ?(13) 単独は ?6 / ?m6 と被るため除外（ベース側に度数が含まれない場合）
  const m = base.match(/^([A-Za-z+]*)(\(([^)]*)\))?$/);
  if(m){
    const head = m[1]||"";
    const par  = (m[3]||"").trim();
    if(!/\d/.test(head) && /^13$/i.test(par)) return true;
  }

  if(/^(?:m6)\(\s*13\s*\)$/i.test(base)) return true;

  return false;
}

/* ==== Family ranking (rewritten: table-driven) ==== */
function stripRootName(name){ return name.replace(/^[A-G](?:#|b|x)?/i,""); }

// 判定は上から順に適用（先勝ち）
const FAMILY_RULES = [
  // 末尾に回したい特殊系
  { name:"SpecialLast",
    test:(base)=>/(?:^sus[24]\b|^aug\b|^dim$|^7\(\s*b5\s*\)$|^7b5\b|^m7b5\b|\bdim7\b|aug7\b|7(?:sus2|sus4)?\b)/i.test(base)
  },
  // ★ Em+5 を強く見せたい：m+5 を Minor より上位の専用ファミリへ
  { name:"MinorAug5",
    test:(base)=>/^m\+5\b/i.test(base)
  },
  // Sixth 系（据え置き）
  { name:"Sixth",
    test:(base)=>/^(?:m6|6)\b|^69\b|^m6\/9\b/i.test(base)
  },
  // ★ 7thを分割：Dom7 を Maj7 より僅かに優先
  { name:"Dom7",
    test:(base)=>/\b7\b/i.test(base) && !/Maj7/i.test(base)
  },
  { name:"Maj7Only",
    test:(base)=>/\bMaj7\b/i.test(base)
  },
  // ★ add9 は "Nineth" から切り出して軽いプラス（Cadd9 を C6 より上に）
  { name:"Add9",
    test:(base)=>/^add9\b/i.test(base)
  },
  // 残りの 9/11/13（括弧テンション以外）をまとめて減点
  { name:"Nineth",
    test:(base)=>/(?:^|[^A-Za-z])(?:9|11|13)\b|mMaj9\b/i.test(base)
  },
  // 一般のマイナー
  { name:"Minor",
    test:(base)=>/^m(?!aj7)(?!7)(?!6)(?!9)(?!11)(?!13)(?!\+5)/i.test(base)
  },
  // デフォルト（メジャー）
  { name:"Major", test:(_) => true },
];

function familyOf(name){
  const base = stripRootName(name);
  for(const rule of FAMILY_RULES){ if(rule.test(base)) return rule.name; }
  return "Major";
}

// FAMILY_WEIGHT の強化
const FAMILY_WEIGHT = {
  Major: 8,
  Minor: 8,
  Dom7: 8,
  Maj7Only: 8,
  Add9: 6,
  Sixth: 3,
  MinorAug5: 6,
  Nineth: 8,
  SpecialLast: 1,
};

/* ==== Key-aware ranking boost (調に応じた加点/減点) ==== */
const SCORE_BONUS = {
  coreHit: 4,
  optHit: 2,
  coreMiss: 6,
  optMiss: 2,
  extra: 4,
  triadToSeventh: 5,
  forcedRoot: 2,
  parenPenalty: 6,
  parenMissingRoot: 8,
  tensionPenalty: 3,
};

const DEGREE_PRIORITY = {
  0: { major: 9, minor: 9 },
  7: { major: 8, minor: 8 },
  5: { major: 7, minor: 7 },
  2: { major: 6,  minor: 6 },
  4: { major: 5,  minor: 5 },
  9: { major: 4,  minor: 4 },
  11:{ major: 3,  minor: 2, dim: 2 },
};

const DIATONIC_MAJOR_PATTERN = [
  { roman: "I",    interval: 0,  quality: "maj" },
  { roman: "ii",   interval: 2,  quality: "min" },
  { roman: "iii",  interval: 4,  quality: "min" },
  { roman: "IV",   interval: 5,  quality: "maj" },
  { roman: "V",    interval: 7,  quality: "maj" },
  { roman: "vi",   interval: 9,  quality: "min" },
  { roman: "vii°", interval: 11, quality: "dim" },
];

const DIATONIC_MINOR_PATTERN = [
  { roman: "i",    interval: 0,  quality: "min" },
  { roman: "ii°", interval: 2,  quality: "dim" },
  { roman: "III", interval: 3,  quality: "maj" },
  { roman: "iv",  interval: 5,  quality: "min" },
  { roman: "v",   interval: 7,  quality: "min" },
  { roman: "VI",  interval: 8,  quality: "maj" },
  { roman: "VII", interval: 10, quality: "maj" },
];

export const ROMAN_BASE_BY_DEGREE = {
  0: "I",
  1: "bII",
  2: "II",
  3: "bIII",
  4: "III",
  5: "IV",
  6: "#IV",
  7: "V",
  8: "bVI",
  9: "VI",
  10: "bVII",
  11: "VII",
};

export const DIATONIC_TRIAD_INTERVALS = {
  maj: [0,4,7],
  min: [0,3,7],
  dim: [0,3,6]
};

export function romanWithQuality(baseRoman, qualityTag){
  if(!baseRoman) return "";
  const m = baseRoman.match(/^([b#]*)([IV]+)/i);
  if(!m) return baseRoman;
  const accidental = m[1] || "";
  let core = m[2] || "";
  let suffix = "";
  switch(qualityTag){
    case 'min':
      core = core.toLowerCase();
      break;
    case 'dim':
      core = core.toLowerCase();
      suffix = '°';
      break;
    case 'halfDim':
      core = core.toLowerCase();
      suffix = 'ø';
      break;
    default:
      core = core.toUpperCase();
      break;
  }
  return accidental + core + suffix;
}

// 重み（微調整可能）
const DIATONIC_BONUS = 6;
const QUALITY_MATCH_BONUS = 4;
const V7_BOOST_MAJ = 3;
const V7_BOOST_MIN = 2;

function qualityTagOf(base){
  // base は Root を除いた名前（例: "maj7", "m7", "m7b5", "sus4" 等）
  if(/\bm7b5\b/i.test(base)) return 'halfDim';
  if(/\bdim7\b|\bdim\b|°/i.test(base)) return 'dim';
  if(/\bMaj7\b/i.test(base)) return 'maj7';
  if(/\b7\b/i.test(base) && !/Maj7/i.test(base)) return 'dom7';
  if(/^m(?!aj)/i.test(base)) return 'min';
  return 'maj';
}

function computeKeyBoost(rootPC, fullName){
  if(keyTonicPC==null || !keyMode) return 0;
  const deg = pc(rootPC - keyTonicPC);
  const base = stripRootName(fullName);
  const q = qualityTagOf(base);
  // 調ごとのスケール度と許容品質
  const MAJ_DEG = new Set([0,2,4,5,7,9,11]);
  const MIN_NAT = new Set([0,2,3,5,7,8,10]);
  const MIN_HAR = new Set([0,2,3,5,7,8,11]);
  const MIN_MEL = new Set([0,2,3,5,7,9,11]);


  const ALLOW_MAJ = {
    0:['maj','maj7'], 2:['min'], 4:['min'], 5:['maj','maj7'], 7:['maj','dom7'], 9:['min'], 11:['dim','halfDim']
  };
  const ALLOW_MIN_N = {
    0:['min', 'min7'], 2:['dim','halfDim'], 3:['maj','maj7'], 5:['min'], 7:['min','dom7'], 8:['maj','maj7'], 10:['maj']
  };
  const ALLOW_MIN_H = {
    0:['min'], 2:['dim','halfDim'], 3:['maj','maj7'], 5:['min'], 7:['dom7','maj'], 8:['maj','maj7'], 11:['dim','halfDim']
  };
  const ALLOW_MIN_M = {
    0:['min'], 2:['min'], 3:['maj','maj7'], 5:['maj','maj7'], 7:['dom7','maj'], 9:['maj','maj7'], 11:['dim','halfDim']
  };

  let inScale=false, allow=[];
  if(keyMode==='maj'){ inScale = MAJ_DEG.has(deg); allow = ALLOW_MAJ[deg]||[]; }
  else if(keyMode==='min_nat'){ inScale = MIN_NAT.has(deg); allow = ALLOW_MIN_N[deg]||[]; }
  else if(keyMode==='min_har'){ inScale = MIN_HAR.has(deg); allow = ALLOW_MIN_H[deg]||[]; }
  else if(keyMode==='min_mel'){ inScale = MIN_MEL.has(deg); allow = ALLOW_MIN_M[deg]||[]; }
  const matches = allow.includes(q);

  let boost = 0;
  if(inScale) boost += DIATONIC_BONUS;
  if(matches) boost += QUALITY_MATCH_BONUS;
  if(keyMode==='maj' && deg===7 && q==='dom7') boost += V7_BOOST_MAJ; // V7 を優遇
  if(keyMode?.startsWith('min') && deg===7 && q==='dom7') boost += V7_BOOST_MIN; // V7 優遇（短）
  boost += degreePriorityBonus(deg, base);
  return boost;
}

function degreeQualityForBase(base, deg){
  if(/\bm7b5\b|\bdim7\b|\bdim\b|°/i.test(base)) return 'dim';
  if(/^m(?!aj)/i.test(base)) return 'minor';
  if(/\bsus[24]\b|\b5\b|no3/i.test(base)) return defaultSideForDegree(deg);
  return 'major';
}

function defaultSideForDegree(deg){
  if(deg===0 || deg===5 || deg===7) return 'major';
  return 'minor';
}

function degreePriorityBonus(deg, base){
  const table = DEGREE_PRIORITY[deg];
  if(!table) return 0;
  const quality = degreeQualityForBase(base, deg);
  if(table[quality]!=null) return table[quality];
  if(quality==='dim' && table.minor!=null) return table.minor;
  if(quality==='minor' && table.dim!=null) return table.dim;
  return table.major || 0;
}

export function diatonicPatternForMode(){
  if(keyTonicPC==null || !keyMode) return null;
  if(keyMode==='maj') return DIATONIC_MAJOR_PATTERN;
  if(typeof keyMode==="string" && keyMode.startsWith('min')) return DIATONIC_MINOR_PATTERN;
  return null;
}

export function diatonicRootName(pcVal){
  try{
    return selectRTSpellingForPC(pcVal, currentKeyName, currentKeyMode);
  }catch(e){
    console.warn('[ChordRecognizer] Error in diatonicRootName spelling selection:', pcVal, e);
  }
  const pair = ENHARMONIC_PC[pcVal];
  return pair ? pair[0] : NOTE_NAMES_SHARP[pcVal];
}

export function diatonicChordLabel(rootPC, quality){
  const rootName = diatonicRootName(rootPC);
  if(quality==='maj') return rootName;
  if(quality==='min') return rootName + "m";
  if(quality==='dim') return rootName + "dim";
  return rootName;
}

export function currentScaleSet(){
  if(keyTonicPC==null || !keyMode) return null;
  let rel=null;
  if(keyMode==='maj') rel=[0,2,4,5,7,9,11];
  else if(keyMode==='min_nat') rel=[0,2,3,5,7,8,10];
  else if(keyMode==='min_har') rel=[0,2,3,5,7,8,11];
  else if(keyMode==='min_mel') rel=[0,2,3,5,7,9,11];
  if(!rel) return null;
  return new Set(rel.map(iv=>pc(keyTonicPC+iv)));
}

/* ================= Detection (strict exact + ranking tweak) ================= */
export function parseRootText(txt){
  if(!txt) return null;
  const t=txt.trim().replace(/[♯]/g,"#").replace(/[♭]/g,"b");
  const map={"C":0,"B#":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"Fb":4,"F":5,"E#":5,"F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11,"Cb":11};
  return (t in map)?map[t]:null;
}

// 完全五度は常に任意扱いへ移す（省略しても一致判定可）
function applyOptionalFifth(corePCs, optPCs, root){
  const perfectFifth = pc(root + 7);
  if(!corePCs.includes(perfectFifth)) return { corePCs, optPCs, relaxedOpt:new Set() };
  const nextCore = corePCs.filter(p=>p!==perfectFifth);
  const optSet = new Set(optPCs);
  optSet.add(perfectFifth);
  const nextOpt = [...optSet].filter(p=>!nextCore.includes(p));
  const relaxedOpt = new Set([perfectFifth]);
  return { corePCs:nextCore, optPCs:nextOpt, relaxedOpt };
}

/**
 * コード候補を検出する（コア認識エンジン）
 *
 * ピッチクラスのセットから可能なコード解釈を生成し、スコアリングしてランク付けします。
 * キー設定がある場合、ダイアトニックコードを優先的に表示します。
 *
 * @param {Set<number>} pitches - ピッチクラス (0-11) のセット。0=C, 1=C#/Db, ..., 11=B
 * @param {number|null} [forcedRootPC=null] - 強制的に指定するルート音のピッチクラス (0-11)
 * @param {number|null} [lowestBassPC=null] - 最低音のピッチクラス（オンコード判定用、現在未使用）
 * @param {string|null} [keyName=null] - 現在のキー名 (例: 'C', 'F#', 'Bb')
 * @param {string|null} [keyMode=null] - キーモード ('maj', 'min_nat', 'min_har', 'min_mel')
 *
 * @returns {Array<Object>} スコア順にソートされたコード候補の配列（最大32件）。各候補の構造：
 *   - name {string}: 完全なコード名 (例: 'CMaj7', 'F#m7b5')
 *   - root {number}: ルート音のピッチクラス (0-11)
 *   - exact {boolean}: 完全一致フラグ（すべての構成音が一致）
 *   - optMiss {boolean}: オプション音のみ欠けているフラグ
 *   - score {number}: ランキングスコア（高いほど優先）
 *   - family {string}: コードファミリー ('Major', 'Minor', 'Dom7', など)
 *   - tones {string[]}: 構成音の表示名配列 (例: ['C', 'E', 'G', 'B'])
 *   - missingCore {number[]}: 欠けているコア音のピッチクラス
 *   - missingOpt {number[]}: 欠けているオプション音のピッチクラス
 *   - extras {number[]}: コード定義にない余分な音のピッチクラス
 *
 * @example
 * // Cメジャートライアド (C-E-G) を認識
 * const candidates = detectChords(new Set([0, 4, 7]), null, null, 'C', 'maj');
 * console.log(candidates[0].name); // "C"
 * console.log(candidates[0].exact); // true
 *
 * @example
 * // CMaj7 (C-E-G-B) をCキーで認識
 * const candidates = detectChords(new Set([0, 4, 7, 11]), null, null, 'C', 'maj');
 * console.log(candidates[0].name); // "CMaj7"
 * console.log(candidates[0].score); // 高いスコア（ダイアトニック+完全一致）
 */
export function detectChords(pitches, forcedRootPC=null, lowestBassPC=null, keyName=null, keyMode=null){
  if(pitches.size===0) return [];
  const pcs=[...pitches].sort((a,b)=>a-b);
  const pcsSet=new Set(pcs);

  const candidateRoots = forcedRootPC!=null ? [forcedRootPC] : [...Array(12).keys()];
  const results=[];

  for(const root of candidateRoots){
    for(const ch of PATTERNS){
      let corePCs = uniq((ch.core||[]).map(iv=>pc(root+iv)));
      let optPCs = uniq((ch.opt||[]).map(iv=>pc(root+iv)));
      optPCs = optPCs.filter(p=>!corePCs.includes(p));
      let relaxedOpt = new Set();
      ({ corePCs, optPCs, relaxedOpt } = applyOptionalFifth(corePCs, optPCs, root));

      const coreSet=new Set(corePCs);
      const optSet =new Set(optPCs);
      const fullSet=new Set([...corePCs, ...optPCs]);

      const presentCore = corePCs.filter(p=>pcsSet.has(p));
      const effectiveOptList = optPCs.filter(p=>!relaxedOpt.has(p));
      const presentOpt  = effectiveOptList.filter(p=>pcsSet.has(p));
      const missingCore = corePCs.filter(p=>!pcsSet.has(p));
      const missingOptRaw  = optPCs.filter(p=>!pcsSet.has(p));
      const missingOpt = missingOptRaw.filter(p=>!relaxedOpt.has(p));
      const extras      = pcs.filter(p=>!fullSet.has(p));

      /* strict exact */
      const coreOK = missingCore.length===0;
      const extrasOK = extras.length===0;
      const optAllIn = optPCs.length>0 ? missingOpt.length===0 : true;
      const exact = coreOK && extrasOK && optAllIn;
      const optMiss = !exact && coreOK && extrasOK && missingOpt.length>0;

      // 括弧つき候補は完全一致するまで非表示
      if (/\(.*\)/.test(ch.name) && !exact) continue;

      /* gating: 押下が少ないときは最低一致数を下げる（最大2音） */
      const minCoreNeeded = Math.min(corePCs.length, Math.min(pcsSet.size, 2));
      if(presentCore.length < minCoreNeeded) continue;

      /* 加算式スコア */
      let score = 0;
      if(exact) score += SCORE_EXACT_MATCH;
      else if(optMiss) score += SCORE_OPT_MISS;
      score += presentCore.length * SCORE_BONUS.coreHit;
      score += presentOpt.length * SCORE_BONUS.optHit;
      score -= missingCore.length * SCORE_BONUS.coreMiss;
      score -= missingOpt.length * SCORE_BONUS.optMiss;
      score -= extras.length * SCORE_BONUS.extra;
      if(forcedRootPC===root) score += SCORE_BONUS.forcedRoot;

      /* ▼ テンション系の順位を低めに（括弧や 9/11/13 を含む名前） */
      const nm = ch.name;
      const isParen = /\(.*\)/.test(nm);
      const hasTensionNumber = /(^|[^A-Za-z])(9|11|13)\b/.test(nm);
      const rootPresent = pcsSet.has(root);
      if(isParen){
        score -= SCORE_BONUS.parenPenalty;
        if(!rootPresent) score -= SCORE_BONUS.parenMissingRoot;
      }else if(hasTensionNumber){
        score -= SCORE_BONUS.tensionPenalty;
      }

      // ▼ Triad→7th の持ち上げ（例: C・E・G で C7 / Cmaj7 も候補へ）
      const triadMajor = [root, pc(root+4), pc(root+7)];
      const triadMinor = [root, pc(root+3), pc(root+7)];
      const triadCovered = triadMajor.every(p=>pcsSet.has(p)) || triadMinor.every(p=>pcsSet.has(p));
      const isSus = /7sus[24]/i.test(nm);
      const isSeventhNominal = /\b(Maj7|m7|mMaj7|7)\b/i.test(nm) && !isSus;
      if(triadCovered && isSeventhNominal) score += SCORE_BONUS.triadToSeventh;

      // Select root names:
      // - key specified: choose one spelling based on key
      // - key unspecified: keep both enharmonic families for black-key roots
      const rootNames = (keyName && keyMode)
        ? [selectRootNameForPC(root, keyName, keyMode)]
        : rootNamesForPC(root);

      for (const rn of rootNames) {
        const fullName = rn + ch.name;
        if(shouldHideName(fullName)) continue;

        // ▼ 家族優先の加点を付与
        const fam = familyOf(fullName);
        const famBoost = FAMILY_WEIGHT[fam] || 0;
        const keyBoost = computeKeyBoost(root, fullName);
        const adjScore = score + famBoost + keyBoost;

        const tones = buildChordSpelling(rn, ch);
        results.push({
          name: fullName,
          root, exact, optMiss,
          isParen,
          matchLevel: exact ? SCORE_EXACT_MATCH : (optMiss ? SCORE_OPT_MISS : 0),
          score: adjScore,
          family: fam,
          tones,
          coreLen: corePCs.length,
          presentSet: pcsSet,
          missingCore, missingOpt, extras
        });
      }
    }
  }

  /* keep best per name */
  const best=new Map();
  for(const r of results){ if(!best.has(r.name) || best.get(r.name).score<r.score) best.set(r.name,r); }

  // 再度ベスト名抽出（/Bass も含めて）
  const best2=new Map();
  for(const r of results){
    if(!best2.has(r.name) || best2.get(r.name).score<r.score) best2.set(r.name,r);
  }
  /*
   * 表示優先ルール（認識エンジン側）
   * 1) matchLevel 降順（exact > optMiss > その他）
   * 2) 非 () 候補を優先（() 付きは後ろへ送る）
   * 3) score 降順（同一 matchLevel / 同カテゴリ内で比較）
   * 4) 上位候補のみ返す
   */
  return [...best2.values()].sort((a,b)=>
    (b.matchLevel-a.matchLevel) ||
    ((a.isParen?1:0)-(b.isParen?1:0)) ||
    (b.score-a.score)
  ).slice(0, MAX_CHORD_CANDIDATES);
}
