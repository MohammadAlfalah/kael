# kael_caption.py — call the fine-tuned model served by llama-server (llama.cpp),
# the OpenAI-compatible endpoint that reliably runs a custom Qwen2.5-VL GGUF + mmproj.
# This is the drop-in replacement for KAEL's Ollama vision call once you've fine-tuned.
#
# Start the server first (see README Phase 4):
#   llama-server -m kael-3b-Q4_K_M.gguf --mmproj mmproj-kael-f16.gguf --host 127.0.0.1 --port 8080 -ngl 99

import base64, requests


def caption_screen(jpg_path, endpoint="http://127.0.0.1:8080/v1/chat/completions"):
    b64 = base64.b64encode(open(jpg_path, "rb").read()).decode()
    payload = {
        "model": "kael",  # llama-server ignores the name; any string is fine
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content":
                "You are KAEL's vision module. Write ONE short line describing the user's activity."},
            {"role": "user", "content": [
                {"type": "text", "text": "Write a one-line activity caption for this screen."},
                {"type": "image_url",
                 "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]},
        ],
    }
    r = requests.post(endpoint, json=payload, timeout=60)
    return r.json()["choices"][0]["message"]["content"].strip()


if __name__ == "__main__":
    print(caption_screen("test.jpg"))
