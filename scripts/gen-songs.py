# Sinh src/data/songs/*.json — chạy: PYTHONIOENCODING=utf-8 py scripts/gen-songs.py
# Cú pháp nốt:  E4        = nốt đen (1 phách), ngón lấy từ bảng thế tay
#               E4:1.5    = 1,5 phách       E4:2/3 = 2 phách, ngón 3 (ghi rõ — bắt buộc ở bài "free")
#               C3+E3+G3:4 = hợp âm (ngón theo thế tay)   C3+G3:4/5+1 = hợp âm, ngón ghi rõ
#               R:2       = dấu lặng 2 phách
# Sắc thái & kiểu đàn (v4, OWNER duyệt 2026-10-05):
#               p / mf / f  = token riêng: sắc thái từ nốt KẾ TIẾP trở đi (giữ tới khi đổi) → "dyn"
#               E4'       = ngắt tiếng (staccato) → "stac": true         (E4:0.5/2' cũng được)
#               (E4 … C4) = luyến: "(" trước nốt đầu, ")" sau nốt cuối → "slur": "start" / "end"
#   Quy ước (giáo trình v5, 30 tuần): p/mf/f từ tuần 6 (trò "To hay nhỏ?"); ngắt/luyến từ tuần 12 (trò "Ngắt hay liền?").
# Nhịp (v5): móc đơn từ tuần 4, 2/4 từ tuần 9, móc kép / nghịch phách từ tuần 18 — bài chỉ được đặt SAU tuần dạy nhịp đó
# (tests/curriculum-v5.test.ts kiểm).
# Tất cả giai điệu thuộc PUBLIC DOMAIN hoặc do dự án tự sáng tác; bản phối 5 ngón tự soạn.
import json, glob, os

POS = {
 ("C","RH"): {"C4":1,"D4":2,"E4":3,"F4":4,"G4":5,"A4":5},  # A4 = ngón 5 duỗi (chỉ khi extension)
 ("C","LH"): {"C3":5,"D3":4,"E3":3,"F3":2,"G3":1},
 ("MC","LH"): {"C4":1,"B3":2,"A3":3,"G3":4,"F3":5},
 ("G","RH"): {"G4":1,"A4":2,"B4":3,"C5":4,"D5":5},
 ("G","LH"): {"G2":5,"A2":4,"B2":3,"C3":2,"D3":1},
 ("D","RH"): {"D4":1,"E4":2,"F#4":3,"G4":4,"A4":5},
 ("Cm","RH"): {"C4":1,"D4":2,"Eb4":3,"F4":4,"G4":5},
 ("Am","RH"): {"A3":1,"B3":2,"C4":3,"D4":4,"E4":5},
 ("C5","RH"): {"C5":1,"D5":2,"E5":3,"F5":4,"G5":5},   # thế Đô cao (tuần 25)
}
DYN = {"p", "mf", "f"}
E = "Original simple arrangement for this app"

def num(x):
    v = float(x)
    return int(v) if v == int(v) else v

def voice(seq, hand, pos):
    out = []
    dyn = None; cur = None; in_slur = False
    for tok in seq.split():
        if tok in DYN:
            assert tok != cur, ("sắc thái lặp", seq[:30], tok)
            dyn = cur = tok; continue
        slur_start = tok.startswith("(")
        if slur_start: tok = tok[1:]
        stac = slur_end = False
        while tok[-1] in ")'":
            if tok[-1] == ")": slur_end = True
            else: stac = True
            tok = tok[:-1]
        body, _, fing = tok.partition("/")
        main, _, beats = body.partition(":")
        beats = num(beats) if beats else 1
        if main == "R":
            assert not (slur_start or slur_end or stac), ("dấu lặng không có ngắt/luyến", tok)
            out.append({"rest": True, "beats": beats}); continue
        pitches = main.split("+")
        fingers = [int(f) for f in fing.split("+")] if fing else [POS[(pos, hand)][p] for p in pitches]
        assert len(fingers) == len(pitches), tok
        n = {"pitch": pitches[0], "beats": beats, "finger": fingers[0]}
        if fing: n["_fixed"] = True
        if len(pitches) > 1:
            n["also"] = [{"pitch": p, "finger": f} for p, f in zip(pitches[1:], fingers[1:])]
        if dyn: n["dyn"] = dyn; dyn = None
        if slur_start:
            assert not in_slur, ("luyến lồng nhau", tok); in_slur = True; n["slur"] = "start"
        if stac:
            assert not in_slur, ("nốt ngắt nằm trong dấu luyến", tok); n["stac"] = True
        if slur_end:
            assert in_slur and not slur_start, ("luyến thiếu mở / chỉ một nốt", tok); in_slur = False; n["slur"] = "end"
        out.append(n)
    assert not in_slur, ("luyến chưa đóng", seq[:30])
    assert dyn is None, ("sắc thái ở cuối bè", seq[:30])
    return out

# ---- Bài có La (A4) ở thế Đô: tránh ngón 5 lặp lại trên Sol–La–Sol.
# Hai "chỗ đặt tay": thế Đô (C1 D2 E3 F4 G5) và thế Đô-dịch-lên (D1 E2 F3 G4 A5, Đô với ngón cái duỗi xuống).
# Quy hoạch động chọn chỗ đặt tay cho từng nốt: Sol–La–Sol thành 4-5-4, Sol–La–Sol–Fa thành 4-5-4-3;
# chỉ dời tay ở nốt dài / bước nhảy / sau dấu lặng; không bao giờ cùng một ngón cho hai phím liền nhau (trừ khi có nốt dài để dời tay).
HAND_C = {"C4": 1, "D4": 2, "E4": 3, "F4": 4, "G4": 5}
HAND_D = {"C4": 1, "D4": 1, "E4": 2, "F4": 3, "G4": 4, "A4": 5}
NOTE_IDX = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

def midi(p):
    acc = p[1:-1]
    return 12 * (int(p[-1]) + 1) + NOTE_IDX[p[0]] + (1 if acc == "#" else -1 if acc == "b" else 0)

def extension_fingers(notes):
    seq = [n for n in notes if not n.get("rest")]
    INF = float("inf")
    def cands(n):
        if n.get("_fixed"): return [("X", n["finger"])]
        out = [("C", HAND_C[n["pitch"]])] if n["pitch"] in HAND_C else []
        if n["pitch"] in HAND_D:
            out.append(("D", HAND_D[n["pitch"]]))
        return out
    def node_cost(n, st):
        if st == "D" and n["pitch"] == "C4": return 0.6   # ngón cái duỗi xuống Đô
        return 0.05 if st == "D" else 0
    def edge(a, b, sa, fa, sb, fb, gap):
        c = 0.0
        relaxed = gap or a["beats"] >= 2           # có thời gian dời tay
        dp = midi(b["pitch"]) - midi(a["pitch"])
        if "X" not in (sa, sb) and sa != sb:
            c += 2.5 if dp == 0 else 0.4 if (relaxed or abs(dp) >= 3) else 1.0
        if dp != 0 and fa == fb: c += 1.5 if relaxed else 4
        if dp * (fb - fa) < 0: c += 6                # lên phím mà xuống ngón (vắt ngón) — tránh
        return c
    best = [{s: (node_cost(seq[0], s[0]), None) for s in cands(seq[0])}]
    # gap: có dấu lặng giữa hai nốt
    idx = [i for i, n in enumerate(notes) if not n.get("rest")]
    for k in range(1, len(seq)):
        a, b = seq[k - 1], seq[k]
        gap = idx[k] - idx[k - 1] > 1
        row = {}
        for sb in cands(b):
            bc, bp = INF, None
            for sa, (ca, _) in best[-1].items():
                v = ca + edge(a, b, sa[0], sa[1], sb[0], sb[1], gap) + node_cost(b, sb[0])
                if v < bc: bc, bp = v, sa
            row[sb] = (bc, bp)
        best.append(row)
    s = min(best[-1], key=lambda k: best[-1][k][0])
    for k in range(len(seq) - 1, -1, -1):
        seq[k]["finger"] = s[1]
        s = best[k][s][1]

