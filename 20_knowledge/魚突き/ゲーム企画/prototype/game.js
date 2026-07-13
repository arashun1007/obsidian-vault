// いそもぐり
// 依存なし・Canvas 2D・縦画面 1ダイブ=1ラン
"use strict";

// ---------- 定数 ----------
const VW = 240, VH = 400;          // 論理解像度
const WORLD_W = 560;               // 横に約2.3画面分
const WORLD_H = 2000;              // 20m（1m = 100px）
const PX_PER_M = 100;
const O2_MAX = 60;                 // 秒
const SPEAR_RANGE = 85;
const CRIT = 0.05, GOOD = 0.12, POOR = 0.26; // ゲージ中央からの距離（標準時）
const TARGET_TAP_RADIUS = 28;
const AIM_MIN_TIME = 0.16;
const TAP_GUARD_MS = 420;
const DAILY_REWARD = 300;

// 海況＝プレイヤーが選ぶ難易度（企画書 §5）
const MODES = {
  nagi:  { name: "ベタ凪",       desc: "判定甘め・練習向き",
           gauge: 1.6,  taps: 0.7,  time: 1.2, flee: 0.85, o2: 1.0, drift: 0,  sway: 0, murk: 0, score: 1 },
  uneri: { name: "ちょいうねり", desc: "標準。魚は少し敏感",
           gauge: 1.0,  taps: 1.0,  time: 1.0, flee: 1.15, o2: 1.0, drift: 10, sway: 1, murk: 0, score: 1 },
  arare: { name: "激荒れ",       desc: "濁り・流れ・スコア2倍",
           gauge: 0.75, taps: 1.15, time: 0.9, flee: 1.3,  o2: 1.2, drift: 24, sway: 2, murk: 1, score: 2 },
};
const MODE_KEYS = ["nagi", "uneri", "arare"];
let mode = MODES.nagi;
let current = 1; // 激荒れの横流れの向き

const QUOTES = [
  "忘れ物はない？ フィン、ウエイト、ナイフ、フロート。",
  "耳の調子はどう？ 抜けない日は、潜らない日。",
  "浮上できる者だけが、明日も潜れる。",
  "大物は、帰ろうと思った岩の裏にいる。",
  "バラした魚は、次に会うとき一回り大きい。",
  "板子一枚、下は竜宮。",
  "アイゴの群れに用はないが、アイゴの下には何かいる。",
  "無理な深追いはしない。海は明日もある。",
  "車の鍵、防水ケースに入れた？",
  "ベタ凪の日に練習を。荒れた日に休息を。",
  "波の声を聞く。海は今、何を言っている？",
  "魚と同じ時間で呼吸する。急ぐな。",
  "最後の一匹より、生きて帰ること。",
  "濁りの先に、大物は隠れている。",
  "潜れない日もある。それも海の判断だ。",
  "指先で岩を読む。足跡は語る。",
  "獲物の前に、己の限界を知れ。",
  "浮上時、ゆっくり。焦りが事故を呼ぶ。",
  "素晴らしい漁とは、無事に帰ること。",
  "海の贈り物を、足りるだけ。",
];

// localStorageが使えない環境（埋め込みサンドボックス等）ではメモリに退避
const store = (() => {
  try { const s = localStorage; s.getItem("__t"); return s; }
  catch (_) {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
  }
})();

function loadJSON(key, fallback) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch (_) {}
}

// ---------- ランキング（同一オリジンの /api/ と通信） ----------
const NAME_MAX = 10;
let playerName = store.getItem("isomoguri_name") || "";
let bigFish = loadJSON("isomoguri_bigfish", { cm: 0, id: "" }); // 生涯最大の1匹
let sentBest = loadJSON("isomoguri_sent", { s: 0, c: 0, n: "" }); // 送信済みのベスト
let rankView = null; // null | {loading:1} | {error:msg} | {data}
const NET_OK = typeof fetch === "function" &&
  typeof location !== "undefined" && /^https?:$/.test(location.protocol || "");

function playerId() {
  let id = store.getItem("isomoguri_pid");
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    store.setItem("isomoguri_pid", id);
  }
  return id;
}

function submitScore() {
  if (!NET_OK || !playerName) return;
  // ベスト更新も名前変更も無ければ送らない（通信とKV書き込みの節約）
  if (highScore <= sentBest.s && bigFish.cm <= sentBest.c && playerName === sentBest.n) return;
  const payload = { id: playerId(), name: playerName, score: highScore, cm: bigFish.cm, fish: bigFish.id };
  fetch("api/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then(r => (r.ok ? r.json() : null)).then(res => {
    if (res && res.ok) {
      sentBest = { s: highScore, c: bigFish.cm, n: playerName };
      saveJSON("isomoguri_sent", sentBest);
    }
  }).catch(() => {});
}

function fetchRanking() {
  if (!NET_OK) { rankView = { error: "オフラインのため見られません" }; return; }
  rankView = { loading: 1 };
  fetch("api/ranking?id=" + playerId())
    .then(r => {
      if (r.status === 503) throw "notready";
      if (!r.ok) throw "net";
      return r.json();
    })
    .then(d => { rankView = { data: d }; })
    .catch(e => {
      rankView = { error: e === "notready" ? "ランキングは準備中。もうすこし待ってね。"
                                           : "取得できなかった。電波の良い場所でもう一度。" };
    });
}

// ---------- スキン（通算ポイントで解放されるウェットスーツの色） ----------
const SKINS = [
  { id: "black", name: "くろ",             need: 0,     desc: "はじまりの一着" },
  { id: "blue",  name: "ベタ凪ブルー",     need: 5000,  desc: "凪の海にとける色",   tint: "#3f7fd2" },
  { id: "green", name: "海藻グリーン",     need: 15000, desc: "根に化ける保護色",   tint: "#3fa860" },
  { id: "red",   name: "アカハタレッド",   need: 30000, desc: "岩場の主張",         tint: "#d0503a" },
  { id: "gold",  name: "ヌシキラー金",     need: 60000, desc: "生ける伝説の証",     tint: "#e8b83a" },
];
let skin = store.getItem("isomoguri_skin") || "black";

function skinDef(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }
function skinUnlocked(def) { return (progress.totalScore || 0) >= def.need; }

// ベース画像に色を焼き込んだキャンバスを返す（生成アセット読込後は作り直す）
let skinTintCache = { base: null, tinted: {} };
function tintedDiver(id = skin) {
  const def = skinDef(id);
  const img = sprites.diver;
  if (!img || !img.width || !def.tint) return img;
  if (skinTintCache.base !== img) skinTintCache = { base: img, tinted: {} };
  let c = skinTintCache.tinted[def.id];
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.globalAlpha = 0.45;
    g.fillStyle = def.tint;
    g.fillRect(0, 0, img.width, img.height);
    skinTintCache.tinted[def.id] = c;
  }
  return c;
}

function askName() {
  if (typeof prompt !== "function") return false;
  const raw = prompt("ランキングに載せるニックネーム（10文字まで）", playerName);
  if (raw === null) return false;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (!name || name === playerName) return false;
  playerName = name;
  store.setItem("isomoguri_name", name);
  submitScore();
  return true;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daySerial(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// ---------- サウンド（依存なし・WebAudioで全部合成） ----------
let soundOn = store.getItem("isomoguri_snd") !== "0";
let AC = null, bgmGain = null, sfxGain = null, bgmTimer = null, bgmStep = 0, unlockEl = null;
// iOSのマナーモード（サイレントスイッチ）はWebAudioを消音するので、
// 無音の<audio>をループ再生してオーディオセッションを「再生」カテゴリに切り替える
const SILENT_WAV = "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12); // MIDIノート→Hz
// 32ステップ（8分音符）ループ。Aマイナーペンタでゆったり漂う感じ。0=休符
const BGM_MELODY = [
  69, 0, 72, 74,  76, 0, 74, 72,  69, 0, 67, 0,   64, 0, 67, 0,
  69, 0, 72, 74,  76, 0, 79, 76,  74, 72, 69, 67, 64, 0, 0, 0,
];
const BGM_BASS = [
  45, 0, 0, 0,  41, 0, 0, 0,  43, 0, 0, 0,  40, 0, 43, 0,
  45, 0, 0, 0,  41, 0, 0, 0,  43, 0, 43, 0, 45, 0, 0, 0,
];
const BGM_STEP_SEC = 0.27;

function ensureAudio() { // ユーザー操作（down/up両方）から呼ぶ（自動再生制限対策）
  if (!soundOn) return;
  if (!unlockEl) {
    unlockEl = document.createElement("audio");
    unlockEl.loop = true;
    unlockEl.setAttribute("playsinline", "");
    unlockEl.src = SILENT_WAV;
  }
  if (unlockEl.paused) unlockEl.play().catch(() => {});
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const master = AC.createGain();
    master.gain.value = 1.0;
    master.connect(AC.destination);
    bgmGain = AC.createGain(); bgmGain.gain.value = 0.8; bgmGain.connect(master);
    sfxGain = AC.createGain(); sfxGain.gain.value = 1.0; sfxGain.connect(master);
    startBGM();
  }
  if (AC.state === "suspended") AC.resume();
}

function tone(freq, at, dur, type, vol, dest) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(at); o.stop(at + dur + 0.03);
}

function startBGM() {
  bgmStep = 0;
  let next = AC.currentTime + 0.15;
  bgmTimer = setInterval(() => {
    if (!AC || AC.state !== "running") return;
    while (next < AC.currentTime + 0.6) { // 0.6秒先まで予約
      const i = bgmStep % 32;
      if (BGM_MELODY[i]) tone(NOTE(BGM_MELODY[i]), next, BGM_STEP_SEC * 0.95, "square", 0.085, bgmGain);
      if (BGM_BASS[i])   tone(NOTE(BGM_BASS[i]),   next, BGM_STEP_SEC * 2.2,  "triangle", 0.18, bgmGain);
      bgmStep++; next += BGM_STEP_SEC;
    }
  }, 120);
}

