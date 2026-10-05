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
# ---------------------------------------------------------------- CẤP 2 (tuần 11–20): hai tay, thế mới, phím đen, nhịp
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
 # Tuần 17 — nhịp chấm dôi & móc đơn
 song("ode_to_joy_original","Ode to Joy (original rhythm)","Bài ca niềm vui — nhịp chấm dôi","Ludwig van Beethoven",17,"RH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4:1.5 D4:0.5 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4:1.5 C4:0.5 C4:2",[0,4]),
 # Dân ca (thay "Cầu London — chấm dôi", bài lặp): Bắc kim thang — hạ một cung xuống Fa trưởng ngũ cung (Đô Rê Fa Sol La,
 # toàn phím trắng), bàn tay ngũ cung Đô1 Rê2 Fa3 Sol4 La5 (như "Xòe hoa"). Nhịp chấm dôi "Đi-chấm chạy" ở ô 1, 3, 5, 7, 9; dấu luyến theo bản ký âm gốc.
 song("bac_kim_thang","Bac Kim Thang (Vietnamese folk song)","Bắc kim thang (dân ca Nam Bộ)","Dân ca Nam Bộ",18,"RH",fingered(
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
 # Tuần 18 (v5, móc kép & nghịch phách): "Chạy-chạy-chạy-chạy", "Chạy chạy-chạy"; "Chạy-Đi-chạy"
 song("rabbit_run","Running Rabbit","Thỏ con chạy",ORIG,18,"RH",
  "mf C4:0.25 D4:0.25 E4:0.25 F4:0.25 G4 G4:2  F4:0.25 E4:0.25 D4:0.25 C4:0.25 D4 D4:2  "
  "E4:0.5 E4:0.25 F4:0.25 G4 E4:0.5 D4:0.5 C4  D4:0.5 D4:0.25 E4:0.25 D4 C4:2",[0,2],arr=ORIG),
 song("cyclo_ride","Cyclo Ride","Xích lô dạo phố",ORIG,18,"RH",
  "mf C4:0.5 E4 E4:0.5 G4:2  F4:0.5 D4 D4:0.5 E4:2  E4:0.5 G4 G4:0.5 F4 E4  D4:0.5 E4 D4:0.5 C4:2",[0,2],arr=ORIG),
 # Tuần 19 — gam Đô trưởng, luồn ngón cái
 song("scale_c_rh","C major scale (right hand)","Gam Đô trưởng — tay phải","Bài tập (traditional)",19,"RH",
  "mf (C4/1 D4/2 E4/3 F4/1  G4/2 A4/3 B4/4 C5/5)  (C5/5 B4/4 A4/3 G4/2  F4/1 E4/3 D4/2 C4/1)",[0,2],pos="free",arr=ORIG),
 song("scale_c_lh","C major scale (left hand)","Gam Đô trưởng — tay trái","Bài tập (traditional)",19,"LH",
  "mf (C3/5 D3/4 E3/3 F3/2  G3/1 A3/3 B3/2 C4/1)  (C4/1 B3/2 A3/3 G3/1  F3/2 E3/3 D3/4 C3/5)",[0,2],pos="free",arr=ORIG),
 song("joy_to_the_world","Joy to the World","Niềm vui cho thế giới","Lowell Mason (1839), theo G. F. Handel",19,"RH",
  "f C5:2/5 B4:1.5/4 A4:0.5/3  G4:3/2 F4/1  E4:2/3 D4:2/2  C4:4/1  C5:2/5 B4:1.5/4 A4:0.5/3  G4:3/2 F4/1  E4:2/3 D4:2/2  C4:4/1",[0,4],pos="free"),
]
# ---------------------------------------------------------------- CẤP 3 (tuần 21–30): hợp âm, vạch phụ, đổi thế, nốt cao, cổ điển
I = "C3+E3+G3"; IV = "C3+F3"; V = "D3+G3"
S += [
 # Tuần 21 — hợp âm tay trái
 song("twinkle_both","Twinkle Twinkle (hands together, chords)","Ngôi sao nhỏ — hai tay hợp âm","Dân ca Pháp (traditional)",21,"BOTH",
  "mf C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2  G4 G4 F4 F4  E4 E4 D4:2  G4 G4 F4 F4  E4 E4 D4:2  p C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2",[0,4,8],"A4",
  lh=f"{I}:4  {IV}:2 {I}:2  {IV}:2 {I}:2  {V}:2 {I}:2  {I}:2 {IV}:2  {I}:2 {V}:2  {I}:2 {IV}:2  {I}:2 {V}:2  {I}:4  {IV}:2 {I}:2  {IV}:2 {I}:2  {V}:2 {I}:2"),
 song("ode_to_joy_chords","Ode to Joy (hands together, chords)","Bài ca niềm vui — hai tay hợp âm","Ludwig van Beethoven",21,"BOTH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2",[0,4],
  lh=f"{I}:4  {V}:4  {I}:4  {V}:4  {I}:4  {V}:4  {I}:4  {V}:2 {I}:2"),
 song("jingle_bells_both","Jingle Bells (hands together)","Chuông ngân vang — hai tay","James Lord Pierpont (1857)",21,"BOTH",
  "f E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  E4 D4 D4 E4  D4:2 G4:2  E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  G4 G4 F4 D4  C4:4",[0,4,8,12],
  lh=f"{I}:4  {I}:4  {I}:4  {I}:4  {IV}:4  {I}:4  {V}:4  {V}:4  {I}:4  {I}:4  {I}:4  {I}:4  {IV}:4  {I}:4  {V}:4  {I}:4"),
 # Tuần 22 (v5, Cầu Vạch Phụ): khuông lớn hai tay luân phiên · thế La thứ trên dòng kẻ phụ · hai tay hợp âm I – V
 song("grand_duet","Grand Staff Duet","Song ca hai khóa",ORIG,22,"BOTH",
  "mf E4 G4 F4 D4  E4:2 C4:2  R:4  R:4  p G4 F4 E4 D4  E4:2 D4:2  R:4  R:4",[0,4],
  lh="R:4  R:4  A3 B3 C4 A3  G3:4  R:4  R:4  F3 A3 G3 B3  C4:4",lhpos="MC",arr=ORIG),
 song("stepping_stones","Stepping Stones","Bước qua vạch phụ",ORIG,22,"RH",
  "mf C4 B3 A3 B3  C4 D4 E4:2  D4 C4 B3 C4  A3:4  p E4 D4 C4 B3  A3 B3 C4:2  D4 C4 B3 B3  A3:4",[0,4],pos="Am",arr=ORIG),
 song("lantern_parade","Lantern Parade","Rước đèn",ORIG,22,"BOTH",
  "f G4 E4 G4 E4  F4 D4 F4:2  E4 C4 E4 D4  C4:4  p G4 E4 G4 E4  F4 D4 F4:2  E4 D4 E4 D4  C4:4",[0,4],
  lh=f"{I}:4  {V}:4  {I}:2 {V}:2  {I}:4  {I}:4  {V}:4  {I}:2 {V}:2  {I}:4",arr=ORIG),
 # Tuần 23 — đổi thế tay
 song("silent_night","Silent Night","Đêm thánh vô cùng","Franz Xaver Gruber (1818)",23,"RH",
  # Đổi thế (luôn ở nốt dài): thế Mi (E1 G2 A3 B4 C5) → thế Sol (G1…D5) → thế Mi → thế Si (B1 C2 D3 E4 F5)
  # → "sleep in heavenly peace": thế Sol, ngón 3 vắt qua xuống Mi (như gam đi xuống) → thế Đô, kết ở Đô.
  "p (G4:1.5/2 A4:0.5/3 G4/2)  E4:3/1  (G4:1.5/2 A4:0.5/3 G4/2)  E4:3/1  D5:2/5 D5/5  B4:3/3  C5:2/4 C5/4  G4:3/1  "
  "mf A4:2/3 A4/3  C5:1.5/5 B4:0.5/4 A4/3  G4:1.5/2 A4:0.5/3 G4/2  E4:3/1  A4:2/3 A4/3  C5:1.5/5 B4:0.5/4 A4/3  G4:1.5/2 A4:0.5/3 G4/2  E4:3/1  "
  "p D5:2/3 D5/3  F5:1.5/5 D5:0.5/3 B4/1  C5:3/2  E5:3/4  C5:1.5/4 G4:0.5/1 E4/3  G4:1.5/5 F4:0.5/4 D4/2  C4:3/1",[0,4,8,12,16,20],pos="free",ts="3/4"),
 # Tuần 23 — dân ca: Lý ngựa ô (12 ô đầu, Đô trưởng ngũ cung Rê Fa Sol La Đô — tầm quãng 7: quá rộng cho MỘT bàn tay bé).
 # Chia theo âm vực, hai tay LUÂN PHIÊN (như "Lý cây bông"): tay phải thế Sol (Sol1 La2 Đô4), tay trái giữ Rê–Fa
 # (Fa ngón cái, Rê ngón 3 — "Rê Fa Rê Fa" trọn trong tay trái). Mỗi ngón một phím, không bàn tay nào rộng quá quãng 4.
 song("ly_ngua_o","Ly Ngua O (Vietnamese folk song)","Lý ngựa ô (dân ca Nam Bộ)","Dân ca Nam Bộ",23,"BOTH",
  "mf R C5:0.5 A4:0.5  R:2  G4:2  R:2  R C5:0.5 A4:0.5  R:2  G4:1.5 R:0.5  G4 G4  "
  "C5:1.5 G4:0.5  C5:0.5 A4:0.5 R  G4:2  A4:0.5 G4:0.5 R:0.5 A4:0.5  G4:2",[0,4,9],pos="G",
  lh="R:2  D4:0.5/3 F4:0.5/1 D4:0.5/3 F4:0.5/1  R:2  R:2  R:2  D4:0.5/3 F4:0.5/1 D4:0.5/3 F4:0.5/1  R:1.5 F4:0.5/1  R:2  "
  "R:2  R D4:0.5/3 F4:0.5/1  R:2  R F4:0.5/1 R:0.5  R:2",lhpos="free",ts="2/4",arr=FOLK),
 # Tuần 24 — trưởng & thứ: bài tự sáng tác giọng La thứ (thay "Bài ca niềm vui — La thứ"): NHỎ, NGẮT, ô cuối TO
 song("ninja_tiptoe","Tiptoe Ninja","Ninja rón rén",ORIG,24,"RH",
  "p A3' A3' C4' A3'  B3' B3' D4' B3'  A3' C4' E4' C4'  B3:2 R:2  A3' A3' C4' A3'  B3' D4' C4' B3'  "
  "C4:0.5' B3:0.5' A3:0.5' B3:0.5' C4' D4'  f E4' R A3' R",[0,4],pos="Am",arr=ORIG),
 # Tuần 25 — đọc nốt cao: bài tự sáng tác ở thế Đô cao (Đô5–Sol5), LIỀN và NHỎ
 song("drifting_boat","Drifting Boat","Thuyền trôi",ORIG,25,"RH",
  "p (E5:2 D5  C5:2 D5  E5 F5 G5  E5:3)  mf (G5:2 F5  E5:2 D5  p F5 E5 D5  C5:3)",[0,4],pos="C5",ts="3/4",arr=ORIG),
 # Tuần 28 — Minuet (sắc thái/kiểu đàn theo cách đàn phổ biến — bản gốc không ghi)
 song("minuet_g","Minuet in G (BWV Anh. 114)","Minuet Sol trưởng","Christian Petzold (khoảng 1725)",28,"RH",
  "mf D5/5 (G4:0.5/1 A4:0.5/2 B4:0.5/3 C5:0.5/4)  D5/5 G4/1' G4/1'  E5/3 (C5:0.5/1 D5:0.5/2 E5:0.5/3 F#5:0.5/4)  G5/5 G4/1' G4/1'  C5/4 (D5:0.5/5 C5:0.5/4 B4:0.5/3 A4:0.5/2)  B4/3 (C5:0.5/4 B4:0.5/3 A4:0.5/2 G4:0.5/1)  F#4/1 (G4:0.5/2 A4:0.5/3 B4:0.5/4 G4:0.5/2)  A4:3/3",[0,4],pos="free",ts="3/4"),
 # Tuần 29 — Für Elise
 song("fur_elise","Für Elise (opening)","Für Elise (đoạn mở đầu)","Ludwig van Beethoven (1810)",29,"RH",
  # Mỗi ô 3/4 = một ô 3/8 của bản gốc (móc kép = nửa phách). "Mi–Rê♯" là nhịp lấy đà (phách 3 của ô 0).
  "p R:2 E5:0.5/5 D#5:0.5/4  E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3  A4/1 R:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/4  "
  "B4/5 R:0.5 E4:0.5/1 G#4:0.5/3 B4:0.5/4  C5/5 R:0.5 E4:0.5/1 E5:0.5/5 D#5:0.5/4  "
  "E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3  A4/1 R:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/4  "
  "B4/5 R:0.5 E4:0.5/1 C5:0.5/5 B4:0.5/4  A4:2/3 R",[0,5],pos="free",ts="3/4"),
 # Tuần 26 — Canon (hai tay, đọc hai khóa)
 song("canon","Canon in D (theme, simplified in C)","Khúc Canon (giản lược)","Johann Pachelbel (khoảng 1680)",26,"BOTH",
  # Tay phải: ngón cái ở La suốt bài (La1 Si2 Đô3 Rê4 Mi5); Sol bằng ngón 3 VẮT qua ngón cái rồi ngón cái luồn về La (như gam).
  # Tay trái: thế Đô mở rộng Đô3–La3 (Đô5 Mi4 Fa3 Sol2 La1) — không nhảy ngón cái.
  "p E5:2/5 D5:2/4  C5:2/3 B4:2/2  A4:2/1 G4:2/3  A4:2/1 B4:2/2  E5:2/5 D5:2/4  C5:2/3 B4:2/2  A4:2/1 G4:2/3  A4:2/1 G4:2/3",[0,4],pos="free",
  lh="p C3:2/5 G3:2/2  A3:2/1 E3:2/4  F3:2/3 C3:2/5  F3:2/3 G3:2/2  C3:2/5 G3:2/2  A3:2/1 E3:2/4  F3:2/3 C3:2/5  F3:2/3 C3:2/5",lhpos="free"),
 # Tuần 26 — dân ca hai khóa: Lý cây bông (La ngũ cung, giọng gốc Sol3–Đô5, tầm quãng 11 — quá một thế tay).
 # Chia theo âm vực, hai tay LUÂN PHIÊN (không đánh cùng lúc): Mi4 trở lên tay phải "thế Mi" (Mi1 Sol2 La3 Đô5 — như
 # "Đêm thánh vô cùng"), Rê4 trở xuống tay trái thế Sol giữa (Sol3=5 La3=4 Đô4=2 Rê4=1). Mỗi ngón chỉ một phím.
 song("ly_cay_bong","Ly Cay Bong (Vietnamese folk song)","Lý cây bông (dân ca Nam Bộ)","Dân ca Nam Bộ",26,"BOTH",
  "mf R A4:0.5/3 G4:0.5/2  A4/3 A4:0.5/3 G4:0.25/2 A4:0.25/3  C5:0.5/5 E4:0.5/1 G4:0.5/2 E4:0.5/1  G4/2 A4:0.25/3 G4:0.25/2 E4:0.25/1 G4:0.25/2  A4:1.5/3 A4:0.5/3  "
  "A4:0.5/3 G4:0.5/2 R:0.5 G4:0.5/2  E4:0.75/1 G4:0.25/2 A4:0.25/3 G4:0.25/2 E4:0.25/1 G4:0.25/2  A4:1.5/3 R:0.5  "
  "p E4:0.75/1 G4:0.25/2 E4:0.25/1 R:0.25 R:0.5  R:2  R R:0.5 R:0.25 E4:0.25/1  R:2  E4:0.75/1 G4:0.25/2 E4:0.5/1 R:0.5  R:2  R R:0.5 R:0.25 E4:0.25/1  R:2",
  [0,8],pos="free",
  lh="R:2  R:2  R:2  R:2  R:2  R C4:0.5/2 R:0.5  R:2  R R:0.5 D4:0.5/1  "
  "R R:0.25 D4:0.25/1 C4:0.5/2  A3:2/4  C4:0.5/2 G3:0.5/5 A3:0.25/4 C4:0.25/2 D4:0.25/1 R:0.25  D4:1.5/1 D4:0.5/1  R R:0.5 D4:0.25/1 C4:0.25/2  A3:2/4  "
  "C4:0.5/2 G3:0.5/5 A3:0.25/4 C4:0.25/2 D4:0.25/1 R:0.25  D4:2/1",lhpos="free",ts="2/4",arr=FOLK),
 # Tuần 27 — bài hai tay
 song("saints_both","When the Saints (hands together)","Các thánh tiến bước — hai tay","Spiritual (traditional)",27,"BOTH",
  "f R C4 E4 F4  G4:4  R C4 E4 F4  G4:4  R C4 E4 F4  G4:2 E4:2  C4:2 E4:2  D4:4  R E4 E4 D4  C4:3 C4  E4:2 G4 G4  F4:4  E4 F4 G4:2  E4:2 C4:2  D4:4  C4:4",[0,4,8,12],
  lh=f"{I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {V}:4  {I}:4  {I}:4  {IV}:4  {IV}:4  {I}:4  {I}:4  {V}:4  {I}:4"),
 song("oh_susanna_both","Oh! Susanna (hands together)","Ô Susanna — hai tay","Stephen Foster (1848)",27,"BOTH",
  "mf C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 C4 D4:2  C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 D4 C4:2",[0,4],"A4",
  lh=f"{I}:4  {I}:4  {I}:4  {V}:4  {I}:4  {I}:4  {I}:4  {V}:2 {I}:2"),
]

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
