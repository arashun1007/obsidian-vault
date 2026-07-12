"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

let now = 0;
const handlers = {};
const storage = new Map([["isomoguri_snd", "0"]]);
const noop = () => {};

const drawingContext = new Proxy({
  createLinearGradient: () => ({ addColorStop: noop }),
  measureText: text => ({ width: String(text).length * 8 }),
}, {
  get(target, key) { return key in target ? target[key] : noop; },
  set(target, key, value) { target[key] = value; return true; },
});

function fakeCanvas(isMain = false) {
  return {
    width: 240,
    height: 400,
    style: {},
    getContext: () => drawingContext,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }),
    addEventListener: isMain ? (type, handler) => { handlers[type] = handler; } : noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
  };
}

const canvas = fakeCanvas(true);
const document = {
  getElementById: () => canvas,
  createElement: tag => {
    if (tag === "canvas") return fakeCanvas();
    if (tag === "audio") {
      return { loop: false, paused: true, setAttribute: noop, play: () => Promise.resolve(), pause: noop };
    }
    return {};
  },
};

class FakeImage {
  constructor() { this.width = 32; this.height = 22; }
  set src(value) { this._src = value; }
  get src() { return this._src; }
}

const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
};

const window = {
  __ASSETS: {},
  innerWidth: 240,
  innerHeight: 400,
  addEventListener: noop,
};

const sandbox = {
  console,
  document,
  window,
  localStorage,
  location: { hostname: "127.0.0.1" },
  navigator: { vibrate: noop },
  Image: FakeImage,
  performance: { now: () => now },
  requestAnimationFrame: noop,
  setInterval: () => 0,
  clearInterval: noop,
  Date,
  Math,
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("game.js", "utf8"), sandbox, { filename: "game.js" });

function pointerEvent(x, y, pointerId = 1) {
  return { clientX: x, clientY: y, pointerId, button: 0, preventDefault: noop };
}

function tap(x, y, elapsed = 40) {
  const event = pointerEvent(x, y);
  handlers.pointerdown(event);
  now += elapsed;
  handlers.pointerup(event);
  now += 20;
}

function evaluate(code) { return vm.runInContext(code, sandbox); }

// タイトルから開始できる。
tap(100, 300);
assert.equal(evaluate("state"), "dive");

// 格闘を最後まで連打しても、最後のpointerupが次の照準へ流れない。
evaluate('window.__dbg.forceStruggle("mebaru")');
for (let i = 0; i < 5; i++) tap(120, 200);
assert.equal(evaluate("state"), "dive");
assert.equal(evaluate("aim"), null);

// 次の魚を射程内・画面中央へ置き、演出中の連打を同じ位置へ続ける。
evaluate(`
  (() => {
    const f = fishes.find(fish => fish.alive);
    diver.x = 270; diver.y = 300; diver.maxDepth = 300;
    f.x = 300; f.y = 300; f.hx = 300; f.hy = 300; f.vx = 0; f.vy = 0;
    camX = 150; cam = 100;
  })()
`);
for (let i = 0; i < 4; i++) tap(150, 200);
assert.equal(evaluate("state"), "dive");
assert.equal(evaluate("aim"), null);

// 演出が消えても、連打の直後は受付を再開しない。
evaluate("catchCut = null");
tap(150, 200);
assert.equal(evaluate("state"), "dive");

// 連打を止めてガード時間が過ぎると、タップした魚だけを構える。
now += 500;
tap(150, 200);
assert.equal(evaluate("state"), "aim");
assert.ok(evaluate("aim && aim.target"));

// 構え直後の反射的なタップでは発射しない。
tap(150, 200);
assert.equal(evaluate("state"), "aim");
evaluate("update(0.2)");
tap(150, 200);
assert.notEqual(evaluate("state"), "aim");

console.log("game input regression tests: ok");
