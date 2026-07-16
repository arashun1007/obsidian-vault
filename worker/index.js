// いそもぐり ランキングAPI + 静的配信（Cloudflare Workers）
// KVバインディング RANK が未設定の間、APIは 503 を返しゲーム側は「準備中」表示になる。
// プレイヤーは端末ごとのランダムIDで識別し、ベスト値だけをKVに保持する。

const NAME_MAX = 10;
const NG_WORDS = ["うんこ", "ちんこ", "まんこ", "しね", "死ね", "殺す", "ころす"];

function sanitizeName(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = [...s].slice(0, NAME_MAX).join("");
  const low = s.toLowerCase();
  for (const w of NG_WORDS) if (low.includes(w)) return null;
  return s;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// 週番号（JST・月曜はじまり）。週間ランキングのキーに使う
function weekKey(now = Date.now()) {
  const day = Math.floor((now + 9 * 3600 * 1000) / 86400000);
  return Math.floor((day + 3) / 7);
}

// プレイヤーのベストをKVのメタデータだけで集める（値のGETを発行しない）
async function listPlayers(env, prefix) {
  const players = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await env.RANK.list({ prefix, limit: 1000, cursor });
    for (const k of res.keys) {
      const m = k.metadata;
      if (m && typeof m.s === "number") players.push({ id: k.name.slice(prefix.length), ...m });
    }
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  return players;
}

function buildBoards(players, me) {
  const byScore = [...players].sort((a, b) => b.s - a.s || (a.t || 0) - (b.t || 0));
  const byFish = players.filter(p => p.c > 0).sort((a, b) => b.c - a.c || (a.t || 0) - (b.t || 0));
  const my = {};
  const iS = byScore.findIndex(p => p.id === me);
  const iF = byFish.findIndex(p => p.id === me);
  if (iS >= 0) my.score = iS + 1;
  if (iF >= 0) my.fish = iF + 1;
  return {
    total: players.length,
    score: byScore.slice(0, 20).map(p => ({ n: p.n, s: p.s, v: p.v || 0 })),
    fish: byFish.slice(0, 20).map(p => ({ n: p.n, c: p.c, f: p.f || "", v: p.v || 0 })),
    me: my,
  };
}

async function handleRanking(url, env) {
  const me = url.searchParams.get("id") || "";
  const wk = weekKey();
  const [allPlayers, weekPlayers] = await Promise.all([
    listPlayers(env, "p:"),
    listPlayers(env, `w:${wk}:`),
  ]);
  const all = buildBoards(allPlayers, me);
  const weekly = buildBoards(weekPlayers, me);
  weekly.week = wk;
  return json({ ...all, weekly });
}

function intIn(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max ? v : 0;
}

function fishIdOf(v) {
  return typeof v === "string" && /^[a-z_]{1,24}$/.test(v) ? v : "";
}

async function handleSubmit(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "bad_json" }, 400); }
  const id = typeof body.id === "string" && /^[a-z0-9]{8,40}$/.test(body.id) ? body.id : null;
  const name = sanitizeName(body.name);
  if (!id) return json({ error: "bad_id" }, 400);
  if (!name) return json({ error: "bad_name" }, 400);
  // 新クライアントは best/run を分けて送る。旧クライアントの score/cm は両方に効かせる
  // （旧版は自己ベスト更新時にしか送らない＝その値は「いま出した記録」なので週間にも有効）
  const best = intIn(body.best !== undefined ? body.best : body.score, 0, 999999);
  const run = intIn(body.run !== undefined ? body.run : body.score, 0, 999999);
  const bestCm = intIn(body.bestCm !== undefined ? body.bestCm : body.cm, 1, 400);
  const runCm = intIn(body.runCm !== undefined ? body.runCm : body.cm, 1, 400);
  const bestFish = fishIdOf(body.bestFish || body.fish);
  const runFish = fishIdOf(body.fish);
  const lv = intIn(body.lv, 0, 9); // 称号レベル（クライアントの通算ポイント由来）

  // 通算（殿堂）
  const key = "p:" + id;
  const prev = (await env.RANK.get(key, "json")) || { n: "", s: 0, c: 0, f: "" };
  const next = {
    n: name,
    s: Math.max(prev.s || 0, best),
    c: Math.max(prev.c || 0, bestCm),
    f: bestCm > 0 && bestCm >= (prev.c || 0) ? bestFish : (prev.f || ""),
    v: Math.max(prev.v || 0, lv),
    t: Date.now(),
  };
  // ベスト更新・名前変更・称号昇格のときだけ書き込む（KV無料枠の書き込み回数を節約）
  if (next.n !== prev.n || next.s !== (prev.s || 0) || next.c !== (prev.c || 0) || next.v !== (prev.v || 0)) {
    await env.RANK.put(key, JSON.stringify(next), { metadata: next });
  }

  // 今週の部（35日で自動失効）
  const wk = weekKey();
  if (run > 0 || runCm > 0) {
    const wkey = `w:${wk}:${id}`;
    const prevW = (await env.RANK.get(wkey, "json")) || { n: "", s: 0, c: 0, f: "" };
    const nextW = {
      n: name,
      s: Math.max(prevW.s || 0, run),
      c: Math.max(prevW.c || 0, runCm),
      f: runCm > 0 && runCm >= (prevW.c || 0) ? runFish : (prevW.f || ""),
      v: Math.max(prevW.v || 0, lv),
      t: Date.now(),
    };
    if (nextW.n !== prevW.n || nextW.s !== (prevW.s || 0) || nextW.c !== (prevW.c || 0) || nextW.v !== (prevW.v || 0)) {
      await env.RANK.put(wkey, JSON.stringify(nextW), { metadata: nextW, expirationTtl: 3600 * 24 * 35 });
    }
  }

  return json({ ok: true, best: { s: next.s, c: next.c }, week: wk });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.RANK) return json({ error: "not_ready" }, 503);
    if (url.pathname === "/api/ranking" && request.method === "GET") return handleRanking(url, env);
    if (url.pathname === "/api/score" && request.method === "POST") return handleSubmit(request, env);
    return json({ error: "not_found" }, 404);
  },
};