def song(id, title, titleVi, composer, week, hand, seq, phrases=None, ext=None, pos="C",
         lh=None, lhpos="C", ts="4/4", arr=E):
    d = {"id": id, "title": title, "titleVi": titleVi, "composer": composer, "sourceStatus": "public-domain",
         "arrangementBy": arr, "attributionRequired": False, "hand": hand, "bpm": 60, "timeSignature": ts, "week": week}
    if ext: d["extension"] = ext
    main_hand = "LH" if hand == "LH" else "RH"
    notes = voice(seq, main_hand, pos)
    if ext == "A4" and pos == "C":
        extension_fingers(notes)
        pos = "free"   # số ngón ghi riêng từng nốt (không còn đúng một bảng thế cố định)
    if pos != "C": d["position"] = pos
    if phrases: d["phrases"] = phrases
    d["notes"] = notes
    if lh:
        d["lh"] = voice(lh, "LH", lhpos)
        if lhpos != "C": d["lhPosition"] = lhpos
    allv = notes + d.get("lh", [])
    if any("dyn" in n for n in allv): assert week >= 6, (id, "p/mf/f chỉ từ tuần 6")
    if any("stac" in n or "slur" in n for n in allv): assert week >= 12, (id, "ngắt/luyến chỉ từ tuần 12")
    # Nhịp (v5): móc kép (< nửa phách) chỉ từ tuần 18, nhịp 2/4 chỉ từ tuần 9
    if any(n["beats"] < 0.5 for n in allv): assert week >= 18, (id, "móc kép chỉ từ tuần 18")
    if ts == "2/4": assert week >= 9, (id, "nhịp 2/4 chỉ từ tuần 9")
    # (2026-10-06) Các nhịp / phím khác — đúng tuần dạy (tests/curriculum-v5.test.ts): 3/4 tuần 15, phím đen tuần 16,
    # đen chấm dôi tuần 17, "Tập-tễnh" (móc đơn chấm) tuần 18, nghịch phách tuần 19
    if ts == "3/4": assert week >= 15, (id, "nhịp 3/4 chỉ từ tuần 15")
    if any(p[1:-1] for n in allv if not n.get("rest") for p in [n["pitch"]] + [a["pitch"] for a in n.get("also", [])]):
        assert week >= 16, (id, "phím đen chỉ từ tuần 16")
    for v in [notes] + ([d["lh"]] if lh else []):
        s = 0
        for n in v:
            if not n.get("rest"):
                if n["beats"] == 1.5: assert week >= 17, (id, "đen chấm dôi chỉ từ tuần 17")
                if n["beats"] == 0.75: assert week >= 18, (id, "móc đơn chấm chỉ từ tuần 18")
                if s % 1 > 1e-9 and s + n["beats"] > -(-s // 1) + 1e-9: assert week >= 19, (id, "nghịch phách chỉ từ tuần 19")
            s += n["beats"]
    return d

ORIG = "Bài tự sáng tác cho app (piano-be-9)"
# Dân ca Việt Nam (OWNER yêu cầu 2026-10-05): giai điệu truyền thống, đối chiếu ≥ 2 bản ký âm độc lập.
# Ghi ĐÚNG NHỊP 2/4 và trường độ của bản gốc (móc kép = 0.25 phách, đơn chấm = 0.75): mỗi ô 2/4 của bản ký âm = một ô.
# Khuông nhạc vẽ gạch nối theo phách như bản in. Tốc độ vẫn tính theo nốt đen (thang 40–50–60–72).
# Nhịp lấy đà: dấu lặng ở đầu ô 0 cho tròn ô nhịp. Bỏ nốt hoa mỹ (luyến láy) như các bản ký âm đã bỏ.
# Bàn tay NGŨ CUNG (Fa trưởng ngũ cung Đô Rê Fa Sol La): Đô1 Rê2 Fa3 Sol4 La5 — mỗi ngón một phím, không dời tay
# (Rê–Fa cách một phím bằng ngón 2-3; Sol–La vẫn là 4-5 như quy tắc tuần 7).
PENTA_F = {"C4": 1, "D4": 2, "F4": 3, "G4": 4, "A4": 5}

def fingered(seq, table):
    """Ghi số ngón theo bảng cho mọi nốt chưa ghi ngón (giữ nguyên "(", ")", "'", sắc thái, dấu lặng)."""
    out = []
    for tok in seq.split():
        head = "(" if tok.startswith("(") else ""
        body = tok[len(head):]
        tail = ""
        while body and body[-1] in ")'":
            tail = body[-1] + tail; body = body[:-1]
        pitch = body.partition(":")[0]
        if pitch in table and "/" not in body:
            body += f"/{table[pitch]}"
        out.append(head + body + tail)
    return " ".join(out)

FOLK = "Ký âm đơn giản cho app từ các bản ký âm dân ca phổ biến (nhịp 2/4, trường độ như bản gốc)"
S = []
# ---------------------------------------------------------------- CẤP 1 (tuần 2–10)
S += [
 song("hot_cross_buns","Hot Cross Buns","Bánh nóng","Dân ca Anh (traditional)",2,"RH",
  "E4 D4 C4:2  E4 D4 C4:2  C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5  E4 D4 C4:2",[0,2]),
 song("mary_lamb","Mary Had a Little Lamb","Chú cừu nhỏ","Dân ca Mỹ (traditional)",3,"RH",
  "E4 D4 C4 D4  E4 E4 E4:2  D4 D4 D4:2  E4 G4 G4:2  E4 D4 C4 D4  E4 E4 E4 E4  D4 D4 E4 D4  C4:4",[0,4]),
 song("au_clair","Au clair de la lune","Dưới ánh trăng","Dân ca Pháp (traditional)",3,"RH",
  "C4 C4 C4 D4  E4:2 D4:2  C4 E4 D4 D4  C4:4  C4 C4 C4 D4  E4:2 D4:2  C4 E4 D4 D4  C4:4",[0,4]),
 song("go_tell_aunt_rhody","Go Tell Aunt Rhody","Đi báo cô Rhody","Dân ca Mỹ (traditional)",4,"RH",
  "E4:2 E4 D4  C4:2 C4:2  D4:2 D4 F4  E4 D4 C4:2  G4:2 G4 F4  E4:2 E4:2  D4 C4 D4 E4  C4:4",[0,2,4,6]),
 song("lightly_row","Lightly Row","Chèo thuyền nhẹ","Dân ca Đức (traditional)",4,"RH",
  "G4 E4 E4:2  F4 D4 D4:2  C4 D4 E4 F4  G4 G4 G4:2  G4 E4 E4:2  F4 D4 D4:2  C4 E4 G4 G4  C4:4",[0,4]),
 song("ode_to_joy_easy","Ode to Joy","Bài ca niềm vui","Ludwig van Beethoven",6,"RH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2",[0,4]),
 song("jingle_bells","Jingle Bells (chorus)","Chuông ngân vang","James Lord Pierpont (1857)",6,"RH",
  "f E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  mf F4 F4 F4 F4  F4 E4 E4 E4  E4 D4 D4 E4  D4:2 G4:2  f E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  G4 G4 F4 D4  C4:4",[0,4,8,12]),
 song("saints","When the Saints Go Marching In","Các thánh tiến bước","Spiritual (traditional)",6,"RH",
  "mf R C4 E4 F4  G4:4  R C4 E4 F4  G4:4  R C4 E4 F4  G4:2 E4:2  C4:2 E4:2  D4:4  f R E4 E4 D4  C4:3 C4  E4:2 G4 G4  F4:4  E4 F4 G4:2  E4:2 C4:2  D4:4  C4:4",[0,4,8,12]),
 song("largo_new_world","Largo — New World Symphony","Khúc Largo (Thế giới mới)","Antonín Dvořák (1893)",7,"RH",
  "p E4 G4 G4:2  E4 D4 C4:2  D4 E4 G4 E4  D4:4  E4 G4 G4:2  E4 D4 C4:2  D4 E4 D4 C4  C4:4",[0,4]),
 song("hot_cross_buns_lh","Hot Cross Buns (left hand)","Bánh nóng — tay trái","Dân ca Anh (traditional)",7,"LH",
  "f E3 D3 C3:2  p E3 D3 C3:2  mf C3:0.5 C3:0.5 C3:0.5 C3:0.5 D3:0.5 D3:0.5 D3:0.5 D3:0.5  f E3 D3 C3:2",[0,2]),
 song("mary_lamb_lh","Mary Had a Little Lamb (left hand)","Chú cừu nhỏ — tay trái","Dân ca Mỹ (traditional)",7,"LH",
  "E3 D3 C3 D3  E3 E3 E3:2  D3 D3 D3:2  E3 G3 G3:2  E3 D3 C3 D3  E3 E3 E3 E3  D3 D3 E3 D3  C3:4",[0,4]),
 song("au_clair_lh","Au clair de la lune (left hand)","Dưới ánh trăng — tay trái","Dân ca Pháp (traditional)",7,"LH",
  "C3 C3 C3 D3  E3:2 D3:2  C3 E3 D3 D3  C3:4  C3 C3 C3 D3  E3:2 D3:2  C3 E3 D3 D3  C3:4",[0,4]),
 song("frere_jacques_easy","Frère Jacques","Kìa con bướm vàng","Dân ca Pháp (traditional)",8,"RH",
  "f C4 D4 E4 C4  p C4 D4 E4 C4  f E4 F4 G4:2  p E4 F4 G4:2  f G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4  p G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4  f C4/2 G3/1 C4:2/2  p C4/2 G3/1 C4:2/2",[0,2,4,6],"A4"),
 song("london_bridge","London Bridge","Cầu London","Dân ca Anh (traditional)",8,"RH",
  "G4 A4 G4 F4  E4 F4 G4:2  D4 E4 F4:2  E4 F4 G4:2  G4 A4 G4 F4  E4 F4 G4:2  D4:2 G4:2  E4 C4:3",[0,4],"A4"),
 song("twinkle_easy","Twinkle Twinkle Little Star","Ngôi sao nhỏ","Dân ca Pháp \"Ah! vous dirai-je, maman\" (traditional)",8,"RH",
  "C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2  G4 G4 F4 F4  E4 E4 D4:2  G4 G4 F4 F4  E4 E4 D4:2  C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2",[0,4,8],"A4"),
 song("this_old_man","This Old Man","Ông lão vui tính","Dân ca Anh (traditional)",10,"RH",
  "G4 E4 G4:2  G4 E4 G4:2  A4 G4 F4 E4  D4 E4 F4:2  E4 F4 G4 C4  C4 C4 C4 D4  E4 F4 G4:2  G4 D4 D4 F4  E4 D4 C4:2",[0,4],"A4"),
 song("old_macdonald","Old MacDonald Had a Farm","Ông MacDonald có trang trại","Dân ca Mỹ (traditional)",10,"RH",
  "f F4 F4 F4 C4  D4 D4 C4:2  A4 A4 G4 G4  F4:3 C4  F4 F4 F4 C4  D4 D4 C4:2  A4 A4 G4 G4  F4:4",[0,4],"A4"),
 song("oh_susanna","Oh! Susanna","Ô Susanna","Stephen Foster (1848)",10,"RH",
  "mf C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 C4 D4:2  C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 D4 C4:2",[0,4],"A4"),
 # ---- Dân ca Việt Nam
 # Tuần 18 (v5: dời từ tuần 2 — có móc kép, dạy ở tuần 18) — chỉ Đô Rê Mi. Câu đầu bài quan họ (hạ một quãng tám: Đô4–Mi4). Ô 9→10 vốn là Đô nối dài: đàn lại Đô.
 song("ly_cay_da","Ly Cay Da (Vietnamese folk song)","Lý cây đa (dân ca quan họ Bắc Ninh)","Dân ca quan họ Bắc Ninh",18,"RH",
  "R C4  D4 D4:0.5 C4:0.25 D4:0.25  E4 D4:0.5 C4:0.25 D4:0.25  E4:0.5 E4:0.25 D4:0.25 C4:0.5 D4:0.5  C4:0.5 C4:0.5 D4:0.5 C4:0.25 D4:0.25  "
  "E4:0.5 E4:0.25 D4:0.25 C4:0.5 D4:0.5  C4:0.5 C4:0.5 D4:0.5 C4:0.25 D4:0.25  E4:0.5 E4:0.25 D4:0.25 C4:0.5 D4:0.5  C4:2  C4 R",
  [0,3,5,7],ts="2/4",arr=FOLK),
 # Tuần 9 (v5: sau bài nhịp 2/4) — Rê Mi Sol La (giọng La ngũ cung, bản gốc): bàn tay "thế Đô nhích lên" Rê1 Mi2 (Fa3) Sol4 La5 — Sol–La = 4-5.
 song("inh_la_oi","Inh La Oi (Vietnamese folk song)","Inh lả ơi (dân ca Thái Tây Bắc)","Dân ca Thái (Tây Bắc)",9,"RH",
  "mf A4/5 E4:0.5/2 G4:0.5/4  A4:2/5  G4/4 E4/2  D4:2/1  A4/5 E4/2  D4/1 E4/2  A4/5 A4:0.5/5 G4:0.5/4  E4/2 G4/4  "
  "D4/1 E4/2  A4/5 E4/2  G4/4 G4:0.5/4 E4:0.5/2  D4:2/1  p A4/5 E4:0.5/2 G4:0.5/4  A4:2/5  G4/4 G4:0.5/4 E4:0.5/2  G4:2/4",[0,4,8,12],
  pos="free",ts="2/4",arr=FOLK),
 # Tuần 9 (v5: sau bài nhịp 2/4) — Fa trưởng ngũ cung (Đô Rê Fa Sol La, không có Si♭): bàn tay ngũ cung Đô1 Rê2 Fa3 Sol4 La5. Lấy đà một phách (Đô).
 song("xoe_hoa","Xoe Hoa (Vietnamese folk song)","Xòe hoa (dân ca Thái)","Dân ca Thái",9,"RH",fingered(
  "mf R:1.5 C4:0.5  F4 A4  G4 G4:0.5 G4:0.5  A4 D4:0.5 F4:0.5  F4 G4:0.5 A4:0.5  G4:0.5 F4:0.5 D4:0.5 C4:0.5  C4 G4:0.5 A4:0.5  "
  "D4:0.5 F4:0.5 G4:0.5 F4:0.5  D4 G4:0.5 A4:0.5  G4:0.5 F4:0.5 D4:0.5 C4:0.5  F4:2",PENTA_F),
  [0,5],pos="free",ts="2/4",arr=FOLK),
]
# ---- v5 (OWNER duyệt 2026-10-05): bài TỰ SÁNG TÁC mới cho tuần củng cố — cùng kỹ năng của tuần, 4–8 ô nhịp
S += [
 # Tuần 2 — chỉ Đô Rê Mi, nốt đen/trắng (thay "Lý cây đa" — móc kép, dời sang tuần 18)
 song("three_chicks","Three Little Chicks","Ba chú gà con",ORIG,2,"RH",
  "C4 D4 E4:2  E4 D4 C4:2  C4 C4 D4 D4  E4:4  E4 D4 C4 D4  E4 E4 D4:2  D4 E4 D4 C4  C4:4",[0,4],arr=ORIG),
 # Tuần 5 (củng cố thế Đô, chưa có p/f): nhảy quãng 3 · móc đơn "Chạy-chạy" · nốt dài & dấu lặng
 song("frog_hop","Little Frog Hops","Ếch con nhảy",ORIG,5,"RH",
  "C4 E4 G4:2  G4 E4 C4:2  D4 F4 E4 D4  C4:4  C4 E4 G4 E4  F4 D4 E4 C4  D4 E4 F4 D4  C4:4",[0,4],arr=ORIG),
 song("raindrops","Raindrops","Mưa rơi tí tách",ORIG,5,"RH",
  "G4:0.5 G4:0.5 F4:0.5 F4:0.5 E4 E4  D4:0.5 D4:0.5 E4:0.5 E4:0.5 C4:2  E4 F4 G4 R  G4:0.5 F4:0.5 E4:0.5 D4:0.5 C4:2  "
  "C4:0.5 C4:0.5 D4:0.5 D4:0.5 E4 E4  F4:0.5 F4:0.5 E4:0.5 E4:0.5 D4:2  G4 F4 E4 D4  C4:4",[0,2,4,6],arr=ORIG),
 song("paper_boat","Paper Boat","Thuyền giấy",ORIG,5,"RH",
  "C4 D4 E4 F4  G4:2 G4:2  F4 E4 D4 E4  C4:2 R:2  E4 F4 G4 E4  F4 D4 E4 C4  D4:2 E4:2  C4:4",[0,4],arr=ORIG),
 # Tuần 9 — nhịp 2/4 (mỗi ô 2 phách)
 song("school_drum","School Drum","Trống trường",ORIG,9,"RH",
  "mf C4 C4  G4:2  E4 E4  G4:2  F4 E4  D4 C4  D4:0.5 D4:0.5 E4  C4:2",[0,4],ts="2/4",arr=ORIG),
 song("ferry_song","Ferry Song","Đò qua sông",ORIG,9,"RH",
  "p E4:0.5 F4:0.5 G4  E4:0.5 D4:0.5 C4  D4 E4  D4:2  E4:0.5 F4:0.5 G4  A4 G4  F4:0.5 E4:0.5 D4  C4:2",[0,4],"A4",ts="2/4",arr=ORIG),
]
# ---------------------------------------------------------------- CẤP 2 (tuần 11–21): hai tay, thế mới, phím đen, nhịp
S += [
 # Tuần 11 — Đô giữa tay trái, khuông Fa, hai tay luân phiên
 song("au_clair_mc_lh","Au clair de la lune (middle C, left hand)","Dưới ánh trăng — Đô giữa tay trái","Dân ca Pháp (traditional)",11,"LH",
  "F3 F3 F3 G3  A3:2 G3:2  F3 A3 G3 G3  F3:4  F3 F3 F3 G3  A3:2 G3:2  F3 A3 G3 G3  F3:4",[0,4],pos="MC"),
 song("mary_mc_lh","Mary Had a Little Lamb (middle C, left hand)","Chú cừu nhỏ — Đô giữa tay trái","Dân ca Mỹ (traditional)",11,"LH",
  "A3 G3 F3 G3  A3 A3 A3:2  G3 G3 G3:2  A3 C4 C4:2  A3 G3 F3 G3  A3 A3 A3 A3  G3 G3 A3 G3  F3:4",[0,4],pos="MC"),
 song("question_answer","Question and Answer","Hỏi – Đáp (hai tay luân phiên)",ORIG,11,"BOTH",
  "f C4 D4 E4 F4  G4:2 E4:2  R:4  R:4  G4 F4 E4 D4  E4:2 C4:2  R:4  R:4",[0,4],
  lh="p R:4  R:4  C4 B3 A3 G3  F3:4  R:4  R:4  G3 A3 B3 G3  C4:4",lhpos="MC",arr=ORIG),
 # Tuần 12 — hai tay cùng lúc (tay trái giữ nốt dài)
 song("hot_cross_buns_both","Hot Cross Buns (hands together)","Bánh nóng — hai tay","Dân ca Anh (traditional)",12,"BOTH",
  "E4 D4 C4:2  E4 D4 C4:2  C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5  E4 D4 C4:2",[0,2],
  lh="C3:4  C3:4  G3:4  C3:4"),
 song("ode_to_joy_both","Ode to Joy (hands together)","Bài ca niềm vui — hai tay","Ludwig van Beethoven",12,"BOTH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2",[0,4],
  lh="C3:4  G3:4  C3:4  G3:4  C3:4  G3:4  C3:4  G3:2 C3:2"),
 # Tuần 12 — kiểu đàn NGẮT: bài tự sáng tác (thay "Chú cừu — hai tay", OWNER duyệt 2026-10-05)
 song("robot_march","Robot March","Rô-bốt đi đều",ORIG,12,"RH",
  "f C4' E4' G4' E4'  C4' E4' G4:2  D4' F4' D4' F4'  E4' D4' C4:2  p G4' G4' E4' E4'  F4' F4' D4:2  f E4' F4' G4' F4'  E4' D4' C4' R",[0,4],arr=ORIG),
 # Tuần 14 — thế Sol
 song("ode_to_joy_g","Ode to Joy (G position)","Bài ca niềm vui — thế Sol","Ludwig van Beethoven",14,"RH",
  "B4 B4 C5 D5  D5 C5 B4 A4  G4 G4 A4 B4  B4 A4 A4:2  B4 B4 C5 D5  D5 C5 B4 A4  G4 G4 A4 B4  A4 G4 G4:2",[0,4],pos="G"),
 song("lightly_row_g","Lightly Row (G position)","Chèo thuyền nhẹ — thế Sol","Dân ca Đức (traditional)",14,"RH",
  "mf D5 B4 B4:2  C5 A4 A4:2  (G4 A4 B4 C5)  D5 D5 D5:2  D5 B4 B4:2  C5 A4 A4:2  G4 B4 D5 D5  G4:4",[0,4],pos="G"),
 song("aunt_rhody_g","Go Tell Aunt Rhody (G position)","Đi báo cô Rhody — thế Sol","Dân ca Mỹ (traditional)",14,"RH",
  "B4:2 B4 A4  G4:2 G4:2  A4:2 A4 C5  B4 A4 G4:2  D5:2 D5 C5  B4:2 B4:2  A4 G4 A4 B4  G4:4",[0,4],pos="G"),
 song("hot_cross_buns_g_lh","Hot Cross Buns (G position, left hand)","Bánh nóng — thế Sol tay trái","Dân ca Anh (traditional)",14,"LH",
  "f B2 A2 G2:2  p B2 A2 G2:2  mf G2:0.5 G2:0.5 G2:0.5 G2:0.5 A2:0.5 A2:0.5 A2:0.5 A2:0.5  f B2 A2 G2:2",[0,2],pos="G"),
 # Tuần 15 — nhịp 3/4
 song("waltz_cat","Little Cat Waltz","Điệu valse con mèo",ORIG,15,"RH",
  "mf C4 E4 G4  G4:3  F4 D4 F4  F4:3  E4 C4 E4  G4 F4 E4  D4 E4 D4  C4:3",[0,4],ts="3/4",arr=ORIG),
 song("waltz_rain","Rain Waltz","Điệu valse mưa rơi",ORIG,15,"RH",
  "p (G4 E4 C4  D4:3)  (E4 F4 G4  E4:3)  (G4 E4 C4  D4:2 E4)  (D4 C4 D4  C4:3)",[0,4],ts="3/4",arr=ORIG),
 song("birthday_both","Good Morning to All (Happy Birthday melody)","Chúc mừng sinh nhật","Mildred & Patty Hill (1893)",15,"BOTH",
  # Nhịp lấy đà: "Hap-py" ở phách 3 (ô 1 bắt đầu bằng 2 phách lặng) → "BIRTH" rơi đúng phách mạnh.
  # Câu 1 trọn tay trái; các câu sau mỗi tay một cụm liền (không đổi tay giữa cụm).
  "mf R:3  R:3  R:3  R:2 D4  C4:2 R  G4 E4 R  R:2 F4:0.5 F4:0.5  E4 C4 D4  C4:2 R",[0,5],
  lh="mf R:2 G3:0.5 G3:0.5  A3 G3 C4  B3:2 G3:0.5 G3:0.5  A3 G3 R  R:2 G3:0.5 G3:0.5  R:2 C4  B3 A3 R  R:3  R:3",lhpos="MC",ts="3/4"),
 # Tuần 16 — phím đen: thế Rê (Fa thăng), Đô thứ (Mi giáng)
 song("ode_to_joy_d","Ode to Joy (D position)","Bài ca niềm vui — thế Rê (Fa♯)","Ludwig van Beethoven",16,"RH",
  "mf F#4 F#4 G4 A4  A4 G4 F#4 E4  D4 D4 E4 F#4  F#4 E4 E4:2  F#4 F#4 G4 A4  A4 G4 F#4 E4  D4 D4 E4 F#4  E4 D4 D4:2",[0,4],pos="D"),
 song("frere_jacques_minor","Frère Jacques (minor)","Kìa con bướm vàng — giọng thứ (Mi♭)","Dân ca Pháp (traditional)",16,"RH",
  # Câu 3 "G Ab G F": tay dịch lên một phím (ngón 4 Sol, ngón 5 La♭); câu cuối ngón cái duỗi xuống Sol trầm (G3)
  "p C4/1 D4/2 Eb4/3 C4/1  C4/1 D4/2 Eb4/3 C4/1  Eb4/3 F4/4 G4:2/5  Eb4/3 F4/4 G4:2/5  "
  "G4:0.5/4 Ab4:0.5/5 G4:0.5/4 F4:0.5/3 Eb4/2 C4/1  G4:0.5/4 Ab4:0.5/5 G4:0.5/4 F4:0.5/3 Eb4/2 C4/1  "
  "C4/2 G3/1 C4:2/2  C4/2 G3/1 C4:2/2",[0,2,4,6],pos="free"),
 # Tuần 16 — bài tự sáng tác ở thế Rê (thay "Chú cừu — thế Rê"): nhảy Rê–Fa♯–La, đàn TO
 song("superhero_fly","Superhero Takes Off","Siêu nhân bay",ORIG,16,"RH",
  "f D4 F#4 A4:2  A4 G4 F#4 E4  D4 F#4 A4:2  A4:4  mf G4 E4 G4 E4  F#4 D4 F#4 D4  f E4 F#4 G4 E4  D4 A4 D4:2",[0,4],pos="D",arr=ORIG),
 # Tuần 17 — nốt đen chấm dôi "Đi-chấm chạy" (móc đơn đã học từ tuần 4)
 song("ode_to_joy_original","Ode to Joy (original rhythm)","Bài ca niềm vui — nhịp chấm dôi","Ludwig van Beethoven",17,"RH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4:1.5 D4:0.5 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4:1.5 C4:0.5 C4:2",[0,4]),
 # Dân ca (thay "Cầu London — chấm dôi", bài lặp): Bắc kim thang — hạ một cung xuống Fa trưởng ngũ cung (Đô Rê Fa Sol La,
 # toàn phím trắng), bàn tay ngũ cung Đô1 Rê2 Fa3 Sol4 La5 (như "Xòe hoa"). Nhịp chấm dôi "Đi-chấm chạy" ở ô 1, 3, 5, 7, 9; dấu luyến theo bản ký âm gốc.
 song("bac_kim_thang","Bac Kim Thang (Vietnamese folk song)","Bắc kim thang (dân ca Nam Bộ)","Dân ca Nam Bộ",19,"RH",fingered(
  "mf R A4:0.5 G4:0.5  F4:0.75 C4:0.25 F4:0.5 (G4:0.25 F4:0.25)  D4 D4:0.5 F4:0.5  C4:0.75 C4:0.25 C4:0.5 F4:0.5  D4 A4:0.5 A4:0.5  "
  "C4:0.75 D4:0.25 C4:0.5 D4:0.5  A4 A4:0.5 A4:0.5  A4:0.75 A4:0.25 D4:0.5 (D4:0.25 F4:0.25)  G4 G4:0.5 G4:0.5  "
  "G4:0.75 A4:0.25 A4:0.5 (D4:0.25 F4:0.25)  C4 F4:0.5 C4:0.5  D4:0.5 (D4:0.25 F4:0.25) C4:0.5 A4:0.5  F4:0.5 C4:0.5 F4:0.5 R:0.5",PENTA_F),
  [0,6],pos="free",ts="2/4",arr=FOLK),
 song("twinkle_run","Twinkle variation (running)","Ngôi sao nhỏ — biến tấu Chạy-chạy","Dân ca Pháp (traditional)",17,"RH",
  "mf C4:0.5 C4:0.5 C4:0.5 C4:0.5 G4:0.5 G4:0.5 G4:0.5 G4:0.5  A4:0.5 A4:0.5 A4:0.5 A4:0.5 G4:2  F4:0.5 F4:0.5 F4:0.5 F4:0.5 E4:0.5 E4:0.5 E4:0.5 E4:0.5  D4:0.5 D4:0.5 D4:0.5 D4:0.5 C4:2",[0,2],"A4"),
 # Tuần 13 (v5, củng cố hai tay): tay trái giữ nốt dài / đi nốt trắng; ngắt – liền; p – f
 song("bell_tower","Bell Tower","Tháp chuông",ORIG,13,"BOTH",
  "mf E4 D4 C4:2  E4 D4 C4:2  G4 F4 E4 D4  E4:4  p E4 D4 C4:2  E4 D4 C4:2  G4 F4 E4 D4  C4:4",[0,4],
  lh="C3:4  C3:4  G3:4  C3:4  C3:4  C3:4  G3:4  C3:4",arr=ORIG),
 song("two_friends","Two Friends","Đôi bạn",ORIG,13,"BOTH",
  "mf C4 E4 G4:2  F4 D4 E4:2  E4 F4 G4 E4  D4:4  C4 E4 G4:2  F4 D4 E4:2  D4 E4 F4 D4  C4:4",[0,4],
  lh="C3:2 E3:2  D3:2 C3:2  C3:2 E3:2  G3:4  C3:2 E3:2  D3:2 C3:2  G3:2 F3:2  C3:4",arr=ORIG),
 song("echo_valley","Echo Valley","Thung lũng tiếng vọng",ORIG,13,"BOTH",
  "f (C4 D4 E4 F4)  G4:2 G4:2  p (C4 D4 E4 F4)  G4:2 G4:2  f G4' F4' E4' D4'  C4:4  p G4' F4' E4' D4'  C4:4",[0,4],
  lh="C3:4  C3:4  C3:4  C3:4  G3:4  C3:4  G3:4  C3:4",arr=ORIG),
 # Tuần 18 (v5, móc kép): "Chạy-chạy-chạy-chạy", "Chạy chạy-chạy" · tuần 19 (v5.1, tách từ tuần 18): nghịch phách "Chạy-Đi-chạy"
 song("rabbit_run","Running Rabbit","Thỏ con chạy",ORIG,18,"RH",
  "mf C4:0.25 D4:0.25 E4:0.25 F4:0.25 G4 G4:2  F4:0.25 E4:0.25 D4:0.25 C4:0.25 D4 D4:2  "
  "E4:0.5 E4:0.25 F4:0.25 G4 E4:0.5 D4:0.5 C4  D4:0.5 D4:0.25 E4:0.25 D4 C4:2",[0,2],arr=ORIG),
 song("cyclo_ride","Cyclo Ride","Xích lô dạo phố",ORIG,19,"RH",
  "mf C4:0.5 E4 E4:0.5 G4:2  F4:0.5 D4 D4:0.5 E4:2  E4:0.5 G4 G4:0.5 F4 E4  D4:0.5 E4 D4:0.5 C4:2",[0,2],arr=ORIG),
 # Tuần 20 (v5.1: tuần 19 cũ) — gam Đô trưởng, luồn ngón cái
 song("scale_c_rh","C major scale (right hand)","Gam Đô trưởng — tay phải","Bài tập (traditional)",20,"RH",
  "mf (C4/1 D4/2 E4/3 F4/1  G4/2 A4/3 B4/4 C5/5)  (C5/5 B4/4 A4/3 G4/2  F4/1 E4/3 D4/2 C4/1)",[0,2],pos="free",arr=ORIG),
 song("scale_c_lh","C major scale (left hand)","Gam Đô trưởng — tay trái","Bài tập (traditional)",20,"LH",
  "mf (C3/5 D3/4 E3/3 F3/2  G3/1 A3/3 B3/2 C4/1)  (C4/1 B3/2 A3/3 G3/1  F3/2 E3/3 D3/4 C3/5)",[0,2],pos="free",arr=ORIG),
 song("joy_to_the_world","Joy to the World","Niềm vui cho thế giới","Lowell Mason (1839), theo G. F. Handel",20,"RH",
  "f C5:2/5 B4:1.5/4 A4:0.5/3  G4:3/2 F4/1  E4:2/3 D4:2/2  C4:4/1  C5:2/5 B4:1.5/4 A4:0.5/3  G4:3/2 F4/1  E4:2/3 D4:2/2  C4:4/1",[0,4],pos="free"),
]
# ---------------------------------------------------------------- CẤP 3 (tuần 22–31; v5.1: +1 sau khi tách tuần 18): hợp âm, vạch phụ, đổi thế, nốt cao, cổ điển
I = "C3+E3+G3"; IV = "C3+F3"; V = "D3+G3"
S += [
 # Tuần 22 — hợp âm tay trái
 song("twinkle_both","Twinkle Twinkle (hands together, chords)","Ngôi sao nhỏ — hai tay hợp âm","Dân ca Pháp (traditional)",22,"BOTH",
  "mf C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2  G4 G4 F4 F4  E4 E4 D4:2  G4 G4 F4 F4  E4 E4 D4:2  p C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2",[0,4,8],"A4",
  lh=f"{I}:4  {IV}:2 {I}:2  {IV}:2 {I}:2  {V}:2 {I}:2  {I}:2 {IV}:2  {I}:2 {V}:2  {I}:2 {IV}:2  {I}:2 {V}:2  {I}:4  {IV}:2 {I}:2  {IV}:2 {I}:2  {V}:2 {I}:2"),
 song("ode_to_joy_chords","Ode to Joy (hands together, chords)","Bài ca niềm vui — hai tay hợp âm","Ludwig van Beethoven",22,"BOTH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2",[0,4],
  lh=f"{I}:4  {V}:4  {I}:4  {V}:4  {I}:4  {V}:4  {I}:4  {V}:2 {I}:2"),
 song("jingle_bells_both","Jingle Bells (hands together)","Chuông ngân vang — hai tay","James Lord Pierpont (1857)",22,"BOTH",
  "f E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  E4 D4 D4 E4  D4:2 G4:2  E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  G4 G4 F4 D4  C4:4",[0,4,8,12],
  lh=f"{I}:4  {I}:4  {I}:4  {I}:4  {IV}:4  {I}:4  {V}:4  {V}:4  {I}:4  {I}:4  {I}:4  {I}:4  {IV}:4  {I}:4  {V}:4  {I}:4"),
 # Tuần 23 (v5, Cầu Vạch Phụ): khuông lớn hai tay luân phiên · thế La thứ trên dòng kẻ phụ · hai tay hợp âm I – V
 song("grand_duet","Grand Staff Duet","Song ca hai khóa",ORIG,23,"BOTH",
  "mf E4 G4 F4 D4  E4:2 C4:2  R:4  R:4  p G4 F4 E4 D4  E4:2 D4:2  R:4  R:4",[0,4],
  lh="R:4  R:4  A3 B3 C4 A3  G3:4  R:4  R:4  F3 A3 G3 B3  C4:4",lhpos="MC",arr=ORIG),
 song("stepping_stones","Stepping Stones","Bước qua vạch phụ",ORIG,23,"RH",
  "mf C4 B3 A3 B3  C4 D4 E4:2  D4 C4 B3 C4  A3:4  p E4 D4 C4 B3  A3 B3 C4:2  D4 C4 B3 B3  A3:4",[0,4],pos="Am",arr=ORIG),
 song("lantern_parade","Lantern Parade","Rước đèn",ORIG,23,"BOTH",
  "f G4 E4 G4 E4  F4 D4 F4:2  E4 C4 E4 D4  C4:4  p G4 E4 G4 E4  F4 D4 F4:2  E4 D4 E4 D4  C4:4",[0,4],
  lh=f"{I}:4  {V}:4  {I}:2 {V}:2  {I}:4  {I}:4  {V}:4  {I}:2 {V}:2  {I}:4",arr=ORIG),
 # Tuần 24 — đổi thế tay
 song("silent_night","Silent Night","Đêm thánh vô cùng","Franz Xaver Gruber (1818)",24,"RH",
  # Đổi thế (luôn ở nốt dài): thế Mi (E1 G2 A3 B4 C5) → thế Sol (G1…D5) → thế Mi → thế Si (B1 C2 D3 E4 F5)
  # → "sleep in heavenly peace": thế Sol, ngón 3 vắt qua xuống Mi (như gam đi xuống) → thế Đô, kết ở Đô.
  "p (G4:1.5/2 A4:0.5/3 G4/2)  E4:3/1  (G4:1.5/2 A4:0.5/3 G4/2)  E4:3/1  D5:2/5 D5/5  B4:3/3  C5:2/4 C5/4  G4:3/1  "
  "mf A4:2/3 A4/3  C5:1.5/5 B4:0.5/4 A4/3  G4:1.5/2 A4:0.5/3 G4/2  E4:3/1  A4:2/3 A4/3  C5:1.5/5 B4:0.5/4 A4/3  G4:1.5/2 A4:0.5/3 G4/2  E4:3/1  "
  "p D5:2/3 D5/3  F5:1.5/5 D5:0.5/3 B4/1  C5:3/2  E5:3/4  C5:1.5/4 G4:0.5/1 E4/3  G4:1.5/5 F4:0.5/4 D4/2  C4:3/1",[0,4,8,12,16,20],pos="free",ts="3/4"),
 # Tuần 24 — dân ca: Lý ngựa ô — 2026-10-06: thay bản 12 ô cũ bằng BẢN ĐẦY ĐỦ của SGK (xem phần "Bài Việt Nam bổ sung" bên dưới).
 # Tuần 25 — trưởng & thứ: bài tự sáng tác giọng La thứ (thay "Bài ca niềm vui — La thứ"): NHỎ, NGẮT, ô cuối TO
 song("ninja_tiptoe","Tiptoe Ninja","Ninja rón rén",ORIG,25,"RH",
  "p A3' A3' C4' A3'  B3' B3' D4' B3'  A3' C4' E4' C4'  B3:2 R:2  A3' A3' C4' A3'  B3' D4' C4' B3'  "
  "C4:0.5' B3:0.5' A3:0.5' B3:0.5' C4' D4'  f E4' R A3' R",[0,4],pos="Am",arr=ORIG),
 # Tuần 26 — đọc nốt cao: bài tự sáng tác ở thế Đô cao (Đô5–Sol5), LIỀN và NHỎ
 song("drifting_boat","Drifting Boat","Thuyền trôi",ORIG,26,"RH",
  "p (E5:2 D5  C5:2 D5  E5 F5 G5  E5:3)  mf (G5:2 F5  E5:2 D5  p F5 E5 D5  C5:3)",[0,4],pos="C5",ts="3/4",arr=ORIG),
 # Tuần 29 — Minuet (sắc thái/kiểu đàn theo cách đàn phổ biến — bản gốc không ghi)
 song("minuet_g","Minuet in G (BWV Anh. 114)","Minuet Sol trưởng","Christian Petzold (khoảng 1725)",29,"RH",
  "mf D5/5 (G4:0.5/1 A4:0.5/2 B4:0.5/3 C5:0.5/4)  D5/5 G4/1' G4/1'  E5/3 (C5:0.5/1 D5:0.5/2 E5:0.5/3 F#5:0.5/4)  G5/5 G4/1' G4/1'  C5/4 (D5:0.5/5 C5:0.5/4 B4:0.5/3 A4:0.5/2)  B4/3 (C5:0.5/4 B4:0.5/3 A4:0.5/2 G4:0.5/1)  F#4/1 (G4:0.5/2 A4:0.5/3 B4:0.5/4 G4:0.5/2)  A4:3/3",[0,4],pos="free",ts="3/4"),
 # Tuần 30 — Für Elise
 song("fur_elise","Für Elise (opening)","Für Elise (đoạn mở đầu)","Ludwig van Beethoven (1810)",30,"RH",
  # Mỗi ô 3/4 = một ô 3/8 của bản gốc (móc kép = nửa phách). "Mi–Rê♯" là nhịp lấy đà (phách 3 của ô 0).
  "p R:2 E5:0.5/5 D#5:0.5/4  E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3  A4/1 R:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/4  "
  "B4/5 R:0.5 E4:0.5/1 G#4:0.5/3 B4:0.5/4  C5/5 R:0.5 E4:0.5/1 E5:0.5/5 D#5:0.5/4  "
  "E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3  A4/1 R:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/4  "
  "B4/5 R:0.5 E4:0.5/1 C5:0.5/5 B4:0.5/4  A4:2/3 R",[0,5],pos="free",ts="3/4"),
 # Tuần 27 — Canon (hai tay, đọc hai khóa)
 song("canon","Canon in D (theme, simplified in C)","Khúc Canon (giản lược)","Johann Pachelbel (khoảng 1680)",27,"BOTH",
  # Tay phải: ngón cái ở La suốt bài (La1 Si2 Đô3 Rê4 Mi5); Sol bằng ngón 3 VẮT qua ngón cái rồi ngón cái luồn về La (như gam).
  # Tay trái: thế Đô mở rộng Đô3–La3 (Đô5 Mi4 Fa3 Sol2 La1) — không nhảy ngón cái.
  "p E5:2/5 D5:2/4  C5:2/3 B4:2/2  A4:2/1 G4:2/3  A4:2/1 B4:2/2  E5:2/5 D5:2/4  C5:2/3 B4:2/2  A4:2/1 G4:2/3  A4:2/1 G4:2/3",[0,4],pos="free",
  lh="p C3:2/5 G3:2/2  A3:2/1 E3:2/4  F3:2/3 C3:2/5  F3:2/3 G3:2/2  C3:2/5 G3:2/2  A3:2/1 E3:2/4  F3:2/3 C3:2/5  F3:2/3 C3:2/5",lhpos="free"),
 # Tuần 27 — dân ca hai khóa: Lý cây bông (La ngũ cung, giọng gốc Sol3–Đô5, tầm quãng 11 — quá một thế tay).
 # Chia theo âm vực, hai tay LUÂN PHIÊN (không đánh cùng lúc): Mi4 trở lên tay phải "thế Mi" (Mi1 Sol2 La3 Đô5 — như
 # "Đêm thánh vô cùng"), Rê4 trở xuống tay trái thế Sol giữa (Sol3=5 La3=4 Đô4=2 Rê4=1). Mỗi ngón chỉ một phím.
 song("ly_cay_bong","Ly Cay Bong (Vietnamese folk song)","Lý cây bông (dân ca Nam Bộ)","Dân ca Nam Bộ",27,"BOTH",
  "mf R A4:0.5/3 G4:0.5/2  A4/3 A4:0.5/3 G4:0.25/2 A4:0.25/3  C5:0.5/5 E4:0.5/1 G4:0.5/2 E4:0.5/1  G4/2 A4:0.25/3 G4:0.25/2 E4:0.25/1 G4:0.25/2  A4:1.5/3 A4:0.5/3  "
  "A4:0.5/3 G4:0.5/2 R:0.5 G4:0.5/2  E4:0.75/1 G4:0.25/2 A4:0.25/3 G4:0.25/2 E4:0.25/1 G4:0.25/2  A4:1.5/3 R:0.5  "
  "p E4:0.75/1 G4:0.25/2 E4:0.25/1 R:0.25 R:0.5  R:2  R R:0.5 R:0.25 E4:0.25/1  R:2  E4:0.75/1 G4:0.25/2 E4:0.5/1 R:0.5  R:2  R R:0.5 R:0.25 E4:0.25/1  R:2",
  [0,8],pos="free",
  lh="R:2  R:2  R:2  R:2  R:2  R C4:0.5/2 R:0.5  R:2  R R:0.5 D4:0.5/1  "
  "R R:0.25 D4:0.25/1 C4:0.5/2  A3:2/4  C4:0.5/2 G3:0.5/5 A3:0.25/4 C4:0.25/2 D4:0.25/1 R:0.25  D4:1.5/1 D4:0.5/1  R R:0.5 D4:0.25/1 C4:0.25/2  A3:2/4  "
  "C4:0.5/2 G3:0.5/5 A3:0.25/4 C4:0.25/2 D4:0.25/1 R:0.25  D4:2/1",lhpos="free",ts="2/4",arr=FOLK),
 # Tuần 28 — bài hai tay
 song("saints_both","When the Saints (hands together)","Các thánh tiến bước — hai tay","Spiritual (traditional)",28,"BOTH",
  "f R C4 E4 F4  G4:4  R C4 E4 F4  G4:4  R C4 E4 F4  G4:2 E4:2  C4:2 E4:2  D4:4  R E4 E4 D4  C4:3 C4  E4:2 G4 G4  F4:4  E4 F4 G4:2  E4:2 C4:2  D4:4  C4:4",[0,4,8,12],
  lh=f"{I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {V}:4  {I}:4  {I}:4  {IV}:4  {IV}:4  {I}:4  {I}:4  {V}:4  {I}:4"),
 song("oh_susanna_both","Oh! Susanna (hands together)","Ô Susanna — hai tay","Stephen Foster (1848)",28,"BOTH",
  "mf C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 C4 D4:2  C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 D4 C4:2",[0,4],"A4",
  lh=f"{I}:4  {I}:4  {I}:4  {V}:4  {I}:4  {I}:4  {I}:4  {V}:2 {I}:2"),
]

# ---------------------------------------------------------------- BÀI VIỆT NAM BỔ SUNG (OWNER 2026-10-06)
# 10 dân ca + 3 ca khúc PUBLIC DOMAIN (nhạc sĩ mất trước 1946 — Luật SHTT Điều 27, 43). Giai điệu chép ĐÚNG TỪNG NỐT từ
# tư liệu nghiên cứu (mỗi bài ≥ 2 bản ký âm độc lập; SGK Âm nhạc là một nguồn): "|" = vạch nhịp, ô 0 = nhịp lấy đà (có thể
# rỗng), dấu "~" = dây nối. Chỉ được: dịch giọng (transpose), đổi quãng tám một nốt đã ghi trong tư liệu (octave), mở dấu
# nhắc lại (order). Dây nối qua vạch nhịp → đàn lại nốt (app chưa có dây nối; như "Lý cây đa").
# Đối chiếu tự động: tests/folk-songs.test.ts ("đúng từng nốt").
# Cách chia tay: theo âm vực — mỗi bàn tay một thế 5 ngón cố định (mỗi ngón MỘT phím, tầm ≤ quãng 6); hai tay LUÂN PHIÊN,
# không bao giờ đánh cùng lúc (như "Lý cây bông"). Thế tay chỉ đổi ở ĐẦU CÂU (ô trong `phrases`), khi tay đó đang nghỉ / nốt dài.
# hands: [(ô bắt đầu, {nốt: "R1" | "L2" …}), …] — bảng áp dụng từ ô đó tới bảng kế tiếp.
VN_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FOLK_T = FOLK + "; dịch giọng cho dễ đàn"
PD_ARR = "Bản giản lược cho trẻ học đàn — chỉ giai điệu (không có lời), chơi một lượt"

def _fmt(b):
    return f"{b:g}"

def _rest_pieces(s, e, per):
    """Dấu lặng từ phách s tới e: tách ở vạch nhịp, gọn theo phách (lẻ ¼ → ¼, lẻ ½ → ½, nguyên phách gộp)."""
    out = []
    while s < e - 1e-9:
        seg_e = min(e, (int(s // per + 1e-9) + 1) * per)
        while s < seg_e - 1e-9 and abs(s - round(s)) > 1e-9:
            q = round((s % 1) * 4)
            step = min(0.25 if q % 2 else 0.5, seg_e - s)
            out.append(step); s += step
        whole = int(seg_e - s + 1e-9)
        if whole: out.append(whole); s += whole
        while s < seg_e - 1e-9:
            step = 0.5 if seg_e - s >= 0.5 - 1e-9 else 0.25
            out.append(step); s += step
    return out

def vn_song(id, title, titleVi, composer, week, src, ts, hands, phrases, *, order=None, transpose=0, octave=None,
            dyn=None, slurs=(), arr=FOLK):
    per = int(ts.split("/")[0])
    raw = [[t for t in bar.split()] for bar in src.split("|")]
    if order is None: order = list(range(0 if raw[0] else 1, len(raw)))
    events = []   # (ô, phách bắt đầu, cao độ | "R", trường độ)
    t = 0
    for k, i in enumerate(order):
        bar = []
        for j, tok in enumerate(raw[i]):
            p, _, b = tok.rstrip("~").partition(":")
            b = num(b)
            if p != "R":
                q = midi(p) + transpose + (octave or {}).get(i, {}).get(j, 0)
                name = f"{VN_NAMES[q % 12]}{q // 12 - 1}"
                assert ("#" in name) == ("#" in p), (id, "dịch giọng sinh phím đen", p, name)
                p = name
            bar.append((p, b))
        L = sum(b for _, b in bar)
        if k == 0 and L < per: bar = [("R", per - L)] + bar           # nhịp lấy đà
        elif k == len(order) - 1 and L < per: bar += [("R", per - L)]  # ô cuối bù phần lấy đà
        assert sum(b for _, b in bar) == per, (id, "ô", i, bar)
        for p, b in bar:
            events.append((k, t, p, b)); t += b
    def finger_of(k, p):
        tab = [h for s, h in hands if s <= k][-1]
        return tab[p]
    # Luyến: (ô, nốt thứ i, ô, nốt thứ j) — đếm nốt có cao độ trong ô (sau khi thêm lặng lấy đà)
    nth = {}
    for idx, (k, _, p, _) in enumerate(events):
        if p != "R": nth[(k, sum(1 for e in events[:idx] if e[0] == k and e[2] != "R"))] = idx
    slur_at = {}
    for ka, ia, kb, ib in slurs:
        a, b = nth[(ka, ia)], nth[(kb, ib)]
        hs = {finger_of(events[x][0], events[x][2])[0] for x in range(a, b + 1) if events[x][2] != "R"}
        assert len(hs) == 1 and all(events[x][2] != "R" for x in range(a, b + 1)), (id, "luyến phải trọn một tay, không lặng", ka)
        slur_at[a] = "("; slur_at[b] = ")"
    dyn = dyn or {}
    voices = {"R": [], "L": []}
    last_dyn = {"R": None, "L": None}
    for idx, (k, s, p, b) in enumerate(events):
        if p == "R":
            for v in voices.values(): v.append(("R", s, b))
            continue
        hf = finger_of(k, p)
        h, f = hf[0], int(hf[1:])
        cur = [d for kk, d in sorted(dyn.items()) if kk <= k]
        cur = cur[-1] if cur else None
        tok = f"{p}:{_fmt(b)}/{f}"
        if idx in slur_at: tok = "(" + tok if slur_at[idx] == "(" else tok + ")"
        if cur and cur != last_dyn[h]:
            voices[h].append(("D", s, cur)); last_dyn[h] = cur
        voices[h].append(("N", s, tok))
        voices["L" if h == "R" else "R"].append(("R", s, b))
    def render(v):
        out, i = [], 0
        while i < len(v):
            if v[i][0] != "R":
                out.append(v[i][2]); i += 1; continue
            s0 = v[i][1]; e = s0
            while i < len(v) and v[i][0] == "R": e = v[i][1] + v[i][2]; i += 1
            out += [f"R:{_fmt(x)}" for x in _rest_pieces(s0, e, per)]
        return "  ".join(out)
    has_lh = any(x[0] == "N" for x in voices["L"])
    hand = "BOTH" if has_lh else "RH"
    return song(id, title, titleVi, composer, week, hand, render(voices["R"]), phrases, pos="free",
                lh=render(voices["L"]) if has_lh else None, lhpos="free", ts=ts, arr=arr)

S += [
 # Tuần 10 — Gà gáy (dân ca Cống, SGK Âm nhạc 1 KNTT + bản Lê Trần Thanh): Rê Mi Sol La Si — bàn tay NGŨ CUNG như "Xòe hoa",
 # nhích lên một cung: Rê1 Mi2 Sol3 La4 Si5 (Mi–Sol cách một phím bằng ngón 2-3). Một tay, không dời tay.
 vn_song("ga_gay", "Ga Gay (Vietnamese folk song)", "Gà gáy (dân ca Cống)", "Dân ca Cống", 10,
  " | A4:0.5 G4:0.5 B4:0.5 A4:0.5 | B4:0.5 A4:0.5 G4:0.5 E4:0.5 | G4:2 | G4:1 R:1 | G4:0.5 B4:0.5 B4:0.5 A4:0.5 | B4:0.5 A4:0.5 G4:0.5 E4:0.5 | D4:2 | D4:1 R:1 | B4:1 B4:0.5 A4:0.5 | G4:1 D4:0.5 E4:0.5 | G4:0.5 A4:0.5 G4:0.5 E4:0.5 | A4:2 | A4:1 R:1 | D4:1 D4:0.5 E4:0.5 | G4:0.5 A4:0.5 G4:0.5 E4:0.5 | G4:2 | G4:1 R:1",
  "2/4", [(0, {"D4": "R1", "E4": "R2", "G4": "R3", "A4": "R4", "B4": "R5"})], [0, 4, 8, 13],
  dyn={0: "f", 8: "mf", 13: "f"}),
 # Tuần 11 — Lý cây xanh (dân ca Nam Bộ, Trần Kiết Tường ký âm; 3 nguồn): Đô–Đô cao (quãng 8) → hai tay luân phiên:
 # tay phải "thế Mi" Mi1 Sol2 La3 Đô cao5 (như "Lý cây bông"), tay trái chỉ Rê (ngón cái) – Đô (ngón 2) ở ô 5–6.
 vn_song("ly_cay_xanh", "Ly Cay Xanh (Vietnamese folk song)", "Lý cây xanh (dân ca Nam Bộ)", "Dân ca Nam Bộ", 11,
  "A4:0.5 | G4:1 G4:1 | G4:1 R:0.5 E4:0.5 | C5:1 A4:1 | G4:1 R:0.5 G4:0.5 | E4:0.5 G4:0.5 E4:0.5 D4:0.5 | C4:1 R:0.5 G4:0.5 | C5:1 A4:1 | G4:1 R:0.5 A4:0.5 | G4:0.5 E4:0.5 G4:0.5 A4:0.5 | G4:1 R:0.5 A4:0.5 | G4:0.5 E4:0.5 G4:0.5 A4:0.5 | G4:2",
  "2/4", [(0, {"E4": "R1", "G4": "R2", "A4": "R3", "C5": "R5", "D4": "L1", "C4": "L2"})], [0, 5, 9],
  dyn={0: "mf", 11: "p"}),
 # Tuần 13 — Ngày mùa vui (giai điệu dân ca Thái; lời mới Hoàng Lân KHÔNG dùng; SGK Âm nhạc 2 CTST + Cánh Diều):
 # tay phải ngũ cung Sol1 La2 Si3 Rê cao4 Mi cao5, tay trái Mi (ngón cái) – Rê (ngón 2).
 vn_song("ngay_mua_vui", "Ngay Mua Vui (Vietnamese folk melody)", "Ngày mùa vui (giai điệu dân ca Thái)", "Dân ca Thái", 13,
  "A4:0.5 | A4:1 E5:0.5 E5:0.5 | D5:1 R:0.5 D5:0.5 | D5:1 E5:0.5 D5:0.5 | B4:1 R:0.5 A4:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | A4:1 B4:0.5 D5:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | E4:1 R:0.5 D4:0.5 | E4:0.5 D4:0.5 E4:0.5 G4:0.5 | A4:1 B4:0.5 D5:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | A4:1 R:0.5 D4:0.5 | E4:0.5 D4:0.5 E4:0.5 G4:0.5 | A4:1 B4:0.5 D5:0.5 | B4:0.5 A4:0.5 G4:0.5 A4:0.5 | A4:1 R:0.5",
  "2/4", [(0, {"G4": "R1", "A4": "R2", "B4": "R3", "D5": "R4", "E5": "R5", "E4": "L1", "D4": "L2"})], [0, 5, 9, 13],
  dyn={0: "f", 9: "mf", 13: "f"}),
 # Tuần 17 — Lý con sáo Gò Công (dân ca Nam Bộ, Văn Lưu sưu tầm – Trần Kiết Tường ký âm; vnguitar + SGK Cánh Diều + nốt chữ).
 # Câu 1–3 (ô 0–12): tay phải "thế Sol nhích lên" Sol1 Si2 Đô3 Rê4 Mi5 (ngón cái duỗi xuống Sol). Nghỉ một phách ở ô 12 →
 # câu 4–5: thế Sol Sol1 La2 Đô4; tay trái chỉ Rê (ngón cái).
 vn_song("ly_con_sao", "Ly Con Sao (Vietnamese folk song)", "Lý con sáo Gò Công (dân ca Nam Bộ)", "Dân ca Nam Bộ", 17,
  "G4:1 | G4:1 G4:1 | G4:0.5 C5:0.5 B4:0.5 D5:0.5 | C5:2 | D5:1.5 E5:0.5 | D5:1 C5:0.5 B4:0.5 | G4:1 G4:1 | G4:0.5 C5:0.5 C5:0.5 B4:0.5 | C5:2 | D5:1.5 E5:0.5 | D5:1 B4:1 | C5:1 D5:1 | G4:1 R:1 | G4:1 D4:1 | G4:1 D4:1 | D4:1 A4:0.5 C5:0.5 | G4:1 R:1 | G4:1 D4:1 | G4:1 D4:1 | D4:1 A4:0.5 C5:0.5 | G4:2",
  "2/4", [(0, {"G4": "R1", "B4": "R2", "C5": "R3", "D5": "R4", "E5": "R5"}),
          (13, {"G4": "R1", "A4": "R2", "C5": "R4", "D4": "L1"})], [0, 4, 9, 13, 17],
  dyn={0: "mf", 17: "p"}),
 # Tuần 17 — Xuân và tuổi trẻ: NHẠC La Hối (1920–1945; PD ở VN từ 1996, ở Mỹ không được phục hồi). Lời Thế Lữ còn bảo hộ → CHỈ giai điệu.
 # Hai bản ký âm (Đón Gió 1954 Rê trưởng hạ một cung = bản in hiện đại Đô trưởng). Valse 3/4, lấy đà 1 phách.
 # Bản giản lược: chơi MỘT LƯỢT không nhắc lại — đoạn A ô 1–12 rồi kết 2 (ô 17–20), điệp khúc ô 21–34 rồi kết 2 (ô 37–38).
 # Tay phải La1 Si2 Đô3 Rê4 Mi5 (La–Mi cao), tay trái Đô4–Sol4: Đô5 Rê4 Mi3 Sol1 (thế Đô tay trái, cao một quãng tám).
 vn_song("xuan_va_tuoi_tre", "Xuan va tuoi tre (Spring and Youth)", "Xuân và tuổi trẻ (nhạc La Hối)", "La Hối", 17,
  "G4:1 | E5:2 D5:1 | C5:1 E4:1 G4:1 | B4:3 | B4:1 R:1 A4:1 | C5:2 B4:1 | A4:1 C4:1 E4:1 | G4:3 | G4:1 R:1 E4:1 | D4:2 E4:1 | C4:1 E4:1 G4:1 | A4:3 | A4:1 R:1 A4:1 | C5:2 C5:1 | B4:1 G4:1 A4:1 | E4:3 | E4:1 R:1 G4:1 | C5:2 B4:1 | A4:1 G4:1 A4:1 | C5:3 | C5:1 R:1 C5:0.5 D5:0.5 | C5:2 B4:0.5 C5:0.5 | B4:1.5 A4:0.5 B4:1 | E4:3 | E4:1 R:1 A4:0.5 B4:0.5 | A4:2 G4:0.5 A4:0.5 | G4:1.5 C4:0.5 D4:1 | E4:3 | E4:1 R:1 D4:0.5 E4:0.5 | C4:2 D4:0.5 E4:0.5 | G4:1.5 E4:0.5 G4:1 | A4:3 | A4:1 R:1 A4:0.5 C5:0.5 | B4:2 A4:0.5 B4:0.5 | A4:1.5 G4:0.5 A4:1 | E5:3 | D5:1 R:1 C5:0.5 D5:0.5 | C5:3 | C5:2 R:1",
  "3/4", [(0, {"A4": "R1", "B4": "R2", "C5": "R3", "D5": "R4", "E5": "R5", "C4": "L5", "D4": "L4", "E4": "L3", "G4": "L1"})],
  [0, 5, 9, 13, 17, 21, 25, 29], order=list(range(0, 13)) + list(range(17, 35)) + [37, 38],
  dyn={0: "mf", 17: "f", 25: "mf"}, arr=PD_ARR),
 # Tuần 18 — Cò lả (dân ca đồng bằng Bắc Bộ; SGK Âm nhạc 4 Cánh Diều = SGK Âm nhạc 4 cũ, khớp từng nốt). Nhiều "Tập-tễnh".
 # Gốc Fa trưởng (Đô Fa Sol La Đô cao) → dịch xuống Đô trưởng (−5): Sol3 Đô Rê Mi Sol — tay phải THẾ ĐÔ (Đô1 Rê2 Mi3 Sol5),
 # tay trái chỉ Sol3 (ngón cái, thế Đô tay trái) ở ô 11 và 13.
 vn_song("co_la", "Co La (Vietnamese folk song)", "Cò lả (dân ca đồng bằng Bắc Bộ)", "Dân ca Bắc Bộ", 18,
  "C5:0.5 | G4:1 G4:0.5 C5:0.5 | G4:0.5 C5:0.5 G4:0.25 C5:0.25 A4:0.25 G4:0.25 | A4:1.5 A4:0.25 G4:0.25 | F4:1 F4:0.5 F4:0.25 G4:0.25 | C5:1.5 A4:0.25 G4:0.25 | A4:0.75 G4:0.25 A4:0.25 G4:0.25 A4:0.25 C5:0.25 | F4:1 F4:0.5 G4:0.25 C5:0.25 | A4:0.75 G4:0.25 A4:0.25 G4:0.25 A4:0.25 C5:0.25 | F4:1 G4:0.5 F4:0.5 | F4:1 G4:0.5 F4:0.5 | G4:0.75 A4:0.25 C4:0.5 F4:0.25 G4:0.25 | A4:0.75 G4:0.25 A4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:1 C4:0.5 F4:0.25 G4:0.25 | A4:0.75 G4:0.25 A4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:1 R:0.5",
  "2/4", [(0, {"C4": "R1", "D4": "R2", "E4": "R3", "G4": "R5", "G3": "L1"})], [0, 5, 9, 13], transpose=-5,
  dyn={0: "mf", 9: "p", 11: "mf"}, arr=FOLK_T),
 # Tuần 18 — Mưa rơi (dân ca Xá; Tô Ngọc Thanh ký âm — chỉ giai điệu; SGK Âm nhạc 6 KNTT + nốt chữ từ bản cũ). Tư liệu đã hạ
 # một cung (Rê → Đô). Tay phải Mi1 Fa2 Sol3 La4 Đô cao5, tay trái Đô giữa (ngón cái) – Sol3 (ngón 4) như thế Đô giữa tuần 11.
 # Hai dây nối qua vạch nhịp (ô 6→7, 17→18): đàn lại nốt.
 vn_song("mua_roi", "Mua Roi (Vietnamese folk song)", "Mưa rơi (dân ca Xá)", "Dân ca Xá", 18,
  "G4:0.5 | G4:0.5 G4:0.5 A4:0.5 C5:0.5 | A4:1 G4:0.5 E4:0.5 | G4:0.5 E4:0.25 G4:0.25 C4:0.5 R:0.5 | R:1.5 G3:0.5 | G3:0.5 C4:0.5 C4:0.5 E4:0.5 | E4:0.5 G4:0.5 F4:0.5 A4:0.5~ | A4:1 G4:0.5 E4:0.5 | G4:0.5 E4:0.25 G4:0.25 C4:0.5 R:0.5 | R:1.5 G4:0.5 | G4:0.5 G4:0.5 A4:0.5 C5:0.5 | E4:1 G4:0.25 A4:0.25 E4:0.25 G4:0.25 | A4:1 G4:0.25 A4:0.25 E4:0.25 G4:0.25 | C4:0.5 R:1 G3:0.5 | G3:0.5 C4:0.5 C4:0.5 E4:0.5 | E4:0.5 G4:0.5 G4:0.5 F4:0.5 | A4:1 G4:0.5 E4:0.5 | G4:0.5 G3:0.5 E4:0.5 C4:0.5~ | C4:1 R:1",
  "2/4", [(0, {"E4": "R1", "F4": "R2", "G4": "R3", "A4": "R4", "C5": "R5", "C4": "L1", "G3": "L4"})], [0, 4, 9, 13],
  dyn={0: "mf", 13: "p"}),
 # Tuần 20 — Trống cơm (dân ca quan họ Bắc Ninh; SGK Âm nhạc 5 CTST — Minh Châu sưu tầm & ký âm + SGK Âm nhạc 4 cũ).
 # Tầm Sol3–Mi cao (quãng 13) → 2 đoạn: ô 0–18 tay phải ngũ cung Rê1 Mi2 Sol3 La4 Si5, tay trái chỉ Đô giữa (ngón cái);
 # ô 19 (tay trái đàn Rê, tay phải có 1 phách để lên cao) – hết: tay phải ngũ cung Sol1 La2 Si3 Rê cao4 Mi cao5,
 # tay trái Sol3 5 · La3 4 · Si3 3 · Rê 2 · Mi 1.
 vn_song("trong_com", "Trong Com (Vietnamese folk song)", "Trống cơm (dân ca quan họ Bắc Ninh)", "Dân ca quan họ Bắc Ninh", 20,
  "D4:0.5 | D4:0.5 G4:0.5 G4:0.5 A4:0.25 G4:0.25 | D4:0.5 D4:0.5 D4:0.5 G4:0.5 | G4:0.5 G4:0.25 G4:0.25 D4:0.5 D4:0.25 C4:0.25 | D4:0.5 G4:0.25 G4:0.25 D4:0.5 D4:0.25 C4:0.25 | D4:1 R:0.5 G4:0.5 | G4:0.75 A4:0.25 G4:0.5 A4:0.5 | B4:1 R:0.5 G4:0.5 | G4:0.75 A4:0.25 G4:0.5 A4:0.5 | B4:0.5 B4:0.25 B4:0.25 D4:0.75 E4:0.25 | D4:0.75 E4:0.25 D4:0.25 E4:0.25 D4:0.25 E4:0.25 | G4:0.5 G4:0.25 G4:0.25 E4:0.25 D4:0.25 E4:0.25 G4:0.25 | D4:0.5 E4:0.5 G4:0.5 E4:0.5 | D4:1.5 D4:0.25 D4:0.25 | G4:0.5 G4:0.25 G4:0.25 D4:0.25 E4:0.25 D4:0.25 E4:0.25 | G4:1.5 D4:0.25 D4:0.25 | G4:0.5 G4:0.25 G4:0.25 D4:0.25 E4:0.25 D4:0.25 E4:0.25 | G4:1.5 G4:0.5 | G4:0.75 A4:0.25 G4:0.5 A4:0.5 | D4:1 D5:0.75 E5:0.25 | D5:0.75 D5:0.25 E5:0.5 B4:0.25 A4:0.25 | B4:1.5 B4:0.25 A4:0.25 | B4:0.75 D5:0.25 D5:0.5 B4:0.25 A4:0.25 | G4:0.5 E4:0.5 G4:0.5 E4:0.5 | D4:1.5 E4:0.25 D4:0.25 | B3:0.5 D4:0.5 B3:0.25 D4:0.25 B3:0.25 A3:0.25 | G3:1.5 E4:0.25 D4:0.25 | B3:0.5 D4:0.5 B3:0.25 D4:0.25 B3:0.25 A3:0.25 | G3:1.5",
  "2/4", [(0, {"D4": "R1", "E4": "R2", "G4": "R3", "A4": "R4", "B4": "R5", "C4": "L1"}),
          (19, {"G4": "R1", "A4": "R2", "B4": "R3", "D5": "R4", "E5": "R5", "G3": "L5", "A3": "L4", "B3": "L3", "D4": "L2", "E4": "L1"})],
  [0, 5, 9, 13, 19, 23], dyn={0: "mf", 19: "f", 23: "mf"}),
 # Tuần 24 — Bèo dạt mây trôi (dân ca Bắc Bộ; 3 bản ký âm, theo 2/3 nguồn ở chỗ khác nhau). Sol trưởng (không có Fa♯).
 # Tay trái Rê4 Mi3 Sol1 (thế Đô tay trái, cao một quãng tám); tay phải La1 Si2 Đô3 Rê4 Mi5 — riêng ô 7–8 (lên Sol cao,
 # tay trái đang giữ Rê 2 phách) đổi thế Si1 Đô2 Rê3 Sol5, rồi về lại ở nốt Si dài ô 8→9 (tuần 24: đổi thế tay).
 vn_song("beo_dat_may_troi", "Beo Dat May Troi (Vietnamese folk song)", "Bèo dạt mây trôi (dân ca Bắc Bộ)", "Dân ca Bắc Bộ", 24,
  "R:1 G4:1 | G4:1 D5:0.5 B4:0.25 C5:0.25 | D5:1 E5:0.5 D5:0.5 | D5:1 B4:1 | B4:1 B4:0.25 A4:0.25 B4:0.25 D5:0.25 | G4:1 G4:0.25 B4:0.25 A4:0.25 G4:0.25 | D4:2 | D5:0.5 G5:0.5 B4:0.5 C5:0.5 | D5:1 B4:1 | B4:1 B4:0.25 A4:0.25 B4:0.25 D5:0.25 | G4:1 G4:0.25 B4:0.25 A4:0.25 G4:0.25 | D4:2 | E4:0.5 G4:0.5 G4:0.5 A4:0.25 B4:0.25 | B4:1.5 A4:0.5 | B4:1 B4:0.5 A4:0.5 | G4:0.75 A4:0.25 B4:0.25 A4:0.25 B4:0.25 D5:0.25 | G4:0.5 D4:1 G4:0.5 | D4:0.5 G4:0.5 A4:0.5 B4:0.25 A4:0.25 | G4:2",
  "2/4", [(0, {"A4": "R1", "B4": "R2", "C5": "R3", "D5": "R4", "E5": "R5", "D4": "L4", "E4": "L3", "G4": "L1"}),
          (7, {"B4": "R1", "C5": "R2", "D5": "R3", "G5": "R5", "D4": "L4", "E4": "L3", "G4": "L1"}),
          (9, {"A4": "R1", "B4": "R2", "C5": "R3", "D5": "R4", "E5": "R5", "D4": "L4", "E4": "L3", "G4": "L1"})],
  [0, 7, 9, 12], dyn={0: "p", 7: "mf", 12: "p"}, slurs=[(2, 0, 2, 2), (13, 0, 13, 1)]),
 # Tuần 24 — Lý ngựa ô BẢN ĐẦY ĐỦ (dân ca Nam Bộ, Trần Kiết Tường ký âm; SGK Âm nhạc 9 KNTT = SGK Âm nhạc 9 CTST, khớp từng nốt).
 # Thay bản 12 ô cũ (một dị bản khác). Nhắc lại ô 24–31 như bản in: lượt 2 bỏ kết 1 (ô 30–31), vào kết 2 (ô 32).
 # Nốt Sol3 ở ô 29 lên một quãng tám (tư liệu cho phép). Tay phải THẾ SOL (Sol1 La2 Si3 Rê cao5); tay trái La3 5 · Đô 3 · Rê 2 · Mi 1.
 vn_song("ly_ngua_o", "Ly Ngua O (Vietnamese folk song)", "Lý ngựa ô (dân ca Nam Bộ)", "Dân ca Nam Bộ", 24,
  "B4:0.5 A4:0.5 | G4:0.5 B4:0.5 E4:0.5 G4:0.5 | A4:1 R:0.5 B4:0.25 A4:0.25 | G4:0.5 B4:0.5 E4:0.5 G4:0.5 | A4:0.5 R:0.5 B4:0.5 A4:0.5 | G4:0.5 B4:0.5 E4:0.5 G4:0.5 | A4:1 R:0.5 E4:0.25 G4:0.25 | A4:1 A4:0.5 B4:0.5 | R:0.5 D5:1 B4:0.5 | D5:1 E4:0.5 G4:0.5 | A4:1 R:0.5 B4:0.25 A4:0.25 | G4:0.5 B4:0.5 A4:0.5 R:0.5 | R:1.5 A4:0.5 | A4:1 D5:1 | E4:0.5 G4:0.5 R:0.5 E4:0.5 | E4:0.5 G4:0.5 D4:1 | A4:1 B4:1 | R:0.5 A4:1 D5:0.5 | E4:0.5 G4:0.5 R:0.5 G4:0.5 | G4:1 D4:1 | B4:1 B4:0.5 A4:0.5 | R:0.5 G4:0.5 E4:0.5 D4:0.5 | D4:1.5 E4:0.5 | D4:1 A3:1 | E4:1 A4:0.5 R:0.5 | R:0.5 E4:1 D4:0.5 | A3:1 E4:0.5 R:0.5 | R:0.5 D4:0.5 A3:1 | R:1 E4:0.5 D4:0.5 | C4:1 G3:1 | D4:1.5 E4:0.5 | D4:1 A3:1 | D4:1 R:1",
  "2/4", [(0, {"G4": "R1", "A4": "R2", "B4": "R3", "D5": "R5", "A3": "L5", "C4": "L3", "D4": "L2", "E4": "L1"})],
  [0, 5, 9, 13, 17, 21, 24, 28, 32, 36], order=list(range(0, 32)) + list(range(24, 30)) + [32], octave={29: {1: 12}},
  dyn={0: "mf", 13: "f", 17: "mf", 24: "p"}),
 # Tuần 25 — Đêm thu (1940): NHẠC Đặng Thế Phong (1918–1942; PD ở VN từ 1993). CHỈ giai điệu. Hai bản in khớp ô 1–14.
 # Tư liệu đã dịch Sol thứ → La thứ (+1 cung); GIỮ nốt cảm âm Sol♯, Rê♯ (không bỏ dấu hóa — tôn trọng tác phẩm).
 # Tay phải Si1 Đô2 Rê3 Mi4 Fa5 (Rê♯ ngón 3 ở câu 2), tay trái Mi 5 · Sol♯ 2 · La 1.
 vn_song("dem_thu", "Dem Thu (Autumn Night)", "Đêm thu (nhạc Đặng Thế Phong)", "Đặng Thế Phong", 25,
  " | E4:1 A4:1 C5:1 | E5:2 C5:0.5 E5:0.5 | B4:2 B4:0.5 C5:0.5 | A4:3 | E4:1 A4:1 C5:1 | E5:2 F5:1 | E5:2 D#5:1 | E5:3 | F5:1 E5:0.5 D5:0.5 A4:0.5 B4:0.5 | C5:3 | E5:1 D5:0.5 C5:0.5 E4:0.5 G#4:0.5 | B4:2 C5:1 | A4:3 | A4:3",
  "3/4", [(0, {"B4": "R1", "C5": "R2", "D5": "R3", "E5": "R4", "F5": "R5", "E4": "L5", "G#4": "L2", "A4": "L1"}),
          (4, {"B4": "R1", "C5": "R2", "D#5": "R3", "E5": "R4", "F5": "R5", "E4": "L5", "G#4": "L2", "A4": "L1"}),
          (8, {"B4": "R1", "C5": "R2", "D5": "R3", "E5": "R4", "F5": "R5", "E4": "L5", "G#4": "L2", "A4": "L1"})],
  [0, 4, 8], dyn={0: "p", 4: "mf", 12: "p"}, slurs=[(8, 0, 8, 2), (10, 0, 10, 2)], arr=PD_ARR),
 # Tuần 26 — Con thuyền không bến (1941): NHẠC Đặng Thế Phong. CHỈ giai điệu. Tư liệu đã dịch Rê thứ → La thứ (4/4, lấy đà 3,5 phách).
 # Giữ nốt Sol3 ở ô 14. Tay trái "thế Sol giữa" Sol3 5 · La3 4 · Đô 2 · Rê 1 (như "Lý cây bông"); tay phải ngón cái luôn ở Mi:
 # câu có La–Si–Đô: Mi1 Sol2 La3 Si4 Đô5, câu có Fa: Mi1 Fa2.
 vn_song("con_thuyen_khong_ben", "Con Thuyen Khong Ben (Boat Without a Wharf)", "Con thuyền không bến (nhạc Đặng Thế Phong)", "Đặng Thế Phong", 26,
  "E4:0.5 E4:0.5 E4:0.5 E4:0.5 A3:1 D4:0.5 | E4:4 | R:0.5 A4:0.5 A4:0.5 A4:0.5 A4:0.5 E4:1 G4:0.5 | A4:4 | R:0.5 A4:0.5 B4:0.5 A4:0.5 C5:0.5 B4:1 A4:0.5 | E4:4 | R:0.5 E4:0.5 F4:0.5 E4:0.5 D4:0.5 A3:1 C4:0.5 | A3:4 | R:0.5 E4:0.5 E4:0.5 E4:0.5 E4:0.5 A3:1 D4:0.5 | E4:4 | R:0.5 A4:0.5 A4:0.5 A4:0.5 A4:0.5 E4:1 G4:0.5 | A4:4 | R:0.5 A4:0.5 B4:0.5 A4:0.5 C5:0.5 B4:1 A4:0.5 | E4:4 | R:0.5 E4:0.5 F4:0.5 E4:0.5 D4:0.5 G3:1 C4:0.5 | A3:4",
  "4/4", [(0, {"E4": "R1", "G4": "R2", "A4": "R3", "B4": "R4", "C5": "R5", "G3": "L5", "A3": "L4", "C4": "L2", "D4": "L1"}),
          (5, {"E4": "R1", "F4": "R2", "G3": "L5", "A3": "L4", "C4": "L2", "D4": "L1"}),
          (9, {"E4": "R1", "G4": "R2", "A4": "R3", "B4": "R4", "C5": "R5", "G3": "L5", "A3": "L4", "C4": "L2", "D4": "L1"}),
          (13, {"E4": "R1", "F4": "R2", "G3": "L5", "A3": "L4", "C4": "L2", "D4": "L1"})],
  [0, 5, 9, 13], dyn={0: "p", 9: "mf", 13: "p"}, slurs=[(4, 0, 4, 5), (12, 0, 12, 5)], arr=PD_ARR),
 # Tuần 27 — Người ơi người ở đừng về (quan họ Bắc Ninh): CHỈ đoạn có nhịp (phần mở đầu hát tự do bỏ). Hai bản ký âm
 # (vnguitar + truongca); ô 2 dùng Si (bản A ghi Si♭ — tư liệu chọn Si để toàn phím trắng). Fa trưởng như bản gốc.
 # Chia theo âm vực: tay phải La1 Si2 Đô3 Rê4 Fa5, tay trái Đô5 Rê4 Fa2 Sol1 (thế Đô tay trái, cao một quãng tám).
 vn_song("nguoi_oi_nguoi_o_dung_ve", "Nguoi Oi Nguoi O Dung Ve (Vietnamese folk song)", "Người ơi người ở đừng về (dân ca quan họ Bắc Ninh)",
  "Dân ca quan họ Bắc Ninh", 27,
  "G4:0.5 | G4:1 C5:1 | G4:0.5 C5:0.5 D5:0.25 C5:0.25 B4:0.25 D5:0.25 | C5:0.75 D5:0.25 C5:1 | D5:0.25 C5:0.25 D5:0.25 F5:0.25 D5:0.5 C5:0.5 | A4:1 G4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:2 | A4:0.5 G4:0.25 C5:0.25 A4:1 | G4:0.5 F4:0.5 D4:0.5 F4:0.5 | G4:0.5 A4:0.5 A4:0.25 G4:0.25 F4:0.25 G4:0.25 | A4:1 C4:0.5 C4:0.5 | D4:0.5 A4:0.5 G4:0.5 F4:0.5 | C4:1.5 F4:0.5 | C4:0.5 F4:0.5 A4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:1.5 F4:0.25 G4:0.25 | A4:0.5 A4:0.5 G4:0.25 C5:0.25 A4:0.25 G4:0.25 | F4:2",
  "2/4", [(0, {"A4": "R1", "B4": "R2", "C5": "R3", "D5": "R4", "F5": "R5", "C4": "L5", "D4": "L4", "F4": "L2", "G4": "L1"})],
  [0, 7, 13], dyn={0: "p", 7: "mf", 13: "p"}, slurs=[(3, 0, 3, 2)]),
]

# ---------------------------------------------------------------- BÀI TỰ SÁNG TÁC BỔ SUNG (2026-10-06): lấp chỗ mỏng của kho bài
# Rà soát kho bài theo tuần: tuần 2–4, 19, 25–26, 28 chỉ có 2 bài; tuần 29–30 chỉ có 1 bài; bài GIAI ĐIỆU TAY TRÁI chỉ toàn bài
# chuyển từ tay phải; ít bài giọng thứ, ít bài ngũ cung tự sáng tác, chỉ một bài hai tay có tay trái "đi" nốt đen.
# Mỗi bài 8 ô nhịp, câu hỏi (ô 0–3) – câu trả lời (ô 4–7) kết về chủ âm, CHỈ dùng kỹ năng đã học tới tuần của bài.
# Phần lớn vào Thư viện (mở theo tuần); "Ốc sên", "Minuet chim sẻ", "Mưa rào mùa hạ" vào bài học (tuần chỉ có 1–2 bài).
PENTA_C = {"C4": 1, "D4": 2, "E4": 3, "G4": 4, "A4": 5}   # ngũ cung Đô (Đô Rê Mi Sol La)
MUA_RAO = {"A4": 1, "B4": 2, "C5": 3, "D5": 4, "D#5": 4, "E5": 5}   # câu 1 dùng Rê, câu 2 dùng Rê♯ (cùng ngón 4, khác câu)
S += [
 # Tuần 2 — chỉ Đô Rê Mi, nốt đen/trắng/tròn. Vịt lạch bạch: hai nốt lặp "Đô Đô Mi Mi"; câu hỏi dừng ở Rê, câu trả lời về Đô.
 song("duckling_waddle","Duckling Waddle","Vịt con lạch bạch",ORIG,2,"RH",
  "C4 C4 E4 E4  D4 D4 C4:2  E4 D4 C4 D4  E4:2 D4:2  C4 C4 E4 E4  D4 D4 C4:2  E4 D4 E4 D4  C4:4",[0,4],arr=ORIG),
 # Tuần 3 — thế Đô đủ 5 ngón, chưa có móc đơn / dấu lặng. Ốc sên bò chậm lên lá (nốt trắng đi lên) rồi trượt xuống.
 song("snail_stroll","Snail's Stroll","Ốc sên đi chơi",ORIG,3,"RH",
  "C4:2 D4:2  E4:2 F4:2  G4 F4 E4 D4  E4:4  G4:2 F4:2  E4:2 D4:2  C4 E4 D4:2  C4:4",[0,4],arr=ORIG),
 # Tuần 4 — móc đơn "Chạy-chạy" + dấu lặng "Suỵt": tàu xình xịch (4 móc đơn cùng phím) rồi kéo còi.
 song("choo_choo_train","Choo-choo Train","Tàu hỏa xình xịch",ORIG,4,"RH",
  "C4:0.5 C4:0.5 C4:0.5 C4:0.5 E4 E4  D4:0.5 D4:0.5 E4:0.5 F4:0.5 G4:2  G4:0.5 G4:0.5 F4:0.5 F4:0.5 E4 D4  D4:2 R:2  "
  "C4:0.5 C4:0.5 C4:0.5 C4:0.5 E4 E4  D4:0.5 D4:0.5 E4:0.5 F4:0.5 G4:2  G4:0.5 F4:0.5 E4:0.5 D4:0.5 E4 D4  C4:3 R",[0,4],arr=ORIG),
 # Tuần 7 — GIAI ĐIỆU TAY TRÁI tự sáng tác (thế Đô tay trái Đô3–Sol3): voi bước nặng TO, rồi phun nước NHỎ.
 song("little_elephant","Little Elephant","Chú voi con",ORIG,7,"LH",
  "f C3 C3 G3:2  E3 E3 C3:2  D3 E3 F3 D3  E3:2 G3:2  p E3 F3 G3 E3  F3 D3 E3:2  mf G3 F3 E3 D3  f C3:4",[0,4],arr=ORIG),
 # Tuần 14 — giai điệu TAY TRÁI ở thế Sol (Sol2–Rê3): bài ru, NHỎ và LIỀN.
 song("bear_lullaby","Bear Cub's Lullaby","Gấu con đi ngủ",ORIG,14,"LH",
  "p (D3:2 B2:2)  (C3 B2 A2:2)  (B2 C3 D3 B2)  A2:4  (D3:2 B2:2)  (C3 A2 B2:2)  mf (C3 B2 A2 B2)  p G2:4",[0,4],pos="G",arr=ORIG),
 # Tuần 16 — thế Rê (Fa♯): đèn lồng đung đưa "La – Fa♯ – Rê", móc đơn đi lên; câu trả lời LIỀN, về Rê.
 song("mid_autumn_night","Mid-Autumn Night","Đêm Trung thu",ORIG,16,"RH",
  "mf A4 F#4 D4 F#4  E4:0.5 F#4:0.5 G4 A4:2  G4 E4 G4 F#4  E4:4  p A4 F#4 D4 F#4  E4:0.5 F#4:0.5 G4 A4:2  mf (G4 F#4 E4 F#4)  D4:4",[0,4],pos="D",arr=ORIG),
 # Tuần 19 — nghịch phách "Chạy-Đi-chạy" + NGẮT: rô-bốt giật cục, đứng hình ở ô 4.
 song("robot_dance","Robot Dance","Robot nhảy",ORIG,19,"RH",
  "f C4:0.5' E4' C4:0.5' G4' G4'  F4:0.5' D4' F4:0.5' E4:2  E4:0.5' G4' E4:0.5' F4' D4'  E4:2 R:2  "
  "p C4:0.5' E4' C4:0.5' G4' G4'  F4:0.5' D4' F4:0.5' E4' C4'  f D4:0.5' E4' F4:0.5' G4' G4'  G4' R C4' R",[0,4],arr=ORIG),
 # Tuần 22 — NGŨ CUNG (Đô Rê Mi Sol La, không có Fa — âm hưởng Việt Nam) tay phải + hợp âm I – IV – V tay trái.
 # Bàn tay ngũ cung Đô1 Rê2 Mi3 Sol4 La5 (như "Xòe hoa" / "Gà gáy": Mi–Sol cách một phím bằng ngón 3-4) — mỗi ngón một phím, không dời tay.
 song("tet_rice_cake","Tet Rice Cakes","Bánh chưng ngày Tết",ORIG,22,"BOTH",fingered(
  "f C4 D4 E4 G4  A4:0.5 G4:0.5 E4 G4:2  E4 D4 C4 D4  E4:2 D4:2  mf C4 D4 E4 G4  A4:0.5 G4:0.5 A4:0.5 G4:0.5 E4:2  f G4 E4 D4 E4  C4:4",PENTA_C),
  [0,4],pos="free",lh=f"{I}:4  {IV}:2 {I}:2  {I}:2 {V}:2  {I}:2 {V}:2  {I}:4  {IV}:2 {I}:2  {I}:2 {V}:2  {I}:4",arr=ORIG),
 # Tuần 25 — giọng THỨ ở thế Đô thứ (Mi♭): mèo rón rén NHỎ & NGẮT, rình… rồi vồ TO.
 song("kitten_stalks","Kitten Stalks the Mouse","Mèo con rình chuột",ORIG,25,"RH",
  "p C4' R Eb4' R  D4' R F4' R  Eb4' F4' G4' Eb4'  D4:2 R:2  C4' R Eb4' R  D4' F4' Eb4' D4'  "
  "mf (C4:0.5 D4:0.5 Eb4:0.5 F4:0.5) G4:2  f G4' R C4' R",[0,4],pos="Cm",arr=ORIG),
 # Tuần 26 — thế Đô cao (Đô5–Sol5), NGŨ CUNG Đô Rê Mi Sol: diều bay LIỀN, có "Đi-chấm chạy"; câu cuối diều vút cao TO.
 song("flying_kite","Flying a Kite","Thả diều",ORIG,26,"RH",
  "mf (C5 D5 E5 G5)  G5:1.5 E5:0.5 D5:2  (E5 G5 E5 D5)  E5:2 D5:2  p (C5 D5 E5 G5)  f G5:1.5 E5:0.5 G5:2  mf (E5 D5 C5 D5)  C5:4",[0,4],pos="C5",arr=ORIG),
 # Tuần 28 — hai tay, TAY TRÁI ĐI NỐT ĐEN (Đô–Sol–Mi–Sol như mái chèo) dưới nốt trắng tay phải; kết hợp âm Đô trưởng.
 song("boat_race","Boat Race","Đua thuyền",ORIG,28,"BOTH",
  "mf E4:2 G4:2  F4:2 D4:2  E4 F4 G4 E4  D4:4  f G4:2 E4:2  F4:2 D4:2  E4 G4 F4 D4  C4:4",[0,4],
  lh=f"C3 G3 E3 G3  D3 G3 F3 G3  C3 G3 E3 G3  D3 G3 F3 G3  C3 G3 E3 G3  D3 G3 F3 G3  C3 G3 D3 G3  {I}:4",arr=ORIG),
 # Tuần 29 — chuẩn bị Minuet (thế Sol, 3/4): nốt đen + bốn móc đơn LIỀN, hai nốt NGẮT — đúng "dáng" Minuet, giai điệu mới.
 song("sparrow_minuet","Sparrow's Minuet","Minuet chim sẻ",ORIG,29,"RH",
  "mf G4 (B4:0.5 A4:0.5 B4:0.5 C5:0.5)  D5 G4' G4'  C5 (A4:0.5 B4:0.5 C5:0.5 B4:0.5)  A4:3  "
  "p B4 (C5:0.5 D5:0.5 C5:0.5 B4:0.5)  C5 A4' A4'  mf B4 (D5:0.5 C5:0.5 B4:0.5 A4:0.5)  G4:3",[0,4],pos="G",ts="3/4",arr=ORIG),
 # Tuần 30 — chuẩn bị Für Elise (La thứ, 3/4, tay phải La4–Mi5): hợp âm rải La thứ LIỀN, "Mi – Rê♯ – Mi" như chớp lóe.
 song("summer_shower","Summer Shower","Mưa rào mùa hạ",ORIG,30,"RH",fingered(
  "p (A4:0.5 C5:0.5 E5:0.5 C5:0.5) A4  (B4:0.5 D5:0.5 E5:0.5 D5:0.5) B4  (C5:0.5 B4:0.5 A4:0.5 B4:0.5) C5  E5:2 R  "
  "mf E5 D#5 E5  (C5:0.5 B4:0.5 A4:0.5 B4:0.5) C5  p (C5:0.5 B4:0.5 C5:0.5 B4:0.5) E5  A4:2 R",MUA_RAO),[0,4],pos="free",ts="3/4",arr=ORIG),
]

# Bài Việt Nam (OWNER 2026-10-06) — mục "🇻🇳 Bài Việt Nam" của Thư viện:
#   vn = "folk"   : dân ca Việt Nam
#   vn = "lyrics" : giai điệu nước ngoài (public domain) mà trẻ em Việt Nam quen hát lời Việt
#   vn = "composed": ca khúc nhạc sĩ Việt Nam đã thuộc về công chúng (ghi tên nhạc sĩ, giữ tên bài, chỉ giai điệu)
#   aka           : tên Việt quen gọi khác (CHỈ tên — không có lời bài hát)
VN_FOLK = {"bac_kim_thang", "inh_la_oi", "ly_cay_bong", "ly_cay_da", "ly_ngua_o", "xoe_hoa",
           "co_la", "trong_com", "beo_dat_may_troi", "nguoi_oi_nguoi_o_dung_ve", "ly_cay_xanh", "ly_con_sao",
           "mua_roi", "ngay_mua_vui", "ga_gay"}
VN_COMPOSED = {"xuan_va_tuoi_tre", "dem_thu", "con_thuyen_khong_ben"}
VN_LYRICS = {
 "frere_jacques_easy": None, "frere_jacques_minor": None,          # "Kìa con bướm vàng" (đã là tên chính)
 "twinkle_easy": "Sao nhỏ lấp lánh", "twinkle_run": "Sao nhỏ lấp lánh", "twinkle_both": "Sao nhỏ lấp lánh",
 "birthday_both": None,                                         # "Chúc mừng sinh nhật" (đã là tên chính)
 "jingle_bells": "Leng keng", "jingle_bells_both": "Leng keng",
}
for d in S:
    meta = {}
    if d["id"] in VN_FOLK: meta["vn"] = "folk"
    elif d["id"] in VN_COMPOSED: meta["vn"] = "composed"
    elif d["id"] in VN_LYRICS:
        meta["vn"] = "lyrics"
        if VN_LYRICS[d["id"]]: meta["aka"] = VN_LYRICS[d["id"]]
    if meta:
        items = list(d.items()); d.clear()
        for k, v in items:
            d[k] = v
            if k == "titleVi": d.update(meta)
assert all(any(d["id"] == i for d in S) for i in VN_FOLK | VN_COMPOSED | set(VN_LYRICS)), "id bài Việt Nam sai"

for f in glob.glob("src/data/songs/*.json"): os.remove(f)
for d in S:
    voices = [d["notes"]] + ([d["lh"]] if "lh" in d else [])
    for v in voices:
        for n in v: n.pop("_fixed", None)
    beats = [sum(n["beats"] for n in v) for v in voices]
    per = int(d["timeSignature"].split("/")[0])
    assert len(set(beats)) == 1, (d["id"], beats)
    assert beats[0] % per == 0, (d["id"], beats)
    # Bài có nốt móc kép (< nửa phách): tốc độ khởi đầu 40 (thang 40–50–60–72) — ở 60 là 4 nốt/giây, quá nhanh cho bé
    # mới học; muốn "thuộc" (⭐) vẫn phải đàn trọn bài từ 60 trở lên như mọi bài.
    if any(n["beats"] < 0.5 for v in voices for n in v): d["bpm"] = 40
    with open(f"src/data/songs/{d['id']}.json", "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1); fh.write("\n")
    print(f"{d['id']:24} w{d['week']:<2} {d['hand']:4} {d.get('position','C'):4} {int(beats[0]//per):>3} ô nhịp")
print(len(S), "bài")