function sweep(f0, f1, dur, type, vol) { // 周波数スライドの効果音
  if (!AC || !soundOn) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.03);
}
function blip(freq, dur, type, vol) {
  if (!AC || !soundOn) return;
  tone(freq, AC.currentTime, dur, type, vol);
}
function arp(freqs, step, dur) { // 上昇アルペジオ（キャッチ音）
  if (!AC || !soundOn) return;
  const t = AC.currentTime;
  freqs.forEach((f, i) => tone(f, t + i * step, dur, "square", 0.12));
}
const sfx = {
  ui:    () => blip(660, 0.07, "square", 0.1),
  shoot: () => sweep(950, 220, 0.13, "sawtooth", 0.13),
  tap:   () => blip(500 + Math.random() * 90, 0.05, "square", 0.11),
  crit:  () => arp([880, 1108, 1318, 1760], 0.06, 0.16),
  keep:  () => arp([659, 830, 988], 0.09, 0.16),
  miss:  () => sweep(320, 140, 0.16, "square", 0.1),
  bara:  () => sweep(520, 110, 0.4, "sawtooth", 0.12),
  warn:  () => { blip(880, 0.09, "square", 0.1); if (AC) tone(880, AC.currentTime + 0.15, 0.09, "square", 0.1); },
  sad:   () => { // ハコフグごめんね（下がるワウワウ）
    if (!AC || !soundOn) return;
    const t = AC.currentTime;
    tone(392, t, 0.2, "triangle", 0.16);
    tone(370, t + 0.22, 0.2, "triangle", 0.16);
    tone(311, t + 0.44, 0.45, "triangle", 0.16);
  },
  surface: () => arp([523, 659, 784, 1046], 0.08, 0.2),
  record:  () => arp([784, 988, 1175, 1568], 0.07, 0.18),
  nushi:   () => { // ヌシの気配（低く不穏なうねり）
    if (!AC || !soundOn) return;
    const t = AC.currentTime;
    tone(98, t, 0.5, "triangle", 0.22);
    tone(92, t + 0.5, 0.9, "triangle", 0.2);
  },
};

// ---------- ドット絵（仮アセット。後でfal生成に差し替え） ----------
const OUTLINE = "#1a1f2e";
const MAPS = {
  fish: [
    ".....ooo........",
    "...oobbboo......",
    ".oobbbbbbboo.oo.",
    "oebbbbbbbbbooddo",
    "oepbbbbbbbbboddo",
    "oebbbbbbbbbooddo",
    ".oolbllblloo.oo.",
    "...oolllo.......",
    ".....ooo........",
  ],
  rock: [
    "..o..o..o.....",
    "..oooooooo....",
    ".oobbbbbbbo.o.",
    "oebbdbbdbbooo.",
    "oepbbbbbbbddo.",
    "oebbdbbdbbooo.",
    ".oobbbbbbbo.o.",
    "..oolllloo....",
    "...oooooo.....",
  ],
  box: [
    "..ooooooo..",
    ".obbbbbbbo.",
    "oebdbbdbbo.",
    "oepbbbbbboo",
    "oebdbbdbbdo",
    ".obbbbbbboo",
    "..ooooooo..",
  ],
  diver: [
    "........................",
    "....wwww................",
    ".mmmwwwwwwwwwwww.ffffff.",
    "omsswwwwwwwwwywwwffffff.",
    ".mmmwwwwwwwwwywwwffffff.",
    "..g.wwwwwwwwwwww.ffffff.",
    "....wwww................",
  ],
};
const DIVER_COLORS = {
  w: "#16161e", m: "#35c4d8", s: "#ff8c42",
  y: "#8a8f98", g: "#ffe066", f: "#f2c94c",
};

function makeSprite(map, colors, opt = {}) {
  const h = map.length, w = map[0].length;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ch = map[y][x];
      if (ch === ".") continue;
      // イシダイ用の縦縞オーバーレイ
      if (opt.stripes && ch === "b" && (x === 4 || x === 5 || x === 8 || x === 9)) ch = "d";
      let col;
      if (ch === "o") col = OUTLINE;
      else if (ch === "e") col = "#ffffff";
      else if (ch === "p") col = "#111111";
      else col = colors[ch] || "#ff00ff";
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---------- 魚種テーブル ----------
const SPECIES = {
  mebaru:   { name: "メバル",   pts: 120,  shape: "rock", size: 1.0,
              colors: { b: "#7a5a48", d: "#5c4234", l: "#c9b29a" },
              depth: [2, 9],  speed: 8,  flee: 30, taps: 7,  count: 6 },
  mejina:   { name: "メジナ",   pts: 150,  shape: "fish", size: 1.0,
              colors: { b: "#4a5568", d: "#2d3748", l: "#a0aec0" },
              depth: [3, 11], speed: 26, flee: 70, taps: 8,  school: 4, count: 2 },
  kasago:   { name: "カサゴ",   pts: 130,  shape: "rock", size: 1.0,
              colors: { b: "#b05039", d: "#7c2f1d", l: "#e8b48f" },
              depth: [6, 20], speed: 3,  flee: 0,  taps: 6,  sit: true, onRock: true, count: 4 },
  nizadai:  { name: "ニザダイ", pts: 30,   shape: "fish", size: 1.1,
              colors: { b: "#8a8f98", d: "#4a4f58", l: "#c5c9d0" },
              depth: [4, 15], speed: 20, flee: 55, taps: 8,  school: 5, count: 1 },
  ishidai:  { name: "イシダイ", pts: 400,  shape: "fish", size: 1.25, stripes: true,
              colors: { b: "#e8e4d8", d: "#22242a", l: "#ffffff" },
              depth: [5, 13], speed: 30, flee: 85, taps: 14, count: 2 },
  hakofugu: { name: "ハコフグ", pts: -100, shape: "box",  size: 0.95, cute: true,
              colors: { b: "#f2c94c", d: "#3a3a1a", l: "#fdf3c8" },
              depth: [3, 13], speed: 6,  flee: 25, taps: 0,  count: 2 },
  hiramasa: { name: "ヒラマサ", pts: 600,  shape: "fish", size: 1.6,
              colors: { b: "#c9d6de", d: "#e8c93e", l: "#eef4f8" },
              depth: [2, 8],  speed: 55, flee: 95, taps: 15, school: 2, count: 1 },
  kue:      { name: "クエ",     pts: 800,  shape: "rock", size: 1.9,
              colors: { b: "#6b5d4f", d: "#443a30", l: "#a89880" },
              depth: [14, 20], speed: 8, flee: 40, taps: 16, stTime: 4.5, sit: true, onRock: true, count: 1 },
  akahata:  { name: "アカハタ",   pts: 280,  shape: "rock", size: 1.15,
              colors: { b: "#c65a42", d: "#8b3a22", l: "#e8998f" },
              depth: [8, 18], speed: 12, flee: 35, taps: 8, sit: true, onRock: true, count: 3 },
  hirame:   { name: "ヒラメ",     pts: 320,  shape: "fish", size: 1.3,
              colors: { b: "#8b7355", d: "#5c4a3a", l: "#d4a574" },
              depth: [12, 20], speed: 5, flee: 30, taps: 9, sit: true, onRock: true, count: 2 },
  kawahagi: { name: "カワハギ",   pts: 100,  shape: "fish", size: 0.8,
              colors: { b: "#b8860b", d: "#6b5a0a", l: "#ffd700" },
              depth: [5, 16], speed: 18, flee: 50, taps: 5, school: 3, count: 4 },
  takanohadai: { name: "タカノハダイ", pts: -50, shape: "fish", size: 1.0,
              colors: { b: "#c5c9d0", d: "#7a7d82", l: "#e8ebed" },
              depth: [6, 14], speed: 22, flee: 60, taps: 7, school: 4, count: 2 },
  aobudai:  { name: "アオブダイ", pts: -200, shape: "fish", size: 1.1,
              colors: { b: "#4a8a3d", d: "#2d5a2d", l: "#7cb342" },
              depth: [5, 12], speed: 16, flee: 45, taps: 6, school: 2, count: 2 },
  madai:    { name: "マダイ",     pts: 500,  shape: "fish", size: 1.4,
              colors: { b: "#d94a4a", d: "#a53030", l: "#f5f5f5" },
              depth: [4, 14], speed: 32, flee: 78, taps: 12, count: 1 },
};
for (const [id, sp] of Object.entries(SPECIES)) sp.id = id; // リザルトで図柄を引くため

// 平均全長cm（サイズ個体差と自己記録の基準）
const LEN = { mebaru: 25, mejina: 40, kasago: 27, nizadai: 38, ishidai: 55, hakofugu: 20,
              hiramasa: 90, kue: 110, akahata: 35, hirame: 65, kawahagi: 24,
              takanohadai: 42, aobudai: 45, madai: 70 };
for (const [id, sp] of Object.entries(SPECIES)) sp.len = LEN[id] || 30;

const DAILY_TARGET_IDS = ["mebaru", "mejina", "kasago", "nizadai", "kawahagi", "akahata"];

function dailyTargetFor(key) {
  let hash = 2166136261;
  for (const ch of key) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return DAILY_TARGET_IDS[(hash >>> 0) % DAILY_TARGET_IDS.length];
}

function freshDaily(key) {
  return { date: key, targetId: dailyTargetFor(key), goal: 2, progress: 0, completed: false };
}

function ensureDaily() {
  const key = localDateKey();
  if (!daily || daily.date !== key || !SPECIES[daily.targetId]) {
    daily = freshDaily(key);
    saveJSON("isomoguri_daily", daily);
  }
}

function recordDiveStart() {
  ensureDaily();
  if (progress.lastDay !== daily.date) {
    const gap = progress.lastDay ? daySerial(daily.date) - daySerial(progress.lastDay) : 0;
    progress.streak = gap === 1 ? progress.streak + 1 : 1;
    progress.lastDay = daily.date;
  }
  progress.dives++;
  saveJSON("isomoguri_progress", progress);
}

// ---------- 状態 ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

let sprites = {};
let state, diver, fishes, rocks, weeds, bubbles, popups;
let oxygen, bag, cuteBonus, comboBonus, dailyBonus, discoveryBonus, surfaceBonus, sizeBonus, bestCatch;
let combo, runBestCombo, cam, camX, tGame, aim, struggle, resultData, catchCut, shotFx;
let hintShown, quote, careWord;
let tapGuardUntil = 0, screenShake = 0, flash = 0;
let highScore = Number(store.getItem("isomoguri_hs") || 0);
let dex = loadJSON("isomoguri_dex", {}); // { fishId: { caught: N, seen: N } }
let progress = Object.assign(
  { dives: 0, totalCaught: 0, streak: 0, lastDay: "", bestCombo: 0 },
  loadJSON("isomoguri_progress", {})
);
let daily = loadJSON("isomoguri_daily", null);
ensureDaily();
// スキン導入前から遊んでいた人は、ハイスコア分を通算ポイントの初期値として認める
if (progress.totalScore === undefined) progress.totalScore = highScore;

// 描画時の基準幅（生成アセットはこの幅に揃えて表示する）
const BASE_W = { fish: 16, rock: 14, box: 11, diver: 24 };

function initSprites() {
  for (const [id, sp] of Object.entries(SPECIES)) {
    sprites[id] = makeSprite(MAPS[sp.shape], sp.colors, { stripes: sp.stripes });
  }
  // 生成済み素材に合わせ、仮スプライトも顔が右になるよう正規化する。
  sprites.diver = makeSprite(MAPS.diver.map(row => [...row].reverse().join("")), DIVER_COLORS);
  // fal生成アセットがあれば差し替え（無ければ仮ドット絵のまま）
  const src = window.__ASSETS || {};
  for (const id of [...Object.keys(SPECIES), "diver"]) {
    const img = new Image();
    img.onload = () => { sprites[id] = img; };
    img.src = src[id] || "assets/" + id + ".png";
  }
  // カットイン用のアップ画像（無ければ通常スプライトを拡大表示）
  // hakofugu_sad はハコフグを突いた時の「ごめんね」演出専用
  for (const id of [...Object.keys(SPECIES), "hakofugu_sad"]) {
    const img = new Image();
    img.onload = () => { sprites[id + "_big"] = img; };
    img.src = src[id + "_big"] || "assets/" + id + "_big.png";
  }
}

function spriteScale(id, shape) {
  const img = sprites[id];
  return (BASE_W[shape] || img.width) / img.width;
}

function reset() {
  ensureDaily();
  state = "title";
  diver = { x: WORLD_W / 2, y: 8, vx: 0, vy: 0, angle: Math.PI / 2, maxDepth: 0 };
  oxygen = O2_MAX;
  bag = []; cuteBonus = 0; comboBonus = 0; dailyBonus = 0; discoveryBonus = 0; surfaceBonus = 0;
  sizeBonus = 0; bestCatch = null;
  combo = 0; runBestCombo = 0;
  cam = 0; camX = WORLD_W / 2 - VW / 2; tGame = 0;
  aim = null; struggle = null; resultData = null; catchCut = null; shotFx = null;
  popups = []; bubbles = [];
  hintShown = false;
  tapGuardUntil = 0; screenShake = 0; flash = 0;
  current = Math.random() < 0.5 ? -1 : 1;
  quote = QUOTES[(Math.random() * QUOTES.length) | 0];
  careWord = QUOTES[(Math.random() * 2) | 0]; // 先頭2つはケアワード
  spawnTerrain();
  spawnFish();
}

function beginDive() {
  reset();
  recordDiveStart();
  state = "dive";
  diver.vy = 75;
  diver.angle = Math.PI / 2;
}

function spawnTerrain() {
  rocks = []; weeds = [];
  // 海底の岩盤
  for (let x = -10; x < WORLD_W + 10; x += 18) {
    rocks.push({ x, y: WORLD_H - 20 + Math.random() * 25, r: 16 + Math.random() * 14 });
  }
  // 中層の根（各層に2クラスタ、横位置ランダム）
  for (let y = 500; y < WORLD_H - 150; y += 260) {
    for (let c = 0; c < 2; c++) {
      const bx = 30 + Math.random() * (WORLD_W - 60);
      for (let i = 0; i < 4; i++) {
        rocks.push({ x: bx + i * 14 - 21 + (Math.random() * 10 - 5),
                     y: y + Math.random() * 40, r: 10 + Math.random() * 12 });
      }
      if (Math.random() < 0.8) weeds.push({ x: bx, y: y - 10, h: 40 + Math.random() * 30 });
    }
  }
  for (let i = 0; i < 18; i++) {
    weeds.push({ x: 20 + Math.random() * (WORLD_W - 40), y: WORLD_H - 25, h: 45 + Math.random() * 40 });
  }
}

function spawnFish() {
  fishes = [];
  for (const [id, sp] of Object.entries(SPECIES)) {
    if (!dex[id]) dex[id] = { caught: 0, seen: 0 };

    for (let n = 0; n < sp.count; n++) {
      let hx, hy;
      if (sp.onRock) {
        // 深度帯に合う岩の上に付く（カサゴ・クエ。中層に浮かせない）
        const cands = rocks.filter(r =>
          r.y >= sp.depth[0] * PX_PER_M && r.y <= Math.min(sp.depth[1] * PX_PER_M + 100, WORLD_H));
        const r = cands[(Math.random() * cands.length) | 0];
        hx = r.x; hy = r.y - r.r - 5;
      } else {
        const dep = sp.depth[0] + Math.random() * (sp.depth[1] - sp.depth[0]);
        hy = dep * PX_PER_M;
        hx = 25 + Math.random() * (WORLD_W - 50);
      }
      const members = sp.school || 1;
      const jx = sp.onRock ? 8 : 40, jy = sp.onRock ? 4 : 30;
      for (let m = 0; m < members; m++) {
        // サイズ個体差（ペナルティ魚は固定）。得点と自己記録cmの元になる
        const szMul = sp.pts > 0 ? 0.85 + Math.random() * 0.45 : 1;
        fishes.push({
          id, sp, szMul, cm: Math.round(sp.len * szMul),
          x: hx + (Math.random() * jx - jx / 2), y: hy + (Math.random() * jy - jy / 2),
          hx, hy, vx: 0, vy: 0, dir: Math.random() < 0.5 ? 1 : -1,
          wt: Math.random() * 2, fleeT: 0, cuteT: 0, cuteDone: false,
          alive: true, wound: false, nushi: false, noticed: false,
        });
      }
    }
  }
  // ヌシ：低確率で1匹だけ特大個体が出る（出会えたら大チャンス）
  if (Math.random() < 0.22) {
    const cands = fishes.filter(f => ["ishidai", "hiramasa", "madai", "kue", "akahata"].includes(f.id));
    const f = cands[(Math.random() * cands.length) | 0];
    if (f) {
      f.nushi = true;
      f.szMul = 1.7 + Math.random() * 0.35;
      f.cm = Math.round(f.sp.len * f.szMul);
    }
  }
}

// ---------- 入力 ----------
let ptr = {
  down: false, id: null, x: 0, y: 0, downX: 0, downY: 0,
  downT: 0, moved: 0, startedState: null, consumed: false,
};

function toGame(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH };
}

