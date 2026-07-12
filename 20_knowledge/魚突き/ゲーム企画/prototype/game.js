// いそもぐり（仮） MVPプロトタイプ
// 依存なし・Canvas 2D・縦画面 1ダイブ=1ラン
"use strict";

// ---------- 定数 ----------
const VW = 240, VH = 400;          // 論理解像度
const WORLD_W = 560;               // 横に約2.3画面分
const WORLD_H = 2000;              // 20m（1m = 100px）
const PX_PER_M = 100;
const O2_MAX = 60;                 // 秒
const SPEAR_RANGE = 85;
const CRIT = 0.07, GOOD = 0.18, POOR = 0.35; // ゲージ中央からの距離（標準時）

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
];

// ---------- サウンド（依存なし・WebAudioで全部合成） ----------
let soundOn = localStorage.getItem("isomoguri_snd") !== "0";
let AC = null, bgmGain = null, sfxGain = null, bgmTimer = null, bgmStep = 0;

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

function ensureAudio() { // 初回のタップ/クリックで呼ぶ（自動再生制限対策）
  if (!soundOn) return;
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const master = AC.createGain();
    master.gain.value = 0.9;
    master.connect(AC.destination);
    bgmGain = AC.createGain(); bgmGain.gain.value = 0.55; bgmGain.connect(master);
    sfxGain = AC.createGain(); sfxGain.gain.value = 0.8;  sfxGain.connect(master);
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
      if (BGM_MELODY[i]) tone(NOTE(BGM_MELODY[i]), next, BGM_STEP_SEC * 0.95, "square", 0.055, bgmGain);
      if (BGM_BASS[i])   tone(NOTE(BGM_BASS[i]),   next, BGM_STEP_SEC * 2.2,  "triangle", 0.14, bgmGain);
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

// ---------- 魚種テーブル（MVP: 6種） ----------
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
};

// ---------- 状態 ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

let sprites = {};
let state, diver, fishes, rocks, weeds, bubbles, popups;
let oxygen, bag, cuteBonus, cam, camX, tGame, aim, struggle, resultData, catchCut;
let hintShown, quote, careWord;
let highScore = Number(localStorage.getItem("isomoguri_hs") || 0);
let dex = JSON.parse(localStorage.getItem("isomoguri_dex") || "{}"); // { fishId: { caught: N, seen: N } }

// 描画時の基準幅（生成アセットはこの幅に揃えて表示する）
const BASE_W = { fish: 16, rock: 14, box: 11, diver: 24 };

function initSprites() {
  for (const [id, sp] of Object.entries(SPECIES)) {
    sprites[id] = makeSprite(MAPS[sp.shape], sp.colors, { stripes: sp.stripes });
  }
  sprites.diver = makeSprite(MAPS.diver, DIVER_COLORS);
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
  state = "title";
  diver = { x: WORLD_W / 2, y: 8, vx: 0, vy: 0, angle: Math.PI / 2, maxDepth: 0 };
  oxygen = O2_MAX;
  bag = []; cuteBonus = 0;
  cam = 0; camX = WORLD_W / 2 - VW / 2; tGame = 0;
  aim = null; struggle = null; resultData = null; catchCut = null;
  popups = []; bubbles = [];
  hintShown = false;
  current = Math.random() < 0.5 ? -1 : 1;
  quote = QUOTES[(Math.random() * QUOTES.length) | 0];
  careWord = QUOTES[(Math.random() * 2) | 0]; // 先頭2つはケアワード
  spawnTerrain();
  spawnFish();
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
    // 図鑑: この種を見た
    if (!dex[id]) dex[id] = { caught: 0, seen: 0 };
    if (dex[id].seen === 0) dex[id].seen = 1;

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
        fishes.push({
          id, sp,
          x: hx + (Math.random() * jx - jx / 2), y: hy + (Math.random() * jy - jy / 2),
          hx, hy, vx: 0, vy: 0, dir: Math.random() < 0.5 ? 1 : -1,
          wt: Math.random() * 2, fleeT: 0, cuteT: 0, cuteDone: false,
          alive: true, wound: false,
        });
      }
    }
  }
}

