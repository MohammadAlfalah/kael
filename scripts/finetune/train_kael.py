# train_kael.py
# LoRA-fine-tune Qwen2.5-VL-3B on KAEL's (screenshot, caption) pairs.
#
# Tool: Unsloth (FastVisionModel) — most memory-efficient + reliable single-24GB-GPU
# path for Qwen2.5-VL, and produces a clean merged-16bit checkpoint that llama.cpp
# converts to GGUF + mmproj. Run on a RENTED 24GB cloud GPU (RTX 4090 / A40), NOT the
# 6GB laptop. See README.md for the full pipeline.

import json, os
from PIL import Image
from unsloth import FastVisionModel
from unsloth.trainer import UnslothVisionDataCollator
from trl import SFTTrainer, SFTConfig

# ────────────────────────────── CONFIG ──────────────────────────────
DATA_DIR     = "data/training"                    # KAEL writes here (images/ + labels.jsonl)
IMAGES_DIR   = os.path.join(DATA_DIR, "images")
LABELS_JSONL = os.path.join(DATA_DIR, "labels.jsonl")
BASE_MODEL   = "unsloth/Qwen2.5-VL-3B-Instruct"   # Unsloth's 4-bit-ready repo
MAX_SEQ_LEN  = 4096          # captions are short; modest = less VRAM
EPOCHS       = 2             # 2–3 is plenty; more overfits at small data sizes
LR           = 1e-4
OUT_LORA     = "outputs/kael-lora"
OUT_MERGED   = "outputs/kael-merged-16bit"
SYSTEM_PROMPT = (
    "You are KAEL's vision module. Look at the screenshot and write ONE short "
    "line describing the user's current activity. Be specific about app and task."
)
INSTRUCTION   = "Write a one-line activity caption for this screen."
# ─────────────────────────────────────────────────────────────────────

# 1) Load in 4-bit (QLoRA). Vision tower stays frozen (see get_peft_model).
model, tokenizer = FastVisionModel.from_pretrained(
    BASE_MODEL,
    load_in_4bit=True,
    use_gradient_checkpointing="unsloth",   # big VRAM saver
    max_seq_length=MAX_SEQ_LEN,
)

# 2) Attach LoRA. CRITICAL: freeze the vision tower.
#    Keeping the vision encoder identical to stock = far less VRAM, AND avoids the
#    most common GGUF/mmproj corruption (you export the unmodified, known-good
#    projector). For caption-style personalization, the LANGUAGE side is what needs
#    to learn YOUR phrasing/apps.
model = FastVisionModel.get_peft_model(
    model,
    finetune_vision_layers   = False,   # <-- freeze vision
    finetune_language_layers = True,
    finetune_attention_modules = True,
    finetune_mlp_modules     = True,
    r=16, lora_alpha=16, lora_dropout=0.0, bias="none",
    random_state=3407,
)

# 3) Load YOUR labels.jsonl ({"file","caption"}) into the chat format Unsloth wants.
def load_dataset():
    samples = []
    with open(LABELS_JSONL, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            img_path = os.path.join(IMAGES_DIR, row["file"])
            if not os.path.exists(img_path):
                print(f"WARN missing image, skipping: {img_path}")
                continue
            image = Image.open(img_path).convert("RGB")
            samples.append({
                "messages": [
                    {"role": "system",
                     "content": [{"type": "text", "text": SYSTEM_PROMPT}]},
                    {"role": "user",
                     "content": [
                         {"type": "image", "image": image},
                         {"type": "text",  "text": INSTRUCTION},
                     ]},
                    {"role": "assistant",
                     "content": [{"type": "text", "text": row["caption"]}]},
                ]
            })
    print(f"Loaded {len(samples)} training samples.")
    if len(samples) < 200:
        print("WARNING: <200 samples — a LoRA on a 3B VLM will likely overfit. "
              "Consider sticking with the prompt-based learned profile instead.")
    return samples

train_dataset = load_dataset()

# 4) Train. UnslothVisionDataCollator handles image tokenization/padding.
FastVisionModel.for_training(model)
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    data_collator=UnslothVisionDataCollator(model, tokenizer),
    train_dataset=train_dataset,
    args=SFTConfig(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,     # effective batch 8
        num_train_epochs=EPOCHS,
        learning_rate=LR,
        warmup_ratio=0.05,
        logging_steps=5,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=3407,
        output_dir="outputs/checkpoints",
        report_to="none",
        remove_unused_columns=False,          # required for vision SFT in TRL
        dataset_text_field="",
        dataset_kwargs={"skip_prepare_dataset": True},
        max_seq_length=MAX_SEQ_LEN,
    ),
)
trainer.train()

# 5) Save the raw LoRA adapter (small backup) ...
model.save_pretrained(OUT_LORA)
tokenizer.save_pretrained(OUT_LORA)

# 6) ... and the MERGED 16-bit model (what llama.cpp converts to GGUF + mmproj).
model.save_pretrained_merged(OUT_MERGED, tokenizer, save_method="merged_16bit")
print("Done. Merged model at:", OUT_MERGED)
print("Next: convert to GGUF + mmproj with llama.cpp (README Phase 3).")
