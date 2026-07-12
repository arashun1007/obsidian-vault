// いそもぐり（仮） MVPプロトタイプ
// 依存なし・Canvas 2D・縦画面 1ダイブ=1ラン
"use strict";

// ---------- 定数 ----------
const VW = 240, VH = 400;          // 論理解像度
const WORLD_H = 2000;              // 20m（1m = 100px）
const PX_PER_M = 100;
const O2_MAX = 60;                 // 秒
const SPEAR_RANGE = 85;
const CRIT = 0.07, GOOD = 0.18, POOR = 0.35; // ゲージ中央からの距離

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
              depth: [9, 19], speed: 3,  flee: 0,  taps: 6,  sit: true, count: 4 },
  nizadai:  { name: "ニザダイ", pts: 30,   shape: "fish", size: 1.1,
              colors: { b: "#8a8f98", d: "#4a4f58", l: "#c5c9d0" },
              depth: [4, 15], speed: 20, flee: 55, taps: 8,  school: 5, count: 1 },
  ishidai:  { name: "イシダイ", pts: 400,  shape: "fish", size: 1.25, stripes: true,
              colors: { b: "#e8e4d8", d: "#22242a", l: "#ffffff" },
              depth: [9, 19], speed: 30, flee: 85, taps: 14, count: 2 },
  hakofugu: { name: "ハコフグ", pts: -100, shape: "box",  size: 0.95, cute: true,
              colors: { b: "#f2c94c", d: "#3a3a1a", l: "#fdf3c8" },
              depth: [3, 13], speed: 6,  flee: 25, taps: 0,  count: 2 },
};

// ---------- 状態 ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

let sprites = {};
let state, diver, fishes, rocks, weeds, bubbles, popups;
let oxygen, bag, cuteBonus, cam, tGame, aim, struggle, resultData;
let hintShown, quote, careWord;
let highScore = Number(localStorage.getItem("isomoguri_hs") || 0);

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
}

function spriteScale(id, shape) {
  const img = sprites[id];
  return (BASE_W[shape] || img.width) / img.width;
}

function reset() {
  state = "title";
  diver = { x: VW / 2, y: 8, vx: 0, vy: 0, angle: Math.PI / 2, maxDepth: 0 };
  oxygen = O2_MAX;
  bag = []; cuteBonus = 0;
  cam = 0; tGame = 0;
  aim = null; struggle = null; resultData = null;
  popups = []; bubbles = [];
  hintShown = false;
  quote = QUOTES[(Math.random() * QUOTES.length) | 0];
  careWord = QUOTES[(Math.random() * 2) | 0]; // 先頭2つはケアワード
  spawnTerrain();
  spawnFish();
}

function spawnTerrain() {
  rocks = []; weeds = [];
  // 海底の岩盤
  for (let x = -10; x < VW + 10; x += 18) {
    rocks.push({ x, y: WORLD_H - 20 + Math.random() * 25, r: 16 + Math.random() * 14 });
  }
  // 中層の根（左右交互）
  for (let y = 500; y < WORLD_H - 150; y += 260) {
    const left = (y / 260) % 2 < 1;
    const bx = left ? 10 : VW - 10;
    for (let i = 0; i < 4; i++) {
      rocks.push({ x: bx + (left ? 1 : -1) * i * 14 + (Math.random() * 10 - 5),
                   y: y + Math.random() * 40, r: 10 + Math.random() * 12 });
    }
    if (Math.random() < 0.8) weeds.push({ x: bx + (left ? 1 : -1) * 20, y: y - 10, h: 40 + Math.random() * 30 });
  }
  for (let i = 0; i < 8; i++) {
    weeds.push({ x: 20 + Math.random() * (VW - 40), y: WORLD_H - 25, h: 45 + Math.random() * 40 });
  }
}

