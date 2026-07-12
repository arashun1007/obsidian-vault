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

// 全プレイヤーのベストをKVのメタデータだけで集める（値のGETを発行しない）
async function listPlayers(env) {
  const players = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await env.RANK.list({ prefix: "p:", limit: 1000, cursor });
    for (const k of res.keys) {
      const m = k.metadata;
      if (m && typeof m.s === "number") players.push({ id: k.name.slice(2), ...m });
    }
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  return players;
}

async function handleRanking(url, env) {
  const me = url.searchParams.get("id") || "";
  const players = await listPlayers(env);
  const byScore = [...players].sort((a, b) => b.s - a.s || (a.t || 0) - (b.t || 0));
  const byFish = players.filter(p => p.c > 0).sort((a, b) => b.c - a.c || (a.t || 0) - (b.t || 0));
  const my = {};
  const iS = byScore.findIndex(p => p.id === me);
  const iF = byFish.findIndex(p => p.id === me);
  if (iS >= 0) my.score = iS + 1;
  if (iF >= 0) my.fish = iF + 1;
  return json({
    total: players.length,
    score: byScore.slice(0, 20).map(p => ({ n: p.n, s: p.s })),
    fish: byFish.slice(0, 20).map(p => ({ n: p.n, c: p.c, f: p.f || "" })),
    me: my,
  });
}

async function handleSubmit(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "bad_json" }, 400); }
  const id = typeof body.id === "string" && /^[a-z0-9]{8,40}$/.test(body.id) ? body.id : null;
  const name = sanitizeName(body.name);
  if (!id) return json({ error: "bad_id" }, 400);
  if (!name) return json({ error: "bad_name" }, 400);
  const score = Number.isInteger(body.score) && body.score >= 0 && body.score <= 999999 ? body.score : 0;
  const cm = Number.isInteger(body.cm) && body.cm > 0 && body.cm <= 400 ? body.cm : 0;
  const fishId = typeof body.fish === "string" && /^[a-z_]{1,24}$/.test(body.fish) ? body.fish : "";

  const key = "p:" + id;
  const prev = (await env.RANK.get(key, "json")) || { n: "", s: 0, c: 0, f: "" };
  const next = {
    n: name,
    s: Math.max(prev.s || 0, score),
    c: Math.max(prev.c || 0, cm),
    f: cm > 0 && cm >= (prev.c || 0) ? fishId : (prev.f || ""),
    t: Date.now(),
  };
  // ベスト更新か名前変更のときだけ書き込む（KV無料枠の書き込み回数を節約）
  if (next.n !== prev.n || next.s !== (prev.s || 0) || next.c !== (prev.c || 0)) {
    await env.RANK.put(key, JSON.stringify(next), { metadata: next });
  }
  return json({ ok: true, best: { s: next.s, c: next.c } });
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
