#!/usr/bin/env node
// KAEL model benchmark — measures what each installed model actually does on
// THIS machine: cold-load time, warm speed (tok/s), time-to-first-token, and
// where it lives (GPU vs CPU split). Run it after pulling a new model to see
// whether it earns a place in a profile.
//
//   node scripts/benchmark.mjs                     # every installed local model
//   node scripts/benchmark.mjs --models qwen3:14b,qwen2.5-coder:7b
//   node scripts/benchmark.mjs --ctx 16384         # benchmark at a profile's context size
//
// Notes: each model is loaded (cold timing), then run again warm (real speed),
// then released (keep_alive 0) so the next model measures a clean GPU. "*-cloud"
// models are skipped — they don't run on this hardware.

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const CTX = Number(argOf('--ctx')) || 8192;
const PROMPT = argOf('--prompt') ||
  'In exactly three sentences, explain why a 14B parameter model gives better answers than a 3B model, and what it costs in speed.';

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const gb = (b) => (Number.isFinite(b) ? (b / 1024 ** 3).toFixed(1) + 'GB' : '—');
const secs = (ns) => (Number.isFinite(ns) ? (ns / 1e9).toFixed(1) + 's' : '—');

async function generate(model, keepAlive) {
  const t0 = Date.now();
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, prompt: PROMPT, stream: false, keep_alive: keepAlive,
      options: { num_ctx: CTX, num_predict: 160, temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(600000),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = await r.json();
  return { wallMs: Date.now() - t0, ...j };
}

async function placement(model) {
  try {
    const r = await fetch(`${OLLAMA}/api/ps`);
    const m = ((await r.json()).models || []).find((x) => x.name === model || x.model === model);
    if (!m) return null;
    const vram = m.size_vram ?? 0;
    const pctGpu = m.size ? Math.round((vram / m.size) * 100) : 0;
    return { size: m.size, vram, pctGpu };
  } catch { return null; }
}

const wanted = argOf('--models')?.split(',').map((s) => s.trim()).filter(Boolean);
const tags = await fetch(`${OLLAMA}/api/tags`).then((r) => r.json()).catch(() => null);
if (!tags) { console.error(`Cannot reach Ollama at ${OLLAMA} — is it running?`); process.exit(1); }
const installed = (tags.models || []).map((m) => m.name);
const models = (wanted || installed).filter((m) => !/[-:]cloud$/i.test(m));
if (!models.length) { console.error('No local models to benchmark.'); process.exit(1); }

console.log(`KAEL benchmark — ctx ${CTX}, ${models.length} model(s)\n`);
const rows = [];
for (const model of models) {
  if (!installed.some((n) => n === model || n.startsWith(model + ':'))) {
    console.log(`  ${model}: not installed — skipping`); continue;
  }
  process.stdout.write(`  ${model} … cold`);
  try {
    const cold = await generate(model, '2m');
    process.stdout.write(' → warm');
    const warm = await generate(model, '2m');
    const place = await placement(cold.model || model);
    await generate(model, 0).catch(() => {});   // release so the next model is measured clean
    const toks = warm.eval_count / (warm.eval_duration / 1e9);
    const ttft = (warm.load_duration + warm.prompt_eval_duration) / 1e9;
    rows.push({
      model,
      coldLoad: secs(cold.load_duration),
      ttft: fmt(ttft, 2) + 's',
      speed: fmt(toks) + ' tok/s',
      size: place ? gb(place.size) : '—',
      gpu: place ? `${place.pctGpu}% GPU` : '—',
      wall: fmt(warm.wallMs / 1000, 1) + 's',
    });
    console.log(` ✓  ${fmt(toks)} tok/s, ${place ? place.pctGpu + '% on GPU' : ''}`);
  } catch (err) {
    console.log(` ✗  ${err.message}`);
    rows.push({ model, coldLoad: 'FAILED', ttft: '—', speed: '—', size: '—', gpu: '—', wall: '—' });
  }
}

console.log('\n%-38s %-10s %-8s %-12s %-8s %-9s %s'.replace(/%-?(\d+)s/g, (_, w) => ''.padEnd(0)) || '');
const pad = (s, w) => String(s).padEnd(w);
console.log('\n' + pad('MODEL', 38) + pad('COLD', 10) + pad('TTFT', 8) + pad('SPEED', 12) + pad('SIZE', 8) + pad('PLACEMENT', 11) + 'TOTAL');
for (const r of rows) {
  console.log(pad(r.model, 38) + pad(r.coldLoad, 10) + pad(r.ttft, 8) + pad(r.speed, 12) + pad(r.size, 8) + pad(r.gpu, 11) + r.wall);
}
console.log('\nTTFT = time to first token when warm (load + prompt eval). SPEED = warm generation rate.');
console.log('PLACEMENT: 100% GPU = fully in VRAM (fast); lower = split with system RAM (slower but works thanks to 64GB).');