function spawnFish() {
  fishes = [];
  for (const [id, sp] of Object.entries(SPECIES)) {
    for (let n = 0; n < sp.count; n++) {
      const dep = sp.depth[0] + Math.random() * (sp.depth[1] - sp.depth[0]);
      const hy = dep * PX_PER_M;
      const hx = 25 + Math.random() * (VW - 50);
      const members = sp.school || 1;
      for (let m = 0; m < members; m++) {
        fishes.push({
          id, sp,
          x: hx + (Math.random() * 40 - 20), y: hy + (Math.random() * 30 - 15),
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
    state = "dive";
    diver.vy = 75; diver.angle = Math.PI / 2; // ジャックナイフで潜行開始
    return;
  }
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
  if (!f.alive || Math.hypot(f.x - diver.x, f.y - diver.y) > SPEAR_RANGE * 1.4) {
    popup(diver.x, diver.y - 20, "外した…", "#cfd8e3");
    state = "dive"; return;
  }
  if (f.sp.cute) { // ハコフグは突いたら問答無用でマイナス
    f.alive = false;
    bag.push(f.sp);
    popup(f.x, f.y, "ハコフグ…ごめん… -100", "#f2994a");
    state = "dive"; return;
  }
  if (off < CRIT)      spearDone("crit");
  else if (off < GOOD) spearDone("good");
  else if (off < POOR) spearDone("poor");
  else {
    flee(f, 2.0);
    popup(f.x, f.y, "外した！", "#cfd8e3");
    state = "dive";
  }
}
function struggleOrCatch(f, quality) {
  if (quality === "crit") {
    f.alive = false; bag.push(f.sp);
    popup(f.x, f.y, "会心！ " + f.sp.name + " +" + f.sp.pts, "#ffe066");
    state = "dive"; return;
  }
  const mult = quality === "poor" ? 1.7 : 1.0;
  struggle = { f, need: Math.ceil(f.sp.taps * mult), taps: 0, timer: 3.5, quality };
  state = "struggle";
}
function struggleTap() {
  if (!struggle) return;
  struggle.taps++;
  oxygen = Math.max(0, oxygen - 0.5);
  if (struggle.taps >= struggle.need) {
    const f = struggle.f;
    f.alive = false; bag.push(f.sp);
    popup(f.x, f.y, f.sp.name + " キープ！ +" + f.sp.pts, "#7bd88f");
    struggle = null; state = "dive";
  }
}
function flee(f, mult) {
  f.fleeT = 1.5;
  const a = Math.atan2(f.y - diver.y, f.x - diver.x);
  f.vx = Math.cos(a) * f.sp.speed * 3 * (mult || 1);
  f.vy = Math.sin(a) * f.sp.speed * 3 * (mult || 1);
  f.hx = Math.max(20, Math.min(VW - 20, f.x + f.vx * 3));
  f.hy = Math.max(150, Math.min(WORLD_H - 40, f.y + f.vy * 3));
}
function gaugeValue(t) { // 0→1→0 の往復（周期1.1秒）
  const c = (t % 1.1) / 1.1;
  return c < 0.5 ? c * 2 : (1 - c) * 2;
}

// ---------- 更新 ----------
function endRun(blackout) {
  let total = bag.reduce((s, sp) => s + sp.pts, 0) + cuteBonus;
  let note = null;
  if (blackout) { total = Math.floor(total / 2); note = "ブラックアウト！ 獲物の半分を失った…"; }
  if (total > highScore) { highScore = total; localStorage.setItem("isomoguri_hs", String(highScore)); }
  resultData = { total, note, t: performance.now() };
  state = "result";
}

function update(dt) {
  tGame += dt;
  const ts = state === "aim" ? 0.25 : 1;   // エイム中は時間スロー

  if (state === "dive" || state === "aim" || state === "struggle") {
    // 酸素
    const depthM = diver.y / PX_PER_M;
    oxygen -= dt * (0.6 + depthM / 12);
    if (oxygen <= 0) { endRun(true); return; }
    if (!hintShown && oxygen < O2_MAX * 0.3) {
      hintShown = true;
      popup(diver.x, diver.y - 25, "そろそろ浮上！", "#ff8c8c");
    }

    // ダイバー移動（ホールドで指の方向へ）
    if (state === "dive") {
      if (ptr.down && ptr.moved > 6) {
        const wx = ptr.x, wy = ptr.y + cam;
        const a = Math.atan2(wy - diver.y, wx - diver.x);
        diver.vx += Math.cos(a) * 230 * dt;
        diver.vy += Math.sin(a) * 230 * dt;
        diver.angle = a;
      }
      diver.vx *= Math.pow(0.02, dt); diver.vy *= Math.pow(0.02, dt);
      diver.vy += 6 * dt; // ウエイトでわずかに沈む
      const sp = Math.hypot(diver.vx, diver.vy);
      const max = 115;
      if (sp > max) { diver.vx *= max / sp; diver.vy *= max / sp; }
      diver.x = Math.max(8, Math.min(VW - 8, diver.x + diver.vx * dt));
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
      } else if (f.sp.flee > 0 && d < f.sp.flee && Math.hypot(diver.vx, diver.vy) > 35) {
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
      f.x = Math.max(10, Math.min(VW - 10, f.x));
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

  // カメラ
  const targetCam = Math.max(0, Math.min(WORLD_H - VH, diver.y - 150));
  cam += (targetCam - cam) * Math.min(1, dt * 6);
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
  ctx.translate(0, -Math.round(cam));

  // 水面と光
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(0, 0, VW, 3);
  if (cam < 420) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < 4; i++) {
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
  if (state === "aim") drawGauge();
  if (state === "struggle") drawStruggle();
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
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066";
  ctx.font = "bold 22px monospace";
  ctx.fillText("いそもぐり", VW / 2, 120);
  ctx.font = "bold 9px monospace";
  ctx.fillStyle = "#9ad8f0";
  ctx.fillText("― 仮・MVPプロトタイプ ―", VW / 2, 140);
  ctx.fillStyle = "#fff";
  ctx.fillText("海況：ベタ凪　潮：若潮", VW / 2, 180);
  ctx.fillStyle = "#cfd8e3";
  ctx.fillText("ドラッグ＝泳ぐ", VW / 2, 215);
  ctx.fillText("枠が出た魚の近くでタップ＝構える", VW / 2, 230);
  ctx.fillText("ゲージ中央でもう一度タップ＝突く", VW / 2, 245);
  ctx.fillText("魚が暴れたら連打！", VW / 2, 260);
  ctx.fillStyle = "#ffe066";
  ctx.fillText("ハイスコア " + highScore + "pt", VW / 2, 295);
  if (Math.sin(tGame * 3) > -0.2) {
    ctx.fillStyle = "#fff";
    ctx.fillText("タップで潜る", VW / 2, 330);
  }
  ctx.fillStyle = "#7f9db8";
  wrapText(careWord, VW / 2, 365, 200, 11);
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

function drawStruggle() {
  const s = struggle;
  const cx = VW / 2, cy = VH / 2 + 40;
  ctx.fillStyle = "rgba(10,20,35,0.55)";
  ctx.fillRect(0, cy - 55, VW, 110);
  // 残り時間リング
  ctx.strokeStyle = "#28374d"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#ff8c5c";
  ctx.beginPath(); ctx.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + (s.timer / 3.5) * Math.PI * 2); ctx.stroke();
  // 進捗
  const p = s.taps / s.need;
  ctx.fillStyle = "#28374d"; ctx.fillRect(cx - 40, cy + 44, 80, 8);
  ctx.fillStyle = "#7bd88f"; ctx.fillRect(cx - 40, cy + 44, 80 * Math.min(1, p), 8);
  ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
  const shake = Math.sin(tGame * 25) * 2;
  ctx.fillStyle = "#fff";
  ctx.fillText("連打！", cx + shake, cy + 5);
  ctx.font = "bold 9px monospace";
  ctx.fillText(s.f.sp.name + "が暴れている！", cx, cy - 44);
}

function drawResult() {
  ctx.fillStyle = "rgba(4,18,34,0.88)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px monospace";
  ctx.fillText("― 浮上 ―", VW / 2, 50);
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
};

canvas.width = VW; canvas.height = VH;
initSprites();
reset();
fit();
requestAnimationFrame(frame);