// ---------- 入力 ----------
let ptr = { down: false, x: 0, y: 0, downX: 0, downY: 0, downT: 0, moved: 0 };

function toGame(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
  return { x: (t.clientX - r.left) / r.width * VW, y: (t.clientY - r.top) / r.height * VH };
}
function onDown(e) {
  e.preventDefault();
  ensureAudio(); // ブラウザの自動再生制限はユーザー操作で解除される
  const p = toGame(e);
  ptr.down = true; ptr.x = p.x; ptr.y = p.y;
  ptr.downX = p.x; ptr.downY = p.y; ptr.downT = performance.now(); ptr.moved = 0;
  if (state === "struggle") struggleTap();
}
function onMove(e) {
  e.preventDefault();
  if (!ptr.down) return;
  const p = toGame(e);
  ptr.moved += Math.hypot(p.x - ptr.x, p.y - ptr.y);
  ptr.x = p.x; ptr.y = p.y;
}
function onUp(e) {
  e.preventDefault();
  ptr.down = false;
  const dt = performance.now() - ptr.downT;
  const isTap = dt < 280 && ptr.moved < 14;
  if (state === "title" && isTap) {
    // サウンドON/OFFボタン（左上）
    if (ptr.x >= 6 && ptr.x <= 40 && ptr.downY >= 6 && ptr.downY <= 22) {
      soundOn = !soundOn;
      localStorage.setItem("isomoguri_snd", soundOn ? "1" : "0");
      if (soundOn) { ensureAudio(); sfx.ui(); }
      else if (AC) AC.suspend();
      return;
    }
    // 図鑑ボタン
    if (ptr.x >= VW - 32 && ptr.x <= VW - 6 && ptr.downY >= 6 && ptr.downY <= 22) {
      sfx.ui();
      state = "dex"; return;
    }
    // 海況ボタン（3段）のヒット判定
    for (let i = 0; i < 3; i++) {
      const by = 292 + i * 34;
      if (ptr.x >= 35 && ptr.x <= VW - 35 && ptr.downY >= by && ptr.downY <= by + 28) {
        sfx.ui();
        mode = MODES[MODE_KEYS[i]];
        state = "dive";
        diver.vy = 75; diver.angle = Math.PI / 2; // ジャックナイフで潜行開始
        return;
      }
    }
    return;
  }
  if (state === "dex" && isTap) { state = "title"; return; }
  if (state === "result" && isTap && performance.now() - resultData.t > 800) { reset(); return; }
  if (state === "dive" && isTap) tryAim();
  else if (state === "aim" && isTap) fire();
}
canvas.addEventListener("mousedown", onDown);
canvas.addEventListener("mousemove", onMove);
canvas.addEventListener("mouseup", onUp);
canvas.addEventListener("touchstart", onDown, { passive: false });
canvas.addEventListener("touchmove", onMove, { passive: false });
canvas.addEventListener("touchend", onUp, { passive: false });

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
function tryAim() {
  const f = nearestFish();
  if (!f) return;
  aim = { target: f, t: 0 };
  state = "aim";
}
function fire() {
  const f = aim.target;
  const v = gaugeValue(aim.t);          // 0..1
  const off = Math.abs(v - 0.5);
  aim = null;
  const spearDone = (fn) => { struggleOrCatch(f, fn); };
  sfx.shoot();
  if (!f.alive || Math.hypot(f.x - diver.x, f.y - diver.y) > SPEAR_RANGE * 1.4) {
    sfx.miss();
    popup(diver.x, diver.y - 20, "外した…", "#cfd8e3");
    state = "dive"; return;
  }
  if (f.sp.cute) { // ハコフグは突いたら問答無用でマイナス。悲しいカットイン
    f.alive = false;
    catchFish(f);
    sfx.sad();
    catchCut = { id: "hakofugu_sad", sp: f.sp, t: 2.2, dur: 2.2, sad: true };
    state = "dive"; return;
  }
  if (off < CRIT * mode.gauge)      spearDone("crit");
  else if (off < GOOD * mode.gauge) spearDone("good");
  else if (off < Math.min(0.48, POOR * mode.gauge)) spearDone("poor");
  else {
    flee(f, 2.0);
    sfx.miss();
    popup(f.x, f.y, "外した！", "#cfd8e3");
    state = "dive";
  }
}
function struggleOrCatch(f, quality) {
  if (quality === "crit") {
    f.alive = false; catchFish(f);
    sfx.crit();
    catchCut = { id: f.id, sp: f.sp, t: 1.5, dur: 1.5, crit: true };
    state = "dive"; return;
  }
  const mult = quality === "poor" ? 1.7 : 1.0;
  const dur = (f.sp.stTime || 3.5) * mode.time;
  struggle = { f, need: Math.max(3, Math.ceil(f.sp.taps * mult * mode.taps)),
               taps: 0, timer: dur, dur, quality };
  state = "struggle";
}
function struggleTap() {
  if (!struggle) return;
  struggle.taps++;
  sfx.tap();
  oxygen = Math.max(0, oxygen - 0.5);
  if (struggle.taps >= struggle.need) {
    const f = struggle.f;
    f.alive = false; catchFish(f);
    sfx.keep();
    catchCut = { id: f.id, sp: f.sp, t: 1.5, dur: 1.5, crit: false };
    struggle = null; state = "dive";
  }
}
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
function catchFish(f) {
  bag.push(f.sp);
  if (!dex[f.id]) dex[f.id] = { caught: 0, seen: 0 };
  dex[f.id].caught++;
}