function armTapGuard(now = performance.now()) {
  tapGuardUntil = Math.max(tapGuardUntil, now + TAP_GUARD_MS);
}

function onDown(e) {
  if (ptr.down || (e.button !== undefined && e.button !== 0)) return;
  e.preventDefault();
  ensureAudio();
  const p = toGame(e);
  const now = performance.now();
  ptr.down = true; ptr.id = e.pointerId; ptr.x = p.x; ptr.y = p.y;
  ptr.downX = p.x; ptr.downY = p.y; ptr.downT = now; ptr.moved = 0;
  ptr.startedState = state; ptr.consumed = false;
  if (canvas.setPointerCapture && e.pointerId !== undefined) {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
  if (state === "struggle") {
    ptr.consumed = true;
    struggleTap();
    return;
  }
  // キープ演出中と連打直後は、タップが続く限り受付再開を先送りする。
  if (state === "dive" && (catchCut || now < tapGuardUntil)) {
    ptr.consumed = true;
    armTapGuard(now);
  }
}

function onMove(e) {
  if (!ptr.down || (ptr.id !== null && e.pointerId !== ptr.id)) return;
  e.preventDefault();
  const p = toGame(e);
  ptr.moved += Math.hypot(p.x - ptr.x, p.y - ptr.y);
  ptr.x = p.x; ptr.y = p.y;
}

function finishPointer(e) {
  if (!ptr.down || (ptr.id !== null && e.pointerId !== ptr.id)) return null;
  const p = toGame(e);
  ptr.x = p.x; ptr.y = p.y;
  const gesture = {
    startedState: ptr.startedState,
    consumed: ptr.consumed,
    x: p.x, y: p.y,
    downX: ptr.downX, downY: ptr.downY,
    elapsed: performance.now() - ptr.downT,
    moved: ptr.moved,
  };
  ptr.down = false; ptr.id = null; ptr.startedState = null; ptr.consumed = false;
  if (canvas.releasePointerCapture && e.pointerId !== undefined) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  return gesture;
}

function onUp(e) {
  e.preventDefault();
  ensureAudio();
  const g = finishPointer(e);
  if (!g || g.consumed) return;
  const isTap = g.elapsed < 280 && g.moved < 14;
  // 入力開始時と終了時の状態が同じ時だけ処理し、1回の指離しを次の状態へ持ち越さない。
  if (g.startedState === "title" && state === "title" && isTap) {
    // サウンドON/OFFボタン（左上）
    if (g.x >= 6 && g.x <= 40 && g.downY >= 6 && g.downY <= 22) {
      soundOn = !soundOn;
      store.setItem("isomoguri_snd", soundOn ? "1" : "0");
      if (soundOn) { ensureAudio(); sfx.ui(); }
      else { if (AC) AC.suspend(); if (unlockEl) unlockEl.pause(); }
      return;
    }
    // スキンボタン（サウンドの右隣）
    if (g.x >= 46 && g.x <= 84 && g.downY >= 6 && g.downY <= 22) {
      sfx.ui();
      state = "skin"; return;
    }
    // 図鑑ボタン
    if (g.x >= VW - 32 && g.x <= VW - 6 && g.downY >= 6 && g.downY <= 22) {
      sfx.ui();
      state = "dex"; return;
    }
    // ランキングボタン
    if (g.x >= VW - 64 && g.x <= VW - 38 && g.downY >= 6 && g.downY <= 22) {
      sfx.ui();
      fetchRanking();
      state = "rank"; return;
    }
    // 海況ボタン（3段）のヒット判定
    for (let i = 0; i < 3; i++) {
      const by = 292 + i * 34;
      if (g.x >= 35 && g.x <= VW - 35 && g.downY >= by && g.downY <= by + 28) {
        sfx.ui();
        mode = MODES[MODE_KEYS[i]];
        beginDive();
        return;
      }
    }
    return;
  }
  if (g.startedState === "dex" && state === "dex" && isTap) { state = "title"; return; }
  if (g.startedState === "skin" && state === "skin" && isTap) {
    // 行タップ＝装備（解放済みのみ）。行の外＝タイトルへ戻る
    for (let i = 0; i < SKINS.length; i++) {
      const top = 88 + i * 52;
      if (g.x >= 18 && g.x <= VW - 18 && g.y >= top && g.y <= top + 46) {
        const def = SKINS[i];
        if (skinUnlocked(def) && skin !== def.id) {
          skin = def.id;
          store.setItem("isomoguri_skin", skin);
          sfx.ui();
        }
        return;
      }
    }
    state = "title"; return;
  }
  if (g.startedState === "rank" && state === "rank" && isTap) {
    // 下部の帯＝名前の登録・変更。それ以外はタイトルへ戻る
    if (g.y >= VH - 48 && g.y <= VH - 16) {
      sfx.ui();
      if (askName()) fetchRanking();
      return;
    }
    state = "title"; return;
  }
  if (g.startedState === "result" && state === "result" && isTap && performance.now() - resultData.t > 800) {
    if (g.x < 52 && g.y < 32) reset();
    else beginDive();
    return;
  }
  if (g.startedState === "dive" && state === "dive" && isTap) tryAim(g.x + camX, g.y + cam);
  else if (g.startedState === "aim" && state === "aim" && isTap && aim.t >= AIM_MIN_TIME) fire();
}

function onCancel(e) {
  if (!ptr.down || (ptr.id !== null && e.pointerId !== ptr.id)) return;
  e.preventDefault();
  ptr.down = false; ptr.id = null; ptr.startedState = null; ptr.consumed = false;
}

canvas.addEventListener("pointerdown", onDown);
canvas.addEventListener("pointermove", onMove);
canvas.addEventListener("pointerup", onUp);
canvas.addEventListener("pointercancel", onCancel);
canvas.addEventListener("contextmenu", e => e.preventDefault());

// ---------- 突き ----------
function nearestFish() {
  let best = null, bd = SPEAR_RANGE;
  for (const f of fishes) {
    if (!f.alive) continue;
    const d = Math.hypot(f.x - diver.x, f.y - diver.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function fishAt(wx, wy) {
  let best = null, bestTapD = Infinity;
  for (const f of fishes) {
    if (!f.alive || Math.hypot(f.x - diver.x, f.y - diver.y) > SPEAR_RANGE) continue;
    const tapD = Math.hypot(f.x - wx, f.y - wy);
    const hitR = TARGET_TAP_RADIUS + f.sp.size * 5;
    if (tapD <= hitR && tapD < bestTapD) { best = f; bestTapD = tapD; }
  }
  return best;
}

function turnToward(currentAngle, targetAngle, amount) {
  let d = targetAngle - currentAngle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return currentAngle + d * Math.min(1, amount);
}

function tryAim(wx, wy) {
  if (performance.now() < tapGuardUntil || catchCut) return;
  const f = fishAt(wx, wy);
  if (!f) return;
  aim = { target: f, t: 0 };
  diver.vx *= 0.3; diver.vy *= 0.3;
  diver.angle = Math.atan2(f.y - diver.y, f.x - diver.x);
  state = "aim";
}
function fire() {
  const f = aim.target;
  const v = gaugeValue(aim.t);          // 0..1
  const off = Math.abs(v - 0.5);
  aim = null;
  const spearDone = (fn) => { struggleOrCatch(f, fn); };
  shotFx = { x1: diver.x, y1: diver.y, x2: f.x, y2: f.y, t: 0.16, dur: 0.16 };
  screenShake = Math.max(screenShake, 2.5);
  sfx.shoot();
  haptic(12);
  if (!f.alive || Math.hypot(f.x - diver.x, f.y - diver.y) > SPEAR_RANGE * 1.4) {
    breakCombo();
    sfx.miss();
    popup(diver.x, diver.y - 20, "外した…", "#cfd8e3");
    state = "dive"; return;
  }
  if (f.sp.cute) { // ハコフグは突いたら問答無用でマイナス。悲しいカットイン
    f.alive = false;
    const reward = catchFish(f, "poor");
    sfx.sad();
    catchCut = { id: "hakofugu_sad", sp: f.sp, t: 2.2, dur: 2.2, sad: true, award: reward.award };
    armTapGuard();
    state = "dive"; return;
  }
  if (off < CRIT * mode.gauge)      spearDone("crit");
  else if (off < GOOD * mode.gauge) spearDone("good");
  else if (off < Math.min(0.48, POOR * mode.gauge)) spearDone("poor");
  else {
    breakCombo();
    flee(f, 2.0);
    sfx.miss();
    // ギリギリ外しは「おしい！」でもう一回を誘う
    const near = off < Math.min(0.48, POOR * mode.gauge) * 1.35;
    popup(f.x, f.y, near ? "おしい！" : "外した！", near ? "#ffe066" : "#cfd8e3");
    state = "dive";
  }
}
function struggleOrCatch(f, quality) {
  if (quality === "crit") {
    f.alive = false;
    const reward = catchFish(f, quality);
    sfx.crit();
    haptic([18, 35, 28]);
    flash = 0.22; screenShake = Math.max(screenShake, 4);
    catchCut = { id: f.id, sp: f.sp, t: 1.5, dur: 1.5, crit: true, ...reward };
    armTapGuard();
    state = "dive"; return;
  }
  const mult = quality === "poor" ? 1.7 : 1.0;
  const nushiMul = f.nushi ? 1.5 : 1;   // ヌシは大格闘
  const dur = (f.sp.stTime || 3.5) * mode.time * (f.nushi ? 1.35 : 1);
  struggle = { f, need: Math.max(3, Math.ceil(f.sp.taps * mult * mode.taps * nushiMul)),
               taps: 0, timer: dur, dur, quality };
  state = "struggle";
}
function struggleTap() {
  if (!struggle) return;
  struggle.taps++;
  sfx.tap();
  haptic(7);
  oxygen = Math.max(0, oxygen - 0.5);
  if (struggle.taps >= struggle.need) {
    const f = struggle.f;
    const quality = struggle.quality;
    f.alive = false;
    const reward = catchFish(f, quality);
    sfx.keep();
    haptic(22);
    if (f.nushi) { flash = 0.25; screenShake = Math.max(screenShake, 5); }
    catchCut = { id: f.id, sp: f.sp, t: f.nushi ? 2.4 : 1.5, dur: f.nushi ? 2.4 : 1.5,
                 crit: false, ...reward };
    struggle = null; state = "dive";
    armTapGuard();
  }
}

function haptic(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function breakCombo() { combo = 0; }
function flee(f, mult) {
  f.fleeT = 1.5;
  const a = Math.atan2(f.y - diver.y, f.x - diver.x);
  f.vx = Math.cos(a) * f.sp.speed * 3 * (mult || 1);
  f.vy = Math.sin(a) * f.sp.speed * 3 * (mult || 1);
  f.hx = Math.max(20, Math.min(WORLD_W - 20, f.x + f.vx * 3));
  f.hy = Math.max(150, Math.min(WORLD_H - 40, f.y + f.vy * 3));
}
function gaugeValue(t) { // 0→1→0 の往復（周期1.1秒）
  const c = (t % 1.1) / 1.1;
  return c < 0.5 ? c * 2 : (1 - c) * 2;
}
function catchFish(f, quality) {
  const wasNew = !dex[f.id] || dex[f.id].caught === 0;
  bag.push(f.sp);
  if (!dex[f.id]) dex[f.id] = { caught: 0, seen: 0 };
  dex[f.id].seen = 1;
  dex[f.id].caught++;

  let chainBonus = 0, o2Bonus = 0, discovery = 0, mission = 0, newRec = false;
  let award = f.sp.pts;
  if (f.sp.pts > 0) {
    // サイズとヌシで基礎点が変わる（大物ほど高い）
    const base = Math.round(f.sp.pts * (f.szMul || 1) * (f.nushi ? 2 : 1) / 5) * 5;
    sizeBonus += base - f.sp.pts;
    combo++;
    runBestCombo = Math.max(runBestCombo, combo);
    progress.bestCombo = Math.max(progress.bestCombo, combo);
    const multiplier = 1 + Math.min(4, combo - 1) * 0.2;
    chainBonus = Math.floor(base * (multiplier - 1));
    comboBonus += chainBonus;
    award = base + chainBonus;
    if (wasNew) {
      discovery = 150;
      discoveryBonus += discovery;
      popup(f.x, f.y - 18, "新発見 +150", "#9ad8f0");
    }
    if (quality === "crit") {
      o2Bonus = 1.5;
      oxygen = Math.min(O2_MAX, oxygen + o2Bonus);
    }
    // 大物キープの高揚感＝ひと呼吸ぶんの余裕（深場からの生還率を上げる）
    if (f.sp.pts >= 400) {
      const breath = f.nushi ? 5 : 3;
      oxygen = Math.min(O2_MAX, oxygen + breath);
      o2Bonus += breath;
      popup(f.x, f.y - 42, "ひと呼吸 +" + breath + "秒", "#7bd88f");
    }
    // 種ごとの自己記録（cm）。初捕獲は記録扱いにせず、更新時だけ祝う
    const prevRec = dex[f.id].rec || 0;
    if (f.cm > prevRec) {
      dex[f.id].rec = f.cm;
      if (prevRec > 0) {
        newRec = true;
        sfx.record();
        screenShake = Math.max(screenShake, 3);
        popup(f.x, f.y - 30, "自己記録！ " + f.cm + "cm", "#ffe066");
      }
    }
    if (!bestCatch || award > bestCatch.award) {
      bestCatch = { id: f.id, sp: f.sp, cm: f.cm, award, nushi: !!f.nushi };
    }
    // 生涯最大の1匹（ランキング「ヌシの部」用）
    if (f.cm > bigFish.cm) {
      bigFish = { cm: f.cm, id: f.id };
      saveJSON("isomoguri_bigfish", bigFish);
    }
  } else {
    breakCombo();
  }

  if (!daily.completed && f.id === daily.targetId) {
    daily.progress = Math.min(daily.goal, daily.progress + 1);
    if (daily.progress >= daily.goal) {
      daily.completed = true;
      mission = DAILY_REWARD;
      dailyBonus += mission;
      popup(f.x, f.y - 30, "本日の狙い達成 +300", "#ffe066");
    }
    saveJSON("isomoguri_daily", daily);
  }

  progress.totalCaught++;
  saveJSON("isomoguri_progress", progress);
  saveJSON("isomoguri_dex", dex);
  return {
    award,
    chainBonus,
    combo,
    o2Bonus,
    discovery,
    mission,
    cm: f.cm,
    nushi: !!f.nushi,
    newRec,
  };
}

// ---------- 更新 ----------
function rawRunScore() {
  return bag.reduce((sum, sp) => sum + sp.pts, 0) + cuteBonus + comboBonus + dailyBonus + discoveryBonus + surfaceBonus + sizeBonus;
}

function resultRank(total, blackout) {
  if (blackout) return "D";
  if (total >= 1800) return "S";
  if (total >= 1000) return "A";
  if (total >= 450) return "B";
  return "C";
}

function endRun(blackout) {
  surfaceBonus = blackout ? 0 : Math.floor((diver.maxDepth / PX_PER_M) * Math.max(0, oxygen) * 0.6);
  let total = rawRunScore();
  let note = null;
  if (blackout) { total = Math.floor(total / 2); note = "ブラックアウト！ 獲物の半分を失った…"; }
  total = Math.floor(total * mode.score);
  const isNew = total > highScore;
  if (isNew) { highScore = total; store.setItem("isomoguri_hs", String(highScore)); }
  progress.bestScore = Math.max(progress.bestScore || 0, total);
  // 通算ポイント（スキン解放の条件）。またいだしきい値があれば解放を祝う
  const prevTotal = progress.totalScore || 0;
  progress.totalScore = prevTotal + total;
  let newSkin = null;
  for (const s of SKINS) {
    if (s.need > 0 && prevTotal < s.need && progress.totalScore >= s.need) newSkin = s;
  }
  saveJSON("isomoguri_progress", progress);
  saveJSON("isomoguri_dex", dex);
  if (!blackout) sfx.surface(); else sfx.bara();
  if (newSkin) sfx.record();
  submitScore();
  resultData = {
    total, note, isNew, rank: resultRank(total, blackout), blackout, newSkin,
    bonusTotal: comboBonus + dailyBonus + discoveryBonus + surfaceBonus + sizeBonus,
    t: performance.now(),
  };
  state = "result";
}

function update(dt) {
  tGame += dt;
  const ts = state === "aim" ? 0.25 : 1;   // エイム中は時間スロー
  // エイム集中中はBGMを絞る（水中の静けさ演出）
  if (bgmGain) bgmGain.gain.value = state === "aim" ? 0.25 : 0.8;

  if (state === "dive" || state === "aim" || state === "struggle") {
    // 酸素。格闘中は食いしばって耐える（消費をゆるめ、深場の大物戦を成立させる）
    const depthM = diver.y / PX_PER_M;
    const drainMul = state === "struggle" ? 0.55 : 1;
    oxygen -= dt * (0.6 + depthM / 14) * mode.o2 * drainMul;
    if (oxygen <= 0) { endRun(true); return; }
    if (!hintShown && oxygen < O2_MAX * 0.3) {
      hintShown = true;
      sfx.warn();
      popup(diver.x, diver.y - 25, "そろそろ浮上！", "#ff8c8c");
    }

    // ダイバー移動（ホールドで指の方向へ）
    if (state === "dive") {
      if (ptr.down && ptr.moved > 6) {
        const wx = ptr.x + camX, wy = ptr.y + cam;
        const a = Math.atan2(wy - diver.y, wx - diver.x);
        diver.vx += Math.cos(a) * 230 * dt;
        diver.vy += Math.sin(a) * 230 * dt;
      }
      diver.vx *= Math.pow(0.02, dt); diver.vy *= Math.pow(0.02, dt);
      diver.vy += 6 * dt; // ウエイトでわずかに沈む
      const sp = Math.hypot(diver.vx, diver.vy);
      // 浮上方向は浮力が味方する（深場からの帰り道を少し楽に）
      const max = diver.vy < -20 ? 132 : 115;
      if (sp > max) { diver.vx *= max / sp; diver.vy *= max / sp; }
      // 流れも含めた実移動方向へ、頭から進むように追従する。
      const motionVx = diver.vx + current * mode.drift;
      const motionSp = Math.hypot(motionVx, diver.vy);
      if (motionSp > 14) {
        const ta = Math.atan2(diver.vy, motionVx);
        diver.angle = turnToward(diver.angle, ta, dt * 7);
      }
      diver.x = Math.max(8, Math.min(WORLD_W - 8, diver.x + motionVx * dt));
      diver.y = Math.max(4, Math.min(WORLD_H - 10, diver.y + diver.vy * dt));
      diver.maxDepth = Math.max(diver.maxDepth, diver.y);
      if (diver.y <= 12 && diver.maxDepth > 60) { endRun(false); return; }
    }
    if (state === "aim") {
      aim.t += dt;
      const f = aim.target;
      if (!f.alive || Math.hypot(f.x - diver.x, f.y - diver.y) > SPEAR_RANGE * 1.4) {
        aim = null; state = "dive";
      } else {
        const ta = Math.atan2(f.y - diver.y, f.x - diver.x);
        diver.angle = turnToward(diver.angle, ta, dt * 12);
      }
    }
    if (state === "struggle") {
      struggle.timer -= dt;
      if (struggle.timer <= 0) {
        const f = struggle.f;
        f.wound = true; flee(f, 2.5);
        breakCombo();
        sfx.bara();
        popup(f.x, f.y, "バラした！", "#ff8c8c");
        struggle = null; state = "dive";
        armTapGuard();
      }
    }

    // 魚
    for (const f of fishes) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - diver.x, f.y - diver.y);
      // 逃走
      if (f.fleeT > 0) {
        f.fleeT -= dt * ts;
      } else if (f.sp.flee > 0 && d < f.sp.flee * mode.flee && Math.hypot(diver.vx, diver.vy) > 35) {
        flee(f, 1);
      } else {
        // うろうろ
        f.wt -= dt * ts;
        if (f.wt <= 0) {
          f.wt = 1.5 + Math.random() * 2;
          const a = Math.random() * Math.PI * 2;
          const r = f.sp.sit ? 6 : 45;
          const tx = f.hx + Math.cos(a) * r, ty = f.hy + Math.sin(a) * r * 0.5;
          const aa = Math.atan2(ty - f.y, tx - f.x);
          f.vx = Math.cos(aa) * f.sp.speed;
          f.vy = Math.sin(aa) * f.sp.speed * 0.5;
        }
      }
      f.x += f.vx * dt * ts; f.y += f.vy * dt * ts;
      f.x = Math.max(10, Math.min(WORLD_W - 10, f.x));
      f.y = Math.max(140, Math.min(WORLD_H - 30, f.y));
      if (Math.abs(f.vx) > 1) f.dir = f.vx < 0 ? 1 : -1;
      // ヌシとの遭遇（一度だけ、不穏な音と気配）
      if (f.nushi && !f.noticed && d < 190 && Math.abs(f.y - cam - VH / 2) < VH * 0.7) {
        f.noticed = true;
        sfx.nushi();
        popup(f.x, f.y - 18, "……でかい。ヌシだ", "#ffe066");
      }
      // ハコフグ観賞ボーナス
      if (f.sp.cute && !f.cuteDone && d < 45) {
        f.cuteT += dt;
        if (f.cuteT >= 3) {
          f.cuteDone = true; cuteBonus += 50;
          popup(f.x, f.y - 12, "かわいい… +50", "#ffb3d9");
        }
      }
    }

    // 泡
    if (Math.random() < dt * 2.5) {
      const back = diver.angle + Math.PI;
      bubbles.push({
        x: diver.x + Math.cos(back) * 8,
        y: diver.y + Math.sin(back) * 8,
        r: 1 + Math.random() * 2,
      });
    }
  }

  for (const b of bubbles) { b.y -= 35 * dt; b.x += Math.sin(b.y / 12) * 0.3; }
  bubbles = bubbles.filter(b => b.y > cam - 10 && b.y > 2);
  for (const p of popups) p.t -= dt;
  popups = popups.filter(p => p.t > 0);
  if (catchCut) { catchCut.t -= dt; if (catchCut.t <= 0) catchCut = null; }
  if (shotFx) { shotFx.t -= dt; if (shotFx.t <= 0) shotFx = null; }
  screenShake = Math.max(0, screenShake - dt * 18);
  flash = Math.max(0, flash - dt);

  // カメラ
  const targetCam = Math.max(0, Math.min(WORLD_H - VH, diver.y - 150));
  cam += (targetCam - cam) * Math.min(1, dt * 6);
  const targetCamX = Math.max(0, Math.min(WORLD_W - VW, diver.x - VW / 2));
  camX += (targetCamX - camX) * Math.min(1, dt * 6);
}

function popup(x, y, txt, color) { popups.push({ x, y, txt, color, t: 1.6 }); }

// ---------- 描画 ----------
function lerpColor(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function draw() {
  // 水（深度で暗く）
  const t0 = cam / WORLD_H, t1 = (cam + VH) / WORLD_H;
  const grad = ctx.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, lerpColor("#6ec6e8", "#06263f", t0));
  grad.addColorStop(1, lerpColor("#6ec6e8", "#06263f", t1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  const shakeX = screenShake ? (Math.random() - 0.5) * screenShake : 0;
  const shakeY = screenShake ? (Math.random() - 0.5) * screenShake : 0;
  ctx.translate(-Math.round(camX) + shakeX, -Math.round(cam) + shakeY);

  // 水面と光
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(0, 0, WORLD_W, 3);
  if (cam < 420) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < 10; i++) {
      const rx = 30 + i * 60 + Math.sin(tGame * 0.4 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(rx, 0); ctx.lineTo(rx + 26, 0);
      ctx.lineTo(rx + 60, 420); ctx.lineTo(rx + 18, 420);
      ctx.closePath(); ctx.fill();
    }
  }

  // 岩
  for (const r of rocks) {
    if (r.y + r.r < cam || r.y - r.r > cam + VH) continue;
    ctx.fillStyle = "#233042";
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f4058";
    ctx.beginPath(); ctx.arc(r.x - r.r * 0.25, r.y - r.r * 0.3, r.r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  // 海藻
  for (const w of weeds) {
    if (w.y - w.h > cam + VH || w.y < cam) continue;
    ctx.strokeStyle = "#2e6e4e"; ctx.lineWidth = 3;
    for (let s = -1; s <= 1; s++) {
      ctx.beginPath();
      ctx.moveTo(w.x + s * 4, w.y);
      const sway = Math.sin(tGame * 1.2 + w.x + s) * 6;
      ctx.quadraticCurveTo(w.x + s * 5 + sway, w.y - w.h * 0.6, w.x + s * 3 + sway * 1.6, w.y - w.h);
      ctx.stroke();
    }
  }

  // 魚
  for (const f of fishes) {
    if (!f.alive) continue;
    if (f.y < cam - 20 || f.y > cam + VH + 20) continue;
    if (dex[f.id] && dex[f.id].seen === 0) dex[f.id].seen = 1;
    const img = sprites[f.id];
    const s = f.sp.size * (f.szMul || 1) * spriteScale(f.id, f.sp.shape);
    if (f.nushi) { // ヌシは金色の気配をまとう
      ctx.fillStyle = "rgba(255,224,102," + (0.10 + 0.06 * Math.sin(tGame * 3)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(f.x, f.y, 18 * f.sp.size * f.szMul, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(Math.round(f.x), Math.round(f.y + Math.sin(tGame * 2 + f.hx) * 1.5));
    ctx.scale(f.dir * s, s);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    if (f.wound) {
      ctx.fillStyle = "rgba(255,255,180," + (0.5 + Math.sin(tGame * 8) * 0.3) + ")";
      ctx.fillRect(f.x - 1, f.y - 1, 2, 2);
    }
  }

  // 突きの一瞬だけ射線を残し、どの魚へ突いたかを明確にする。
  if (shotFx) {
    ctx.globalAlpha = Math.max(0, shotFx.t / shotFx.dur);
    ctx.strokeStyle = "#f5ead0"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(shotFx.x1, shotFx.y1); ctx.lineTo(shotFx.x2, shotFx.y2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 照準（射程内の最寄りの魚）
  if (state === "dive" || state === "aim") {
    const tf = state === "aim" ? aim.target : nearestFish();
    if (tf && tf.alive) {
      const blink = Math.sin(tGame * 6) > -0.3;
      if (blink) {
        ctx.strokeStyle = state === "aim" ? "#ffe066" : "rgba(255,224,102,0.6)";
        ctx.lineWidth = 1;
        const r = 12 * tf.sp.size * (tf.szMul || 1);
        ctx.strokeRect(tf.x - r, tf.y - r * 0.7, r * 2, r * 1.4);
      }
    }
  }

  // ダイバー＋手銛
  ctx.save();
  ctx.translate(Math.round(diver.x), Math.round(diver.y));
  ctx.rotate(diver.angle);
  // 左へ進む時だけ腹側を反転し、180度回転で上下逆さになるのを防ぐ。
  if (Math.cos(diver.angle) < 0) ctx.scale(1, -1);
  // 手銛（長尺）
  ctx.strokeStyle = "#d9c8a0"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(42, 1); ctx.stroke();
  ctx.strokeStyle = "#cfd8e3";
  ctx.beginPath(); ctx.moveTo(42, 1); ctx.lineTo(47, -1); ctx.moveTo(42, 1); ctx.lineTo(47, 3); ctx.stroke();
  {
    const dImg = tintedDiver();
    const k = spriteScale("diver", "diver");
    ctx.drawImage(dImg, -12, -dImg.height * k / 2, dImg.width * k, dImg.height * k);
  }
  // ライトの光
  ctx.fillStyle = "rgba(255,240,160,0.15)";
  ctx.beginPath();
  ctx.moveTo(10, 2); ctx.lineTo(58, -10); ctx.lineTo(58, 16); ctx.closePath(); ctx.fill();
  ctx.restore();

  // 泡
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (const b of bubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }

  // ポップアップ
  ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.t);
    ctx.fillStyle = p.color;
    ctx.fillText(p.txt, p.x, p.y - (1.6 - p.t) * 14);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  drawHUD();
  if (state === "title") drawTitle();
  if (state === "dex") drawDex();
  if (state === "rank") drawRank();
  if (state === "skin") drawSkin();
  if (state === "aim") drawGauge();
  if (state === "struggle") drawStruggle();
  if (catchCut && state === "dive") drawCatch();
  if (state === "result") drawResult();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,245,190,${Math.min(0.28, flash)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
}

function drawHUD() {
  if (state === "title" || state === "dex" || state === "result" || state === "rank" || state === "skin") return;
  // 酸素
  ctx.fillStyle = "rgba(10,20,35,0.7)";
  ctx.fillRect(6, 6, 106, 12);
  const r = oxygen / O2_MAX;
  ctx.fillStyle = r < 0.3 ? (Math.sin(tGame * 8) > 0 ? "#ff5c5c" : "#a03030") : "#4dd2ff";
  ctx.fillRect(8, 8, 102 * Math.max(0, r), 8);
  ctx.font = "bold 8px monospace"; ctx.textAlign = "left";
  ctx.fillStyle = "#fff"; ctx.fillText("O2", 10, 15);
  // 深度
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(10,20,35,0.7)"; ctx.fillRect(VW - 58, 6, 52, 12);
  ctx.fillStyle = "#fff";
  ctx.fillText((diver.y / PX_PER_M).toFixed(1) + " m", VW - 10, 15);
  // 本日の狙い
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(10,20,35,0.7)"; ctx.fillRect(6, 22, 112, 12);
  drawFishIcon(daily.targetId, 16, 28, 14);
  ctx.fillStyle = daily.completed ? "#7bd88f" : "#cfd8e3";
  const dailyMark = daily.completed ? "達成" : `${daily.progress}/${daily.goal}`;
  ctx.fillText(`本日 ${SPECIES[daily.targetId].name} ${dailyMark}`, 27, 31);
  // 獲物
  const pts = Math.floor(rawRunScore() * mode.score);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(10,20,35,0.7)"; ctx.fillRect(6, VH - 18, VW - 12, 12);
  ctx.fillStyle = "#ffe066";
  ctx.fillText("袋 " + bag.length + "匹  " + pts + "pt", 10, VH - 9);
  if (combo >= 2) {
    const mult = (1 + Math.min(4, combo - 1) * 0.2).toFixed(1);
    ctx.textAlign = "right"; ctx.fillStyle = "#7bd88f";
    ctx.fillText(`連続 ${combo}  ×${mult}`, VW - 10, VH - 9);
  }
}

function drawTitle() {
  ctx.fillStyle = "rgba(4,18,34,0.78)";
  ctx.fillRect(0, 0, VW, VH);
  // 図鑑ボタン
  ctx.fillStyle = "rgba(20,40,60,0.8)";
  ctx.fillRect(VW - 32, 6, 26, 16);
  ctx.strokeStyle = "#9ad8f0"; ctx.lineWidth = 0.5;
  ctx.strokeRect(VW - 31.5, 6.5, 25, 15);
  ctx.textAlign = "center"; ctx.font = "bold 8px monospace";
  ctx.fillStyle = "#9ad8f0";
  ctx.fillText("図鑑", VW - 19, 17);
  // ランキングボタン
  ctx.fillStyle = "rgba(20,40,60,0.8)";
  ctx.fillRect(VW - 64, 6, 26, 16);
  ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 0.5;
  ctx.strokeRect(VW - 63.5, 6.5, 25, 15);
  ctx.fillStyle = "#ffe066";
  ctx.fillText("順位", VW - 51, 17);
  // サウンドボタン（左上）
  ctx.fillStyle = "rgba(20,40,60,0.8)";
  ctx.fillRect(6, 6, 34, 16);
  ctx.strokeStyle = soundOn ? "#7bd88f" : "#5a6a7a"; ctx.lineWidth = 0.5;
  ctx.strokeRect(6.5, 6.5, 33, 15);
  ctx.fillStyle = soundOn ? "#7bd88f" : "#5a6a7a";
  ctx.fillText(soundOn ? "♪ON" : "♪OFF", 23, 17);
  // スキンボタン
  ctx.fillStyle = "rgba(20,40,60,0.8)";
  ctx.fillRect(46, 6, 38, 16);
  ctx.strokeStyle = "#c9a0e8"; ctx.lineWidth = 0.5;
  ctx.strokeRect(46.5, 6.5, 37, 15);
  ctx.fillStyle = "#c9a0e8";
  ctx.fillText("スキン", 65, 17);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066";
  ctx.font = "bold 24px monospace";
  ctx.fillText("いそもぐり", VW / 2, 78);
  ctx.font = "bold 9px monospace";
  ctx.fillStyle = "#9ad8f0";
  ctx.fillText("一息、一突き、無事浮上。", VW / 2, 98);
  ctx.fillStyle = "#ffe066";
  ctx.fillText("ハイスコア " + highScore + "pt", VW / 2, 124);
  ctx.font = "bold 8px monospace";
  ctx.fillStyle = "#9ab0c4";
  ctx.fillText(`潜水 ${progress.dives}　連続 ${progress.streak}日　最多 ${progress.bestCombo}連`, VW / 2, 140);

  // 日替わりの短期目標
  ctx.fillStyle = "rgba(20,40,60,0.9)";
  ctx.fillRect(28, 154, VW - 56, 62);
  ctx.strokeStyle = daily.completed ? "#7bd88f" : "#9ad8f0"; ctx.lineWidth = 1;
  ctx.strokeRect(28.5, 154.5, VW - 57, 61);
  drawFishIcon(daily.targetId, 57, 185, 40);
  ctx.textAlign = "left";
  ctx.font = "bold 8px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText("本日の狙い", 84, 171);
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = daily.completed ? "#7bd88f" : "#fff";
  ctx.fillText(`${SPECIES[daily.targetId].name} ×${daily.goal}`, 84, 188);
  ctx.font = "bold 8px monospace";
  ctx.fillText(daily.completed ? "達成済み ✓" : `${daily.progress}/${daily.goal}　報酬 +${DAILY_REWARD}pt`, 84, 204);
  ctx.textAlign = "center";
  ctx.fillStyle = "#7f9db8";
  wrapText(careWord, VW / 2, 240, 200, 11);
  // 海況選択（タップで即潜行）
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#fff";
  if (Math.sin(tGame * 3) > -0.2) ctx.fillText("海況をえらんで潜る", VW / 2, 284);
  const cols = ["#7bd88f", "#ffe066", "#ff8c5c"];
  for (let i = 0; i < 3; i++) {
    const m = MODES[MODE_KEYS[i]];
    const by = 292 + i * 34;
    ctx.fillStyle = "rgba(20,40,60,0.92)";
    ctx.fillRect(35, by, VW - 70, 28);
    ctx.strokeStyle = cols[i]; ctx.lineWidth = 1;
    ctx.strokeRect(35.5, by + 0.5, VW - 71, 27);
    ctx.textAlign = "left";
    ctx.fillStyle = cols[i];
    ctx.fillText(m.name, 44, by + 12);
    ctx.font = "bold 8px monospace";
    ctx.fillStyle = "#9ab0c4";
    ctx.fillText(m.desc, 44, by + 23);
    ctx.font = "bold 9px monospace";
  }
  ctx.textAlign = "center";
}

function drawGauge() {
  const v = gaugeValue(aim.t);
  const gx = 30, gw = VW - 60, gy = VH - 60;
  const poor = Math.min(0.48, POOR * mode.gauge);
  const good = Math.min(0.48, GOOD * mode.gauge);
  const crit = Math.min(0.48, CRIT * mode.gauge);
  ctx.fillStyle = "rgba(10,20,35,0.8)";
  ctx.fillRect(gx - 4, gy - 4, gw + 8, 22);
  ctx.fillStyle = "#28374d"; ctx.fillRect(gx, gy, gw, 14);
  // 判定ゾーン
  ctx.fillStyle = "#4a6a3a"; ctx.fillRect(gx + gw * (0.5 - poor), gy, gw * poor * 2, 14);
  ctx.fillStyle = "#6fae4c"; ctx.fillRect(gx + gw * (0.5 - good), gy, gw * good * 2, 14);
  ctx.fillStyle = "#ffe066"; ctx.fillRect(gx + gw * (0.5 - crit), gy, gw * crit * 2, 14);
  // カーソル
  ctx.fillStyle = "#fff";
  ctx.fillRect(gx + gw * v - 1.5, gy - 3, 3, 20);
  ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${aim.target.sp.name}　一突き`, VW / 2, gy - 10);
}

// 魚のアップ（カットイン用）。_big が未ロードなら通常スプライトを拡大
function drawBigFish(id, cx, cy, targetW, rot) {
  // _sad等の派生スプライトが未ロードなら元の魚にフォールバック
  const base = id.split("_")[0];
  const img = sprites[id + "_big"] || sprites[id] || sprites[base + "_big"] || sprites[base];
  const s = targetW / img.width;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function drawStruggle() {
  const s = struggle;
  const cx = VW / 2;
  // カットイン帯
  ctx.fillStyle = "rgba(10,20,35,0.75)";
  ctx.fillRect(0, 92, VW, 216);
  ctx.fillStyle = "#ff8c5c";
  ctx.fillRect(0, 92, VW, 2); ctx.fillRect(0, 306, VW, 2);
  // 魚のアップ（残り時間が減るほど激しく暴れる）
  const rage = 2 - s.timer / s.dur;
  const wob = Math.sin(tGame * 16) * 0.1 * rage;
  const jx = Math.sin(tGame * 31) * 3 * rage;
  const jy = Math.cos(tGame * 26) * 2.5 * rage;
  drawBigFish(s.f.id, cx + jx, 172 + jy, Math.min(150, 105 * s.f.sp.size), wob);
  ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(s.f.sp.name + "が暴れている！", cx, 108);
  // 残り時間リング＋連打
  const cy = 262;
  ctx.strokeStyle = "#28374d"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#ff8c5c";
  ctx.beginPath(); ctx.arc(cx, cy, 24, -Math.PI / 2, -Math.PI / 2 + (s.timer / s.dur) * Math.PI * 2); ctx.stroke();
  const p = s.taps / s.need;
  ctx.fillStyle = "#28374d"; ctx.fillRect(cx - 40, cy + 32, 80, 8);
  ctx.fillStyle = "#7bd88f"; ctx.fillRect(cx - 40, cy + 32, 80 * Math.min(1, p), 8);
  const shake = Math.sin(tGame * 25) * 2;
  ctx.font = "bold 12px monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("連打！", cx + shake, cy + 4);
}

// キープ成功／ハコフグごめんね のカットイン
function drawCatch() {
  const c = catchCut;
  const fade = Math.min(1, c.t / 0.35);              // 消える時フェード
  const pop = Math.min(1, (c.dur - c.t) / 0.15);     // 出る時ポップ
  ctx.globalAlpha = fade;
  const cx = VW / 2, cy = 150;
  ctx.fillStyle = c.sad ? "rgba(15,20,42,0.82)" : "rgba(10,25,20,0.78)";
  ctx.fillRect(0, cy - 64, VW, 128);
  const col = c.sad ? "#9ad8f0" : (c.nushi || c.crit) ? "#ffe066" : "#7bd88f";
  ctx.fillStyle = col;
  ctx.fillRect(0, cy - 64, VW, 2); ctx.fillRect(0, cy + 62, VW, 2);
  const w = Math.min(150, 95 * c.sp.size * (c.nushi ? 1.3 : 1)) * (0.5 + 0.5 * pop) * (c.sad ? 1.25 : 1);
  // ヌシは金の後光
  if (c.nushi) {
    ctx.save();
    ctx.translate(cx, cy - 10);
    ctx.rotate(tGame * 0.5);
    ctx.fillStyle = "rgba(255,224,102,0.12)";
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(70, -11); ctx.lineTo(70, 11); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // 悲しい時はゆっくり首を振る。嬉しい時は小さく揺れる
  const rot = c.sad ? Math.sin(tGame * 1.6) * 0.06 : Math.sin(tGame * 2.5) * 0.05;
  drawBigFish(c.id, cx, cy - 10, w, rot);
  if (c.sad) { // 涙のしずくを落とす
    ctx.fillStyle = "#bfe7ff";
    const ty = (tGame * 40) % 46;
    ctx.beginPath(); ctx.arc(cx - 24, cy - 8 + ty, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
  ctx.fillStyle = col;
  const award = c.award === undefined ? c.sp.pts : c.award;
  const points = award > 0 ? "+" + award : String(award);
  const label = c.sad
    ? "ハコフグ…ごめん… " + points + "pt"
    : c.nushi
    ? "ヌシを仕留めた！！ " + points + "pt"
    : (c.crit ? "会心！ " : "") + c.sp.name + (c.cm ? " " + c.cm + "cm" : "") + " キープ！ " + points + "pt";
  ctx.fillText(label, cx, cy + 48);
  if (c.sad) {
    ctx.font = "bold 8px monospace"; ctx.fillStyle = "#7f9db8";
    ctx.fillText("（ハコフグは見つめるとボーナス）", cx, cy + 60);
  } else {
    const detail = [];
    if (c.nushi) detail.push(`${c.sp.name} ${c.cm}cm`);
    if (c.newRec) detail.push("自己記録！");
    if (c.combo >= 2) detail.push(`${c.combo}連続`);
    if (c.o2Bonus) detail.push(`O2 +${c.o2Bonus.toFixed(1)}`);
    if (detail.length) {
      ctx.font = "bold 8px monospace"; ctx.fillStyle = c.newRec ? "#ffe066" : "#cfd8e3";
      ctx.fillText(detail.join("　"), cx, cy + 60);
    }
  }
  ctx.globalAlpha = 1;
}

// リザルト用の小さな魚アイコン
function drawFishIcon(id, cx, cy, w) {
  const img = sprites[id];
  if (!img) return;
  const h = img.height * (w / img.width);
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

function drawResult() {
  ctx.fillStyle = "rgba(4,18,34,0.9)";
  ctx.fillRect(0, 0, VW, VH);

  // 海況選択へ戻る小ボタン。画面の他の場所は同じ海へ直行する。
  ctx.fillStyle = "rgba(20,40,60,0.9)"; ctx.fillRect(6, 6, 40, 16);
  ctx.strokeStyle = "#7f9db8"; ctx.lineWidth = 0.5; ctx.strokeRect(6.5, 6.5, 39, 15);
  ctx.font = "bold 8px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText("海況", 26, 17);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px monospace";
  ctx.fillText(`― 浮上　漁果 ${resultData.rank} ―`, VW / 2, 30);
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText("海況 " + mode.name + (mode.score > 1 ? "（スコア×" + mode.score + "）" : ""), VW / 2, 45);
  if (resultData.isNew) {
    ctx.fillStyle = "#7bd88f";
    ctx.fillText("NEW RECORD", VW / 2, 58);
  }

  // 一番の獲物をどーんと見せる（サイズ・ヌシ込みの実獲得点で選ぶ）
  const best = bestCatch;
  let y = 154;
  if (best) {
    const cy = 98;
    // 後光（ゆっくり回る光条）
    ctx.save();
    ctx.translate(VW / 2, cy);
    ctx.rotate(tGame * 0.3);
    ctx.fillStyle = "rgba(255,224,102,0.09)";
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(78, -13); ctx.lineTo(78, 13); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    drawBigFish(best.id, VW / 2, cy, Math.min(118, 78 * best.sp.size * (best.nushi ? 1.25 : 1)),
                Math.sin(tGame * 2) * 0.06);
    // キラキラ
    ctx.fillStyle = "#ffe066";
    for (let i = 0; i < 4; i++) {
      const a = tGame * 1.4 + i * 1.7, r = 52 + Math.sin(tGame * 2.3 + i * 2) * 8;
      const tw = 0.6 + 0.4 * Math.sin(tGame * 5 + i * 3);
      ctx.globalAlpha = tw * 0.8;
      ctx.fillRect(VW / 2 + Math.cos(a) * r - 1, cy + Math.sin(a) * r * 0.55 - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.font = "bold 9px monospace"; ctx.fillStyle = "#ffe066";
    ctx.fillText("本日の一番　" + (best.nushi ? "ヌシ・" : "") + best.sp.name + " " +
                 best.cm + "cm " + best.award + "pt", VW / 2, cy + 48);
  } else {
    // ボウズ：ダイバーがぷかぷか浮かぶ
    const img = tintedDiver();
    if (img) {
      ctx.save();
      ctx.translate(VW / 2, 99 + Math.sin(tGame * 1.5) * 4);
      ctx.rotate(Math.sin(tGame * 1.2) * 0.12);
      const s = 56 / img.width;
      ctx.scale(s, s);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
    ctx.font = "bold 10px monospace"; ctx.fillStyle = "#fff";
    ctx.fillText("ボウズ。海はそういう日もある。", VW / 2, 145);
  }

  // 集計（魚アイコン付き）
  const agg = new Map();
  for (const sp of bag) {
    const a = agg.get(sp.id) || { sp, n: 0, pts: 0 };
    a.n++; a.pts += sp.pts; agg.set(sp.id, a);
  }
  const entries = [...agg.entries()].sort((a, b) => b[1].pts - a[1].pts);
  const visibleEntries = entries.slice(0, 4);
  const rowH = 14;
  ctx.font = "bold 9px monospace";
  for (const [id, a] of visibleEntries) {
    drawFishIcon(id, 46, y - 3, 18);
    ctx.textAlign = "left";
    ctx.fillStyle = a.pts < 0 ? "#f2994a" : "#fff";
    ctx.fillText(a.sp.name + " ×" + a.n, 62, y);
    ctx.textAlign = "right";
    ctx.fillText(a.pts + "pt", VW - 40, y);
    y += rowH;
  }
  if (entries.length > visibleEntries.length) {
    ctx.textAlign = "left"; ctx.fillStyle = "#9ab0c4";
    ctx.fillText(`ほか ${entries.length - visibleEntries.length}種`, 62, y);
    y += rowH;
  }

  const allBonus = resultData.bonusTotal + cuteBonus;
  if (allBonus > 0) {
    ctx.textAlign = "left"; ctx.fillStyle = "#7bd88f";
    ctx.fillText("技術・記録ボーナス", 62, y);
    ctx.textAlign = "right"; ctx.fillText("+" + allBonus + "pt", VW - 40, y);
    y += rowH;
  }
  if (runBestCombo >= 2) {
    ctx.textAlign = "center"; ctx.fillStyle = "#9ad8f0";
    ctx.fillText(`ベスト連続キープ ${runBestCombo}`, VW / 2, y);
  }

  ctx.textAlign = "center";
  if (resultData.note) {
    ctx.font = "bold 9px monospace"; ctx.fillStyle = "#ff8c8c";
    wrapText(resultData.note, VW / 2, 253, 210, 11);
  }
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 15px monospace";
  ctx.fillText("合計 " + resultData.total + " pt", VW / 2, 278);
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText("ハイスコア " + highScore + " pt", VW / 2, 295);
  // 名言
  ctx.fillStyle = "#cfd8e3";
  wrapText("「" + quote + "」", VW / 2, 319, 205, 13);

  // 新スキン解放の告知（きらめかせる）
  if (resultData.newSkin) {
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(tGame * 5);
    ctx.fillStyle = "#c9a0e8"; ctx.font = "bold 9px monospace";
    ctx.fillText(`新スキン解放「${resultData.newSkin.name}」！ タイトル→スキン`, VW / 2, 355);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(20,40,60,0.94)"; ctx.fillRect(30, 362, VW - 60, 28);
  ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 1; ctx.strokeRect(30.5, 362.5, VW - 61, 27);
  if (Math.sin(tGame * 3) > -0.2) {
    ctx.fillStyle = "#ffe066"; ctx.font = "bold 10px monospace";
    ctx.fillText("同じ海へ　もう一潜り", VW / 2, 380);
  }
}

function drawDex() {
  ctx.fillStyle = "rgba(4,18,34,0.88)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px monospace";
  ctx.fillText("図鑑", VW / 2, 30);

  let caught = 0;
  for (const d of Object.values(dex)) caught += d.caught;
  const totalSpecies = Object.keys(SPECIES).length;
  const caughtSpecies = Object.values(dex).filter(d => d.caught > 0).length;
  const seenSpecies = Object.values(dex).filter(d => d.seen > 0).length;
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText(`捕獲 ${caughtSpecies}/${totalSpecies}　目撃 ${seenSpecies}/${totalSpecies}　合計 ${caught}匹`, VW / 2, 50);

  // Fish list
  ctx.textAlign = "left"; ctx.font = "bold 8px monospace";
  let y = 75;
  for (const [id, entry] of Object.entries(SPECIES)) {
    const d = dex[id] || { caught: 0, seen: 0 };
    const name = d.seen > 0 ? entry.name : "？？？";
    const isCaught = d.caught > 0;
    ctx.fillStyle = isCaught ? "#fff" : d.seen > 0 ? "#7f9db8" : "#40566a";
    const mark = isCaught ? "✓" : d.seen > 0 ? "◇" : "・";
    ctx.fillText(`${mark} ${name}`, 20, y);
    if (isCaught) {
      if (d.rec) { // 自己記録cm
        ctx.fillStyle = "#9ad8f0";
        ctx.fillText(`記録${d.rec}cm`, 126, y);
      }
      ctx.fillStyle = "#ffe066";
      ctx.fillText(`×${d.caught}`, VW - 40, y);
    }
    y += 14;
    if (y > VH - 40) break;
  }

  ctx.fillStyle = "#cfd8e3";
  ctx.textAlign = "center"; ctx.font = "bold 8px monospace";
  ctx.fillText("タップで戻る", VW / 2, VH - 20);
}

function drawSkin() {
  ctx.fillStyle = "rgba(4,18,34,0.92)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = "center";
  ctx.fillStyle = "#c9a0e8"; ctx.font = "bold 16px monospace";
  ctx.fillText("スキン", VW / 2, 30);
  const total = progress.totalScore || 0;
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText(`通算 ${total}pt`, VW / 2, 50);
  ctx.font = "bold 8px monospace"; ctx.fillStyle = "#7f9db8";
  ctx.fillText("潜るほど新しい一着が解放される", VW / 2, 66);

  for (let i = 0; i < SKINS.length; i++) {
    const def = SKINS[i];
    const top = 88 + i * 52;
    const unlocked = skinUnlocked(def);
    const equipped = skin === def.id;
    ctx.fillStyle = "rgba(20,40,60,0.92)";
    ctx.fillRect(18, top, VW - 36, 46);
    ctx.strokeStyle = equipped ? "#ffe066" : unlocked ? "#7bd88f" : "#40566a";
    ctx.lineWidth = equipped ? 1.5 : 1;
    ctx.strokeRect(18.5, top + 0.5, VW - 37, 45);

    // プレビュー（未解放はシルエット）
    const img = tintedDiver(def.id);
    if (img && img.width) {
      ctx.save();
      ctx.globalAlpha = unlocked ? 1 : 0.22;
      const w = 40, h = img.height / img.width * w;
      ctx.drawImage(img, 26, top + 23 - h / 2, w, h);
      ctx.restore();
    }
    ctx.textAlign = "left";
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = unlocked ? (equipped ? "#ffe066" : "#fff") : "#5a6a7a";
    ctx.fillText(def.name, 76, top + 17);
    ctx.font = "bold 8px monospace";
    ctx.fillStyle = unlocked ? "#9ab0c4" : "#40566a";
    ctx.fillText(def.desc, 76, top + 29);
    ctx.fillStyle = equipped ? "#ffe066" : unlocked ? "#7bd88f" : "#7f9db8";
    ctx.fillText(equipped ? "装備中" : unlocked ? "タップで装備" : `あと ${def.need - total}pt`, 76, top + 41);
  }

  ctx.fillStyle = "#7f9db8"; ctx.textAlign = "center"; ctx.font = "bold 8px monospace";
  ctx.fillText("ほかの場所をタップで戻る", VW / 2, VH - 12);
}

function drawRank() {
  ctx.fillStyle = "rgba(4,18,34,0.92)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px monospace";
  ctx.fillText("ランキング", VW / 2, 30);

  ctx.font = "bold 8px monospace";
  if (!rankView || rankView.loading) {
    ctx.fillStyle = "#9ad8f0";
    ctx.fillText("取得中…", VW / 2, 90);
  } else if (rankView.error) {
    ctx.fillStyle = "#ff8c8c";
    wrapText(rankView.error, VW / 2, 90, 190, 12);
  } else {
    const d = rankView.data;
    const medal = ["#ffe066", "#cfd8e3", "#e0a06a"];

    // スコアの部
    ctx.textAlign = "left"; ctx.fillStyle = "#9ad8f0";
    ctx.fillText("― スコアの部 ―", 20, 56);
    let y = 72;
    const scores = (d.score || []).slice(0, 8);
    if (!scores.length) { ctx.fillStyle = "#7f9db8"; ctx.fillText("まだ誰もいない。一番乗りのチャンス。", 20, y); y += 14; }
    scores.forEach((p, i) => {
      ctx.fillStyle = medal[i] || "#fff";
      ctx.fillText(`${i + 1}. ${p.n}`, 24, y);
      ctx.textAlign = "right";
      ctx.fillText(`${p.s}pt`, VW - 24, y);
      ctx.textAlign = "left";
      y += 13;
    });

    // ヌシの部（生涯最大の1匹）
    y += 10;
    ctx.fillStyle = "#9ad8f0";
    ctx.fillText("― ヌシの部（最大の1匹） ―", 20, y);
    y += 16;
    const fishes5 = (d.fish || []).slice(0, 5);
    if (!fishes5.length) { ctx.fillStyle = "#7f9db8"; ctx.fillText("まだ記録なし。", 24, y); y += 14; }
    fishes5.forEach((p, i) => {
      const spName = SPECIES[p.f] ? SPECIES[p.f].name : "";
      ctx.fillStyle = medal[i] || "#fff";
      ctx.fillText(`${i + 1}. ${p.n}`, 24, y);
      ctx.textAlign = "right";
      ctx.fillText(`${spName} ${p.c}cm`, VW - 24, y);
      ctx.textAlign = "left";
      y += 13;
    });

    // 自分の順位
    y += 12;
    ctx.textAlign = "center";
    if (playerName) {
      const mine = [];
      if (d.me && d.me.score) mine.push(`スコア ${d.me.score}位`);
      if (d.me && d.me.fish) mine.push(`ヌシ ${d.me.fish}位`);
      ctx.fillStyle = "#7bd88f";
      ctx.fillText(mine.length ? `${playerName}：${mine.join("　")}（全${d.total}人）`
                               : "記録を出すとここに順位が出る", VW / 2, y);
    } else {
      ctx.fillStyle = "#ffe066";
      ctx.fillText("名前を登録すると参加できます", VW / 2, y);
    }
  }

  // 名前登録・変更ボタン（下部の帯）
  ctx.fillStyle = "rgba(20,40,60,0.94)"; ctx.fillRect(30, VH - 48, VW - 60, 32);
  ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 1; ctx.strokeRect(30.5, VH - 47.5, VW - 61, 31);
  ctx.textAlign = "center"; ctx.fillStyle = "#ffe066"; ctx.font = "bold 9px monospace";
  ctx.fillText(playerName ? `名前をかえる（いま：${playerName}）` : "ニックネームを登録する", VW / 2, VH - 29);

  ctx.fillStyle = "#7f9db8"; ctx.font = "bold 8px monospace";
  ctx.fillText("ほかの場所をタップで戻る", VW / 2, VH - 6);
}

function wrapText(txt, cx, y, maxW, lh) {
  let line = "";
  for (const ch of txt) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, cx, y); y += lh; line = ch;
    } else line += ch;
  }
  if (line) ctx.fillText(line, cx, y);
}

// ---------- ループ ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function fit() {
  const scale = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  canvas.style.width = VW * scale + "px";
  canvas.style.height = VH * scale + "px";
}
window.addEventListener("resize", fit);

// ローカル検証時だけ公開し、配布ファイルからゲーム状態を操作できないようにする。
if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
  window.__dbg = {
    get: () => ({
      diver: { x: diver.x, y: diver.y, vx: diver.vx, vy: diver.vy, angle: diver.angle },
      state, oxygen, combo, tapGuardUntil,
      aimId: aim && aim.target.id,
      bag: bag.map(sp => sp.id),
    }),
    warp: (x, y) => { diver.x = x; diver.y = y; diver.maxDepth = Math.max(diver.maxDepth, y); },
    forceStruggle: (id) => {
      const f = fishes.find(f => f.alive && f.id === id) || fishes[0];
      struggle = { f, need: 5, taps: 0, timer: 3, dur: 3, quality: "good" };
      state = "struggle";
    },
    audio: () => ({ soundOn, hasAC: !!AC, acState: AC && AC.state }),
  };
}

canvas.width = VW; canvas.height = VH;
initSprites();
reset();
fit();
requestAnimationFrame(frame);
