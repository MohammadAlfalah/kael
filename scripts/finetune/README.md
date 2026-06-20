# KAEL vision fine-tuning — pipeline & honest guide

Fine-tune the local vision model (`qwen2.5vl:3b`) on **your own screenshots** so it
captions *your* apps/projects more accurately. This is the long-game "real training"
track. **Read the verdict before you spend a cent.**

> KAEL already collects the dataset for you: turn on **⚙ Settings → Awareness →
> "Collect training data"** and it saves `(screenshot, caption)` pairs to
> `data/training/` (gitignored). Your corrections refine the captions. Keep using it
> for weeks until you have a few hundred solid pairs — *then* come back here.

---

## Verdict — is this even worth it? (honest)

**Probably not yet.** For a one-line activity caption with apps you can enumerate,
**in-context personalization (the "learned profile" KAEL already has) gets you 80–90%
of the benefit for $0 and zero conversion pain.** Qwen2.5-VL-3B already *reads* screens
well; it fails because it doesn't know *your* vocabulary ("the kael project", your Edge
profile) — a knowledge-injection problem the learned profile + corrections solve
instantly.

**Fine-tune only when ALL THREE are true:**
1. You've hit a real ceiling with prompting (captions still wrong *after* a strong
   learned profile).
2. You have **300+ real, consistently-labeled** screenshots (1k+ is better). Below
   ~200, a LoRA on a 3B VLM **overfits and regresses** on screens it hasn't seen.
3. You want lower latency / a smaller prompt (fine-tuning lets you drop the few-shot
   block).

The fine-tune itself is cheap (~$1–3, 1–3 h on a rented 24 GB GPU). The expensive part
is **labeling** hundreds of consistent screens and the **GGUF/serving** friction below.

## The serving gotcha (the fragile last mile)

Fine-tuning is easy; getting the result back into **Ollama** is the part that breaks.
Ollama's importer for a *custom* vision GGUF + separate `mmproj` is buggy across
versions. **So the reliable path serves the fine-tuned model with `llama-server`
(llama.cpp), exposing an OpenAI-compatible endpoint that KAEL calls instead of Ollama.**
Try the Ollama import as a bonus (60-second image test in Phase 5) — if it works, use
it; if it ignores the image or garbles output, stay on `llama-server`.

---

## Pipeline (rent a GPU → KAEL uses your model)

### Phase 0 — your dataset (already collected locally)
```
data/training/
  images/0001.jpg, 0002.jpg, ...
  labels.jsonl          # {"file": "0001.jpg", "caption": "Coding in VS Code on the kael project"}
```
Aim for **300+** pairs, captions **consistent in style** (same tense/length/format —
the model learns your phrasing). Then: `tar -czf kael_data.tgz data/training/`

### Phase 1 — rent a cloud GPU
A **single 24 GB card** is plenty for QLoRA on a 3B VLM (you do NOT need an A100).
- RunPod: RTX 4090 24 GB ~$0.34–0.69/hr (easy), or A40 48 GB ~$0.40/hr.
- Vast.ai: RTX 4090 often $0.20–0.40/hr (cheapest).

Deploy a "PyTorch 2.4 / CUDA 12.4+" pod, ~40 GB disk. Upload your data
(`runpodctl send kael_data.tgz` → `runpodctl receive <code>` → `tar -xzf`).

### Phase 2 — install + train
```bash
pip install -U "unsloth[cu124] @ git+https://github.com/unslothai/unsloth.git"
pip install -U "git+https://github.com/huggingface/transformers.git" qwen-vl-utils pillow
python train_kael.py        # see train_kael.py; ~30–90 min for 1–3k samples on a 4090
# -> outputs/kael-merged-16bit/ (for conversion)  +  outputs/kael-lora/ (adapter backup)
```

### Phase 3 — convert to GGUF + mmproj (same pod, llama.cpp)
```bash
git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp
pip install -r requirements.txt && cmake -B build && cmake --build build -j --config Release && cd ..

# language model -> GGUF, then quantize to fit a 6GB laptop:
python llama.cpp/convert_hf_to_gguf.py outputs/kael-merged-16bit --outfile kael-3b-f16.gguf --outtype f16
./llama.cpp/build/bin/llama-quantize kael-3b-f16.gguf kael-3b-Q4_K_M.gguf Q4_K_M

# vision encoder -> separate mmproj (keep it f16/Q8 — don't quantize vision hard):
python llama.cpp/convert_hf_to_gguf.py outputs/kael-merged-16bit --mmproj --outfile mmproj-kael-f16.gguf --outtype f16

# MOMENT OF TRUTH — smoke test before packaging:
./llama.cpp/build/bin/llama-mtmd-cli -m kael-3b-Q4_K_M.gguf --mmproj mmproj-kael-f16.gguf \
    --image data/training/images/0001.jpg -p "Write a one-line activity caption."
# Expect a real caption. Garbled "@@@@"/empty => llama.cpp too old: `git pull`, rebuild, retry.
```
Download both GGUFs to your laptop, then **terminate the pod**.

### Phase 4 — serve locally for KAEL (PRIMARY: llama.cpp)
On your laptop (build llama.cpp, or grab a Windows release):
```bash
llama-server -m kael-3b-Q4_K_M.gguf --mmproj mmproj-kael-f16.gguf \
    --host 127.0.0.1 --port 8080 -ngl 99      # drop -ngl if you OOM on 6GB
```
Point KAEL's vision call at `http://127.0.0.1:8080/v1/chat/completions` (OpenAI-style,
image as a base64 data URI). See `kael_caption.py`. In KAEL set `AWARENESS_MODEL` aside
and route awareness to this endpoint (small server change — ask Claude to wire it).

### Phase 5 (optional) — try Ollama
```bash
# Modelfile:  FROM ./kael-3b-Q4_K_M.gguf  /  FROM ./mmproj-kael-f16.gguf  /  PARAMETER temperature 0.2
ollama create kael-vision -f Modelfile
ollama run kael-vision "Caption this." --image data/training/images/0001.jpg
```
If it captions AND sees the image → use Ollama (repoint KAEL). If it ignores the image
/ crashes / garbles → known import bug; **stay on `llama-server`**.

---

## Files
- `train_kael.py` — Unsloth QLoRA training script (run on the cloud GPU).
- `kael_caption.py` — drop-in KAEL inference call against the `llama-server` endpoint.

## Sources (verified 2026)
llama.cpp multimodal docs & `convert_hf_to_gguf.py --mmproj`; Unsloth `FastVisionModel`;
Ollama custom-mmproj import bugs (ollama #14730/#14388/#16264) — the reason `llama-server`
is the primary serve target. Pin a recent llama.cpp commit; the Phase 3 smoke test catches
a stale build.
