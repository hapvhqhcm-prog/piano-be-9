# Sinh src/data/songs/*.json — chạy: PYTHONIOENCODING=utf-8 py scripts/gen-songs.py
# Cú pháp nốt:  E4        = nốt đen (1 phách), ngón lấy từ bảng thế tay
#               E4:1.5    = 1,5 phách       E4:2/3 = 2 phách, ngón 3 (ghi rõ — bắt buộc ở bài "free")
#               C3+E3+G3:4 = hợp âm (ngón theo thế tay)   C3+G3:4/5+1 = hợp âm, ngón ghi rõ
#               R:2       = dấu lặng 2 phách
# Sắc thái & kiểu đàn (v4, OWNER duyệt 2026-10-05):
#               p / mf / f  = token riêng: sắc thái từ nốt KẾ TIẾP trở đi (giữ tới khi đổi) → "dyn"
#               E4'       = ngắt tiếng (staccato) → "stac": true         (E4:0.5/2' cũng được)
#               (E4 … C4) = luyến: "(" trước nốt đầu, ")" sau nốt cuối → "slur": "start" / "end"
#   Quy ước: p/mf/f từ tuần 5 (trò "To hay nhỏ?"); ngắt/luyến từ tuần 10 (trò "Ngắt hay liền?").
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
 ("C5","RH"): {"C5":1,"D5":2,"E5":3,"F5":4,"G5":5},   # thế Đô cao (tuần 20)
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
    if any("dyn" in n for n in allv): assert week >= 5, (id, "p/mf/f chỉ từ tuần 5")
    if any("stac" in n or "slur" in n for n in allv): assert week >= 10, (id, "ngắt/luyến chỉ từ tuần 10")
    return d

