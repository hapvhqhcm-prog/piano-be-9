# -*- coding: utf-8 -*-
"""
Tạo sẵn giọng đọc tự nhiên (giọng nữ HoaiMy, OWNER duyệt 2026-11-08) cho từng câu trong voice/corpus.txt
→ public/voice/hm/<mã câu>.mp3 + public/voice/hm/index.json (danh sách mã có file).

Mã câu PHẢI giống src/audio/voiceClips.ts → voiceKey() (tests/voiceClips.test.ts canh vài mẫu).
Chỉ tạo câu còn thiếu; câu không còn trong corpus vẫn giữ file (bản cũ của app có thể còn dùng).

Chạy:  python -m pip install edge-tts   (một lần)
       npx vite-node scripts/voice-corpus.mjs && python scripts/voice-gen.py
"""
import asyncio
import json
import os
import re
import sys
import unicodedata

import edge_tts

try:  # cửa sổ lệnh Windows (cp1252) không in được chữ Việt
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

VOICE = 'vi-VN-HoaiMyNeural'
RATE = '-8%'
PITCH = '+5Hz'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'voice', 'hm')
CORPUS = os.path.join(ROOT, 'voice', 'corpus.txt')


def norm_sentence(s: str) -> str:
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', s)).strip()


def fnv32(data: bytes, basis: int) -> int:
    h = basis
    for b in data:
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def voice_key(sentence: str) -> str:
    b = norm_sentence(sentence).encode('utf-8')
    return f'{fnv32(b, 0x811C9DC5):08x}{fnv32(b, 0x050C5D1F):08x}'


async def make(sentence: str, path: str, sem: asyncio.Semaphore) -> bool:
    async with sem:
        for attempt in range(4):
            try:
                tmp = path + '.part'
                # mạng treo → bỏ lượt sau 60 giây rồi thử lại
                await asyncio.wait_for(edge_tts.Communicate(sentence, VOICE, rate=RATE, pitch=PITCH).save(tmp), 60)
                if os.path.getsize(tmp) < 500:
                    raise RuntimeError('file quá nhỏ')
                os.replace(tmp, path)
                return True
            except Exception as e:  # mạng chập chờn → thử lại
                if attempt == 3:
                    print(f'  ✗ {sentence[:60]!r}: {e}', file=sys.stderr)
                await asyncio.sleep(1.5 * (attempt + 1))
        return False


async def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == '--keys':
        for s in sys.argv[2:]:
            print(voice_key(s))
        return
    os.makedirs(OUT, exist_ok=True)
    with open(CORPUS, encoding='utf-8') as f:
        sentences = [norm_sentence(x) for x in f.read().splitlines() if x.strip()]
    todo = []
    for s in sentences:
        p = os.path.join(OUT, voice_key(s) + '.mp3')
        if not os.path.exists(p):
            todo.append((s, p))
    print(f'{len(sentences)} câu trong corpus, cần tạo {len(todo)}')
    sem = asyncio.Semaphore(4)
    done = 0
    ok = 0
    for i in range(0, len(todo), 40):
        batch = todo[i : i + 40]
        res = await asyncio.gather(*(make(s, p, sem) for s, p in batch))
        ok += sum(res)
        done += len(batch)
        print(f'  {done}/{len(todo)} (được {ok})', flush=True)
    keys = sorted(n[:-4] for n in os.listdir(OUT) if n.endswith('.mp3'))
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(keys, f, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(OUT, k + '.mp3')) for k in keys)
    print(f'index.json: {len(keys)} câu, {total / 1e6:.1f} MB')


asyncio.run(main())