// ---------- 更新 ----------
function endRun(blackout) {
  let total = bag.reduce((s, sp) => s + sp.pts, 0) + cuteBonus;
  let note = null;
  if (blackout) { total = Math.floor(total / 2); note = "ブラックアウト！ 獲物の半分を失った…"; }
  total = Math.floor(total * mode.score);
  if (total > highScore) { highScore = total; localStorage.setItem("isomoguri_hs", String(highScore)); }
  localStorage.setItem("isomoguri_dex", JSON.stringify(dex));
  if (!blackout) sfx.surface(); else sfx.bara();
  resultData = { total, note, t: performance.now() };
  state = "result";
}

function update(dt) {
  tGame += dt;
  const ts = state === "aim" ? 0.25 : 1;   // エイム中は時間スロー
  // エイム集中中はBGMを絞る（水中の静けさ演出）
  if (bgmGain) bgmGain.gain.value = state === "aim" ? 0.18 : 0.55;

  if (state === "dive" || state === "aim" || state === "struggle") {
    // 酸素
    const depthM = diver.y / PX_PER_M;
    oxygen -= dt * (0.6 + depthM / 12) * mode.o2;
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
      const max = 115;
      if (sp > max) { diver.vx *= max / sp; diver.vy *= max / sp; }
      // 体の向きは実際に進んでいる方向へ滑らかに追従
      // （入力方向に即時に向けると、潜行中に上を向く等の不自然さが出る）
      if (sp > 14) {
        const ta = Math.atan2(diver.vy, diver.vx);
        let dA = ta - diver.angle;
        while (dA > Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        diver.angle += dA * Math.min(1, dt * 7);
      }
      diver.x = Math.max(8, Math.min(WORLD_W - 8, diver.x + (diver.vx + current * mode.drift) * dt));
      diver.y = Math.max(4, Math.min(WORLD_H - 10, diver.y + diver.vy * dt));
      diver.maxDepth = Math.max(diver.maxDepth, diver.y);
      if (diver.y <= 12 && diver.maxDepth > 60) { endRun(false); return; }
    }
    if (state === "aim") {
      aim.t += dt;
      const f = aim.target;
      if (!f.alive || Math.hypot(f.x - diver.x, f.y - diver.y) > SPEAR_RANGE * 1.4) {
        aim = null; state = "dive";
      }
    }
    if (state === "struggle") {
      struggle.timer -= dt;
      if (struggle.timer <= 0) {
        const f = struggle.f;
        f.wound = true; flee(f, 2.5);
        sfx.bara();
        popup(f.x, f.y, "バラした！", "#ff8c8c");
        struggle = null; state = "dive";
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
    if (Math.random() < dt * 2.5) bubbles.push({ x: diver.x + 4, y: diver.y - 4, r: 1 + Math.random() * 2 });
  }

  for (const b of bubbles) { b.y -= 35 * dt; b.x += Math.sin(b.y / 12) * 0.3; }
  bubbles = bubbles.filter(b => b.y > cam - 10 && b.y > 2);
  for (const p of popups) p.t -= dt;
  popups = popups.filter(p => p.t > 0);
  if (catchCut) { catchCut.t -= dt; if (catchCut.t <= 0) catchCut = null; }

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
  ctx.translate(-Math.round(camX), -Math.round(cam));

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
    const img = sprites[f.id];
    const s = f.sp.size * spriteScale(f.id, f.sp.shape);
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

  // 照準（射程内の最寄りの魚）
  if (state === "dive" || state === "aim") {
    const tf = state === "aim" ? aim.target : nearestFish();
    if (tf && tf.alive) {
      const blink = Math.sin(tGame * 6) > -0.3;
      if (blink) {
        ctx.strokeStyle = state === "aim" ? "#ffe066" : "rgba(255,224,102,0.6)";
        ctx.lineWidth = 1;
        const r = 12 * tf.sp.size;
        ctx.strokeRect(tf.x - r, tf.y - r * 0.7, r * 2, r * 1.4);
      }
    }
  }

  // ダイバー＋手銛
  ctx.save();
  ctx.translate(Math.round(diver.x), Math.round(diver.y));
  ctx.rotate(diver.angle + Math.PI);
  if (Math.cos(diver.angle) > 0) ctx.scale(1, -1);
  // 手銛（長尺）
  ctx.strokeStyle = "#d9c8a0"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-40, 1); ctx.lineTo(6, 1); ctx.stroke();
  ctx.strokeStyle = "#cfd8e3";
  ctx.beginPath(); ctx.moveTo(-40, 1); ctx.lineTo(-45, -1); ctx.moveTo(-40, 1); ctx.lineTo(-45, 3); ctx.stroke();
  {
    const dImg = sprites.diver;
    const k = spriteScale("diver", "diver");
    ctx.drawImage(dImg, -12, -dImg.height * k / 2, dImg.width * k, dImg.height * k);
  }
  // ライトの光
  ctx.fillStyle = "rgba(255,240,160,0.15)";
  ctx.beginPath();
  ctx.moveTo(-10, 2); ctx.lineTo(-55, -10); ctx.lineTo(-55, 16); ctx.closePath(); ctx.fill();
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
  if (state === "aim") drawGauge();
  if (state === "struggle") drawStruggle();
  if (catchCut && state === "dive") drawCatch();
  if (state === "result") drawResult();
}

function drawHUD() {
  if (state === "title" || state === "result") return;
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
  // 獲物
  const pts = bag.reduce((s, sp) => s + sp.pts, 0) + cuteBonus;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(10,20,35,0.7)"; ctx.fillRect(6, VH - 18, 120, 12);
  ctx.fillStyle = "#ffe066";
  ctx.fillText("袋 " + bag.length + "匹  " + pts + "pt", 10, VH - 9);
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
  // サウンドボタン（左上）
  ctx.fillStyle = "rgba(20,40,60,0.8)";
  ctx.fillRect(6, 6, 34, 16);
  ctx.strokeStyle = soundOn ? "#7bd88f" : "#5a6a7a"; ctx.lineWidth = 0.5;
  ctx.strokeRect(6.5, 6.5, 33, 15);
  ctx.fillStyle = soundOn ? "#7bd88f" : "#5a6a7a";
  ctx.fillText(soundOn ? "♪ON" : "♪OFF", 23, 17);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066";
  ctx.font = "bold 22px monospace";
  ctx.fillText("いそもぐり", VW / 2, 92);
  ctx.font = "bold 9px monospace";
  ctx.fillStyle = "#9ad8f0";
  ctx.fillText("― 仮・MVPプロトタイプ ―", VW / 2, 110);
  ctx.fillStyle = "#cfd8e3";
  ctx.fillText("ドラッグ＝泳ぐ", VW / 2, 142);
  ctx.fillText("枠が出た魚の近くでタップ＝構える", VW / 2, 156);
  ctx.fillText("ゲージ中央でもう一度タップ＝突く", VW / 2, 170);
  ctx.fillText("魚が暴れたら連打！", VW / 2, 184);
  ctx.fillStyle = "#ffe066";
  ctx.fillText("ハイスコア " + highScore + "pt", VW / 2, 210);
  ctx.fillStyle = "#7f9db8";
  wrapText(careWord, VW / 2, 232, 200, 11);
  // 海況選択（タップで即潜行）
  ctx.fillStyle = "#fff";
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
  ctx.fillStyle = "rgba(10,20,35,0.8)";
  ctx.fillRect(gx - 4, gy - 4, gw + 8, 22);
  ctx.fillStyle = "#28374d"; ctx.fillRect(gx, gy, gw, 14);
  // 判定ゾーン
  ctx.fillStyle = "#4a6a3a"; ctx.fillRect(gx + gw * (0.5 - POOR), gy, gw * POOR * 2, 14);
  ctx.fillStyle = "#6fae4c"; ctx.fillRect(gx + gw * (0.5 - GOOD), gy, gw * GOOD * 2, 14);
  ctx.fillStyle = "#ffe066"; ctx.fillRect(gx + gw * (0.5 - CRIT), gy, gw * CRIT * 2, 14);
  // カーソル
  ctx.fillStyle = "#fff";
  ctx.fillRect(gx + gw * v - 1.5, gy - 3, 3, 20);
  ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText("タップで突く！", VW / 2, gy - 10);
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
  const col = c.sad ? "#9ad8f0" : c.crit ? "#ffe066" : "#7bd88f";
  ctx.fillStyle = col;
  ctx.fillRect(0, cy - 64, VW, 2); ctx.fillRect(0, cy + 62, VW, 2);
  const w = Math.min(140, 95 * c.sp.size) * (0.5 + 0.5 * pop) * (c.sad ? 1.25 : 1);
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
  const label = c.sad
    ? "ハコフグ…ごめん… " + c.sp.pts + "pt"
    : (c.crit ? "会心！ " : "") + c.sp.name + " キープ！ +" + c.sp.pts + "pt";
  ctx.fillText(label, cx, cy + 50);
  if (c.sad) {
    ctx.font = "bold 8px monospace"; ctx.fillStyle = "#7f9db8";
    ctx.fillText("（ハコフグは見つめるとボーナス）", cx, cy + 58 + 2);
  }
  ctx.globalAlpha = 1;
}

function drawResult() {
  ctx.fillStyle = "rgba(4,18,34,0.88)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px monospace";
  ctx.fillText("― 浮上 ―", VW / 2, 50);
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText("海況 " + mode.name + (mode.score > 1 ? "（スコア×" + mode.score + "）" : ""), VW / 2, 66);
  // 集計
  const agg = new Map();
  for (const sp of bag) {
    const a = agg.get(sp.name) || { n: 0, pts: 0 };
    a.n++; a.pts += sp.pts; agg.set(sp.name, a);
  }
  ctx.font = "bold 10px monospace"; ctx.fillStyle = "#fff";
  let y = 85;
  if (agg.size === 0 && cuteBonus === 0) { ctx.fillText("ボウズ。海はそういう日もある。", VW / 2, y); y += 16; }
  for (const [name, a] of agg) {
    ctx.fillStyle = a.pts < 0 ? "#f2994a" : "#fff";
    ctx.fillText(name + " ×" + a.n + "　" + a.pts + "pt", VW / 2, y);
    y += 15;
  }
  if (cuteBonus > 0) {
    ctx.fillStyle = "#ffb3d9";
    ctx.fillText("かわいいボーナス +" + cuteBonus + "pt", VW / 2, y); y += 15;
  }
  if (resultData.note) {
    ctx.fillStyle = "#ff8c8c";
    wrapText(resultData.note, VW / 2, y + 6, 210, 12); y += 30;
  }
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 15px monospace";
  ctx.fillText("合計 " + resultData.total + " pt", VW / 2, y + 22);
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText("ハイスコア " + highScore + " pt", VW / 2, y + 40);
  // 名言
  ctx.fillStyle = "#cfd8e3";
  wrapText("「" + quote + "」", VW / 2, y + 75, 205, 13);
  if (Math.sin(tGame * 3) > -0.2) {
    ctx.fillStyle = "#fff";
    ctx.fillText("タップでもう一回", VW / 2, VH - 30);
  }
}

function drawDex() {
  ctx.fillStyle = "rgba(4,18,34,0.88)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px monospace";
  ctx.fillText("図鑑", VW / 2, 30);

  // Collection stats
  let caught = 0, seen = 0;
  for (const d of Object.values(dex)) { caught += d.caught; seen += d.seen; }
  const species = Object.keys(dex).length;
  ctx.font = "bold 9px monospace"; ctx.fillStyle = "#9ad8f0";
  ctx.fillText(`捕獲 ${species}種 / 目撃 ${Object.values(dex).filter(d => d.seen > 0).length}種  (合計 ${caught}匹)`, VW / 2, 50);

  // Fish list
  ctx.textAlign = "left"; ctx.font = "bold 8px monospace";
  let y = 75;
  for (const [id, entry] of Object.entries(SPECIES)) {
    const d = dex[id] || { caught: 0, seen: 0 };
    if (d.seen === 0) continue;
    const name = entry.name;
    const isCaught = d.caught > 0;
    ctx.fillStyle = isCaught ? "#fff" : "#7f9db8";
    const mark = isCaught ? "✓" : "◇";
    ctx.fillText(`${mark} ${name}`, 20, y);
    if (isCaught) {
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

// 開発用フック（リリース時に削除）
window.__dbg = {
  get: () => ({ diver, fishes, state, oxygen, bag }),
  warp: (x, y) => { diver.x = x; diver.y = y; diver.maxDepth = Math.max(diver.maxDepth, y); },
  forceStruggle: (id) => {
    const f = fishes.find(f => f.alive && f.id === id) || fishes[0];
    struggle = { f, need: 10, taps: 3, timer: 2.2, dur: 3.5, quality: "good" };
    state = "struggle";
  },
  forceCatch: (id, crit) => {
    const f = fishes.find(f => f.alive && f.id === id) || fishes[0];
    catchCut = { id: f.id, sp: f.sp, t: 1.5, dur: 1.5, crit: !!crit };
    state = "dive";
  },
  forceSad: () => {
    catchCut = { id: "hakofugu_sad", sp: SPECIES.hakofugu, t: 2.2, dur: 2.2, sad: true };
    state = "dive";
  },
  audio: () => ({ soundOn, hasAC: !!AC, acState: AC && AC.state }),
};

canvas.width = VW; canvas.height = VH;
initSprites();
reset();
fit();
requestAnimationFrame(frame);