ORIG = "Bài tự sáng tác cho app (piano-be-9)"
S = []
# ---------------------------------------------------------------- CẤP 1 (tuần 2–8)
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
 song("ode_to_joy_easy","Ode to Joy","Bài ca niềm vui","Ludwig van Beethoven",5,"RH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2",[0,4]),
 song("jingle_bells","Jingle Bells (chorus)","Chuông ngân vang","James Lord Pierpont (1857)",5,"RH",
  "f E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  mf F4 F4 F4 F4  F4 E4 E4 E4  E4 D4 D4 E4  D4:2 G4:2  f E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  G4 G4 F4 D4  C4:4",[0,4,8,12]),
 song("saints","When the Saints Go Marching In","Các thánh tiến bước","Spiritual (traditional)",5,"RH",
  "mf R C4 E4 F4  G4:4  R C4 E4 F4  G4:4  R C4 E4 F4  G4:2 E4:2  C4:2 E4:2  D4:4  f R E4 E4 D4  C4:3 C4  E4:2 G4 G4  F4:4  E4 F4 G4:2  E4:2 C4:2  D4:4  C4:4",[0,4,8,12]),
 song("largo_new_world","Largo — New World Symphony","Khúc Largo (Thế giới mới)","Antonín Dvořák (1893)",6,"RH",
  "p E4 G4 G4:2  E4 D4 C4:2  D4 E4 G4 E4  D4:4  E4 G4 G4:2  E4 D4 C4:2  D4 E4 D4 C4  C4:4",[0,4]),
 song("hot_cross_buns_lh","Hot Cross Buns (left hand)","Bánh nóng — tay trái","Dân ca Anh (traditional)",6,"LH",
  "f E3 D3 C3:2  p E3 D3 C3:2  mf C3:0.5 C3:0.5 C3:0.5 C3:0.5 D3:0.5 D3:0.5 D3:0.5 D3:0.5  f E3 D3 C3:2",[0,2]),
 song("mary_lamb_lh","Mary Had a Little Lamb (left hand)","Chú cừu nhỏ — tay trái","Dân ca Mỹ (traditional)",6,"LH",
  "E3 D3 C3 D3  E3 E3 E3:2  D3 D3 D3:2  E3 G3 G3:2  E3 D3 C3 D3  E3 E3 E3 E3  D3 D3 E3 D3  C3:4",[0,4]),
 song("au_clair_lh","Au clair de la lune (left hand)","Dưới ánh trăng — tay trái","Dân ca Pháp (traditional)",6,"LH",
  "C3 C3 C3 D3  E3:2 D3:2  C3 E3 D3 D3  C3:4  C3 C3 C3 D3  E3:2 D3:2  C3 E3 D3 D3  C3:4",[0,4]),
 song("frere_jacques_easy","Frère Jacques","Kìa con bướm vàng","Dân ca Pháp (traditional)",7,"RH",
  "f C4 D4 E4 C4  p C4 D4 E4 C4  f E4 F4 G4:2  p E4 F4 G4:2  f G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4  p G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4  f C4/2 G3/1 C4:2/2  p C4/2 G3/1 C4:2/2",[0,2,4,6],"A4"),
 song("london_bridge","London Bridge","Cầu London","Dân ca Anh (traditional)",7,"RH",
  "G4 A4 G4 F4  E4 F4 G4:2  D4 E4 F4:2  E4 F4 G4:2  G4 A4 G4 F4  E4 F4 G4:2  D4:2 G4:2  E4 C4:3",[0,4],"A4"),
 song("twinkle_easy","Twinkle Twinkle Little Star","Ngôi sao nhỏ","Dân ca Pháp \"Ah! vous dirai-je, maman\" (traditional)",7,"RH",
  "C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2  G4 G4 F4 F4  E4 E4 D4:2  G4 G4 F4 F4  E4 E4 D4:2  C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2",[0,4,8],"A4"),
 song("this_old_man","This Old Man","Ông lão vui tính","Dân ca Anh (traditional)",8,"RH",
  "G4 E4 G4:2  G4 E4 G4:2  A4 G4 F4 E4  D4 E4 F4:2  E4 F4 G4 C4  C4 C4 C4 D4  E4 F4 G4:2  G4 D4 D4 F4  E4 D4 C4:2",[0,4],"A4"),
 song("old_macdonald","Old MacDonald Had a Farm","Ông MacDonald có trang trại","Dân ca Mỹ (traditional)",8,"RH",
  "f F4 F4 F4 C4  D4 D4 C4:2  A4 A4 G4 G4  F4:3 C4  F4 F4 F4 C4  D4 D4 C4:2  A4 A4 G4 G4  F4:4",[0,4],"A4"),
 song("oh_susanna","Oh! Susanna","Ô Susanna","Stephen Foster (1848)",8,"RH",
  "mf C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 C4 D4:2  C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 D4 C4:2",[0,4],"A4"),
]
# ---------------------------------------------------------------- CẤP 2 (tuần 9–16): hai tay, thế mới, phím đen, nhịp
S += [
 # Tuần 9 — Đô giữa tay trái, khuông Fa, hai tay luân phiên
 song("au_clair_mc_lh","Au clair de la lune (middle C, left hand)","Dưới ánh trăng — Đô giữa tay trái","Dân ca Pháp (traditional)",9,"LH",
  "F3 F3 F3 G3  A3:2 G3:2  F3 A3 G3 G3  F3:4  F3 F3 F3 G3  A3:2 G3:2  F3 A3 G3 G3  F3:4",[0,4],pos="MC"),
 song("mary_mc_lh","Mary Had a Little Lamb (middle C, left hand)","Chú cừu nhỏ — Đô giữa tay trái","Dân ca Mỹ (traditional)",9,"LH",
  "A3 G3 F3 G3  A3 A3 A3:2  G3 G3 G3:2  A3 C4 C4:2  A3 G3 F3 G3  A3 A3 A3 A3  G3 G3 A3 G3  F3:4",[0,4],pos="MC"),
 song("question_answer","Question and Answer","Hỏi – Đáp (hai tay luân phiên)",ORIG,9,"BOTH",
  "f C4 D4 E4 F4  G4:2 E4:2  R:4  R:4  G4 F4 E4 D4  E4:2 C4:2  R:4  R:4",[0,4],
  lh="p R:4  R:4  C4 B3 A3 G3  F3:4  R:4  R:4  G3 A3 B3 G3  C4:4",lhpos="MC",arr=ORIG),
 # Tuần 10 — hai tay cùng lúc (tay trái giữ nốt dài)
 song("hot_cross_buns_both","Hot Cross Buns (hands together)","Bánh nóng — hai tay","Dân ca Anh (traditional)",10,"BOTH",
  "E4 D4 C4:2  E4 D4 C4:2  C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5  E4 D4 C4:2",[0,2],
  lh="C3:4  C3:4  G3:4  C3:4"),
 song("ode_to_joy_both","Ode to Joy (hands together)","Bài ca niềm vui — hai tay","Ludwig van Beethoven",10,"BOTH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2",[0,4],
  lh="C3:4  G3:4  C3:4  G3:4  C3:4  G3:4  C3:4  G3:2 C3:2"),
 # Tuần 10 — kiểu đàn NGẮT: bài tự sáng tác (thay "Chú cừu — hai tay", OWNER duyệt 2026-10-05)
 song("robot_march","Robot March","Rô-bốt đi đều",ORIG,10,"RH",
  "f C4' E4' G4' E4'  C4' E4' G4:2  D4' F4' D4' F4'  E4' D4' C4:2  p G4' G4' E4' E4'  F4' F4' D4:2  f E4' F4' G4' F4'  E4' D4' C4' R",[0,4],arr=ORIG),
 # Tuần 11 — thế Sol
 song("ode_to_joy_g","Ode to Joy (G position)","Bài ca niềm vui — thế Sol","Ludwig van Beethoven",11,"RH",
  "B4 B4 C5 D5  D5 C5 B4 A4  G4 G4 A4 B4  B4 A4 A4:2  B4 B4 C5 D5  D5 C5 B4 A4  G4 G4 A4 B4  A4 G4 G4:2",[0,4],pos="G"),
 song("lightly_row_g","Lightly Row (G position)","Chèo thuyền nhẹ — thế Sol","Dân ca Đức (traditional)",11,"RH",
  "mf D5 B4 B4:2  C5 A4 A4:2  (G4 A4 B4 C5)  D5 D5 D5:2  D5 B4 B4:2  C5 A4 A4:2  G4 B4 D5 D5  G4:4",[0,4],pos="G"),
 song("aunt_rhody_g","Go Tell Aunt Rhody (G position)","Đi báo cô Rhody — thế Sol","Dân ca Mỹ (traditional)",11,"RH",
  "B4:2 B4 A4  G4:2 G4:2  A4:2 A4 C5  B4 A4 G4:2  D5:2 D5 C5  B4:2 B4:2  A4 G4 A4 B4  G4:4",[0,4],pos="G"),
 song("hot_cross_buns_g_lh","Hot Cross Buns (G position, left hand)","Bánh nóng — thế Sol tay trái","Dân ca Anh (traditional)",11,"LH",
  "f B2 A2 G2:2  p B2 A2 G2:2  mf G2:0.5 G2:0.5 G2:0.5 G2:0.5 A2:0.5 A2:0.5 A2:0.5 A2:0.5  f B2 A2 G2:2",[0,2],pos="G"),
 # Tuần 12 — nhịp 3/4
 song("waltz_cat","Little Cat Waltz","Điệu valse con mèo",ORIG,12,"RH",
  "mf C4 E4 G4  G4:3  F4 D4 F4  F4:3  E4 C4 E4  G4 F4 E4  D4 E4 D4  C4:3",[0,4],ts="3/4",arr=ORIG),
 song("waltz_rain","Rain Waltz","Điệu valse mưa rơi",ORIG,12,"RH",
  "p (G4 E4 C4  D4:3)  (E4 F4 G4  E4:3)  (G4 E4 C4  D4:2 E4)  (D4 C4 D4  C4:3)",[0,4],ts="3/4",arr=ORIG),
 song("birthday_both","Good Morning to All (Happy Birthday melody)","Chúc mừng sinh nhật","Mildred & Patty Hill (1893)",12,"BOTH",
  # Nhịp lấy đà: "Hap-py" ở phách 3 (ô 1 bắt đầu bằng 2 phách lặng) → "BIRTH" rơi đúng phách mạnh.
  # Câu 1 trọn tay trái; các câu sau mỗi tay một cụm liền (không đổi tay giữa cụm).
  "mf R:3  R:3  R:3  R:2 D4  C4:2 R  G4 E4 R  R:2 F4:0.5 F4:0.5  E4 C4 D4  C4:2 R",[0,5],
  lh="mf R:2 G3:0.5 G3:0.5  A3 G3 C4  B3:2 G3:0.5 G3:0.5  A3 G3 R  R:2 G3:0.5 G3:0.5  R:2 C4  B3 A3 R  R:3  R:3",lhpos="MC",ts="3/4"),
 # Tuần 13 — phím đen: thế Rê (Fa thăng), Đô thứ (Mi giáng)
 song("ode_to_joy_d","Ode to Joy (D position)","Bài ca niềm vui — thế Rê (Fa♯)","Ludwig van Beethoven",13,"RH",
  "mf F#4 F#4 G4 A4  A4 G4 F#4 E4  D4 D4 E4 F#4  F#4 E4 E4:2  F#4 F#4 G4 A4  A4 G4 F#4 E4  D4 D4 E4 F#4  E4 D4 D4:2",[0,4],pos="D"),
 song("frere_jacques_minor","Frère Jacques (minor)","Kìa con bướm vàng — giọng thứ (Mi♭)","Dân ca Pháp (traditional)",13,"RH",
  # Câu 3 "G Ab G F": tay dịch lên một phím (ngón 4 Sol, ngón 5 La♭); câu cuối ngón cái duỗi xuống Sol trầm (G3)
  "p C4/1 D4/2 Eb4/3 C4/1  C4/1 D4/2 Eb4/3 C4/1  Eb4/3 F4/4 G4:2/5  Eb4/3 F4/4 G4:2/5  "
  "G4:0.5/4 Ab4:0.5/5 G4:0.5/4 F4:0.5/3 Eb4/2 C4/1  G4:0.5/4 Ab4:0.5/5 G4:0.5/4 F4:0.5/3 Eb4/2 C4/1  "
  "C4/2 G3/1 C4:2/2  C4/2 G3/1 C4:2/2",[0,2,4,6],pos="free"),
 # Tuần 13 — bài tự sáng tác ở thế Rê (thay "Chú cừu — thế Rê"): nhảy Rê–Fa♯–La, đàn TO
 song("superhero_fly","Superhero Takes Off","Siêu nhân bay",ORIG,13,"RH",
  "f D4 F#4 A4:2  A4 G4 F#4 E4  D4 F#4 A4:2  A4:4  mf G4 E4 G4 E4  F#4 D4 F#4 D4  f E4 F#4 G4 E4  D4 A4 D4:2",[0,4],pos="D",arr=ORIG),
 # Tuần 14 — nhịp chấm dôi & móc đơn
 song("ode_to_joy_original","Ode to Joy (original rhythm)","Bài ca niềm vui — nhịp chấm dôi","Ludwig van Beethoven",14,"RH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4:1.5 D4:0.5 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4:1.5 C4:0.5 C4:2",[0,4]),
 song("london_bridge_dotted","London Bridge (dotted rhythm)","Cầu London — nhịp chấm dôi","Dân ca Anh (traditional)",14,"RH",
  "f G4:1.5 A4:0.5 G4 F4  E4 F4 G4:2  D4 E4 F4:2  E4 F4 G4:2  G4:1.5 A4:0.5 G4 F4  E4 F4 G4:2  D4:2 G4:2  E4 C4:3",[0,4],"A4"),
 song("twinkle_run","Twinkle variation (running)","Ngôi sao nhỏ — biến tấu Chạy-chạy","Dân ca Pháp (traditional)",14,"RH",
  "mf C4:0.5 C4:0.5 C4:0.5 C4:0.5 G4:0.5 G4:0.5 G4:0.5 G4:0.5  A4:0.5 A4:0.5 A4:0.5 A4:0.5 G4:2  F4:0.5 F4:0.5 F4:0.5 F4:0.5 E4:0.5 E4:0.5 E4:0.5 E4:0.5  D4:0.5 D4:0.5 D4:0.5 D4:0.5 C4:2",[0,2],"A4"),
 # Tuần 15 — gam Đô trưởng, luồn ngón cái
 song("scale_c_rh","C major scale (right hand)","Gam Đô trưởng — tay phải","Bài tập (traditional)",15,"RH",
  "mf (C4/1 D4/2 E4/3 F4/1  G4/2 A4/3 B4/4 C5/5)  (C5/5 B4/4 A4/3 G4/2  F4/1 E4/3 D4/2 C4/1)",[0,2],pos="free",arr=ORIG),
 song("scale_c_lh","C major scale (left hand)","Gam Đô trưởng — tay trái","Bài tập (traditional)",15,"LH",
  "mf (C3/5 D3/4 E3/3 F3/2  G3/1 A3/3 B3/2 C4/1)  (C4/1 B3/2 A3/3 G3/1  F3/2 E3/3 D3/4 C3/5)",[0,2],pos="free",arr=ORIG),
 song("joy_to_the_world","Joy to the World","Niềm vui cho thế giới","Lowell Mason (1839), theo G. F. Handel",15,"RH",
  "f C5:2/5 B4:1.5/4 A4:0.5/3  G4:3/2 F4/1  E4:2/3 D4:2/2  C4:4/1  C5:2/5 B4:1.5/4 A4:0.5/3  G4:3/2 F4/1  E4:2/3 D4:2/2  C4:4/1",[0,4],pos="free"),
]
# ---------------------------------------------------------------- CẤP 3 (tuần 17–25): hợp âm, đổi thế, nốt cao, cổ điển
I = "C3+E3+G3"; IV = "C3+F3"; V = "D3+G3"
S += [
 # Tuần 17 — hợp âm tay trái
 song("twinkle_both","Twinkle Twinkle (hands together, chords)","Ngôi sao nhỏ — hai tay hợp âm","Dân ca Pháp (traditional)",17,"BOTH",
  "mf C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2  G4 G4 F4 F4  E4 E4 D4:2  G4 G4 F4 F4  E4 E4 D4:2  p C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2",[0,4,8],"A4",
  lh=f"{I}:4  {IV}:2 {I}:2  {IV}:2 {I}:2  {V}:2 {I}:2  {I}:2 {IV}:2  {I}:2 {V}:2  {I}:2 {IV}:2  {I}:2 {V}:2  {I}:4  {IV}:2 {I}:2  {IV}:2 {I}:2  {V}:2 {I}:2"),
 song("ode_to_joy_chords","Ode to Joy (hands together, chords)","Bài ca niềm vui — hai tay hợp âm","Ludwig van Beethoven",17,"BOTH",
  "mf E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2",[0,4],
  lh=f"{I}:4  {V}:4  {I}:4  {V}:4  {I}:4  {V}:4  {I}:4  {V}:2 {I}:2"),
 song("jingle_bells_both","Jingle Bells (hands together)","Chuông ngân vang — hai tay","James Lord Pierpont (1857)",17,"BOTH",
  "f E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  E4 D4 D4 E4  D4:2 G4:2  E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  G4 G4 F4 D4  C4:4",[0,4,8,12],
  lh=f"{I}:4  {I}:4  {I}:4  {I}:4  {IV}:4  {I}:4  {V}:4  {V}:4  {I}:4  {I}:4  {I}:4  {I}:4  {IV}:4  {I}:4  {V}:4  {I}:4"),
 # Tuần 18 — đổi thế tay
 song("silent_night","Silent Night","Đêm thánh vô cùng","Franz Xaver Gruber (1818)",18,"RH",
  # Đổi thế (luôn ở nốt dài): thế Mi (E1 G2 A3 B4 C5) → thế Sol (G1…D5) → thế Mi → thế Si (B1 C2 D3 E4 F5)
  # → "sleep in heavenly peace": thế Sol, ngón 3 vắt qua xuống Mi (như gam đi xuống) → thế Đô, kết ở Đô.
  "p (G4:1.5/2 A4:0.5/3 G4/2)  E4:3/1  (G4:1.5/2 A4:0.5/3 G4/2)  E4:3/1  D5:2/5 D5/5  B4:3/3  C5:2/4 C5/4  G4:3/1  "
  "mf A4:2/3 A4/3  C5:1.5/5 B4:0.5/4 A4/3  G4:1.5/2 A4:0.5/3 G4/2  E4:3/1  A4:2/3 A4/3  C5:1.5/5 B4:0.5/4 A4/3  G4:1.5/2 A4:0.5/3 G4/2  E4:3/1  "
  "p D5:2/3 D5/3  F5:1.5/5 D5:0.5/3 B4/1  C5:3/2  E5:3/4  C5:1.5/4 G4:0.5/1 E4/3  G4:1.5/5 F4:0.5/4 D4/2  C4:3/1",[0,4,8,12,16,20],pos="free",ts="3/4"),
 # Tuần 19 — trưởng & thứ: bài tự sáng tác giọng La thứ (thay "Bài ca niềm vui — La thứ"): NHỎ, NGẮT, ô cuối TO
 song("ninja_tiptoe","Tiptoe Ninja","Ninja rón rén",ORIG,19,"RH",
  "p A3' A3' C4' A3'  B3' B3' D4' B3'  A3' C4' E4' C4'  B3:2 R:2  A3' A3' C4' A3'  B3' D4' C4' B3'  "
  "C4:0.5' B3:0.5' A3:0.5' B3:0.5' C4' D4'  f E4' R A3' R",[0,4],pos="Am",arr=ORIG),
 # Tuần 20 — đọc nốt cao: bài tự sáng tác ở thế Đô cao (Đô5–Sol5), LIỀN và NHỎ
 song("drifting_boat","Drifting Boat","Thuyền trôi",ORIG,20,"RH",
  "p (E5:2 D5  C5:2 D5  E5 F5 G5  E5:3)  mf (G5:2 F5  E5:2 D5  p F5 E5 D5  C5:3)",[0,4],pos="C5",ts="3/4",arr=ORIG),
 # Tuần 21 — Minuet (sắc thái/kiểu đàn theo cách đàn phổ biến — bản gốc không ghi)
 song("minuet_g","Minuet in G (BWV Anh. 114)","Minuet Sol trưởng","Christian Petzold (khoảng 1725)",21,"RH",
  "mf D5/5 (G4:0.5/1 A4:0.5/2 B4:0.5/3 C5:0.5/4)  D5/5 G4/1' G4/1'  E5/3 (C5:0.5/1 D5:0.5/2 E5:0.5/3 F#5:0.5/4)  G5/5 G4/1' G4/1'  C5/4 (D5:0.5/5 C5:0.5/4 B4:0.5/3 A4:0.5/2)  B4/3 (C5:0.5/4 B4:0.5/3 A4:0.5/2 G4:0.5/1)  F#4/1 (G4:0.5/2 A4:0.5/3 B4:0.5/4 G4:0.5/2)  A4:3/3",[0,4],pos="free",ts="3/4"),
 # Tuần 22 — Für Elise
 song("fur_elise","Für Elise (opening)","Für Elise (đoạn mở đầu)","Ludwig van Beethoven (1810)",22,"RH",
  # Mỗi ô 3/4 = một ô 3/8 của bản gốc (móc kép = nửa phách). "Mi–Rê♯" là nhịp lấy đà (phách 3 của ô 0).
  "p R:2 E5:0.5/5 D#5:0.5/4  E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3  A4/1 R:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/4  "
  "B4/5 R:0.5 E4:0.5/1 G#4:0.5/3 B4:0.5/4  C5/5 R:0.5 E4:0.5/1 E5:0.5/5 D#5:0.5/4  "
  "E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3  A4/1 R:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/4  "
  "B4/5 R:0.5 E4:0.5/1 C5:0.5/5 B4:0.5/4  A4:2/3 R",[0,5],pos="free",ts="3/4"),
 # Tuần 23 — Canon (hai tay, đọc hai khóa)
 song("canon","Canon in D (theme, simplified in C)","Khúc Canon (giản lược)","Johann Pachelbel (khoảng 1680)",23,"BOTH",
  # Tay phải: ngón cái ở La suốt bài (La1 Si2 Đô3 Rê4 Mi5); Sol bằng ngón 3 VẮT qua ngón cái rồi ngón cái luồn về La (như gam).
  # Tay trái: thế Đô mở rộng Đô3–La3 (Đô5 Mi4 Fa3 Sol2 La1) — không nhảy ngón cái.
  "p E5:2/5 D5:2/4  C5:2/3 B4:2/2  A4:2/1 G4:2/3  A4:2/1 B4:2/2  E5:2/5 D5:2/4  C5:2/3 B4:2/2  A4:2/1 G4:2/3  A4:2/1 G4:2/3",[0,4],pos="free",
  lh="p C3:2/5 G3:2/2  A3:2/1 E3:2/4  F3:2/3 C3:2/5  F3:2/3 G3:2/2  C3:2/5 G3:2/2  A3:2/1 E3:2/4  F3:2/3 C3:2/5  F3:2/3 C3:2/5",lhpos="free"),
 # Tuần 24 — bài hai tay
 song("saints_both","When the Saints (hands together)","Các thánh tiến bước — hai tay","Spiritual (traditional)",24,"BOTH",
  "f R C4 E4 F4  G4:4  R C4 E4 F4  G4:4  R C4 E4 F4  G4:2 E4:2  C4:2 E4:2  D4:4  R E4 E4 D4  C4:3 C4  E4:2 G4 G4  F4:4  E4 F4 G4:2  E4:2 C4:2  D4:4  C4:4",[0,4,8,12],
  lh=f"{I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {I}:4  {V}:4  {I}:4  {I}:4  {IV}:4  {IV}:4  {I}:4  {I}:4  {V}:4  {I}:4"),
 song("oh_susanna_both","Oh! Susanna (hands together)","Ô Susanna — hai tay","Stephen Foster (1848)",24,"BOTH",
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
    with open(f"src/data/songs/{d['id']}.json", "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1); fh.write("\n")
    print(f"{d['id']:24} w{d['week']:<2} {d['hand']:4} {d.get('position','C'):4} {beats[0]//per:>3} ô nhịp")
print(len(S), "bài")
