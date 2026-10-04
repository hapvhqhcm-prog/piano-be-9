import json
RH = {"C4":1,"D4":2,"E4":3,"F4":4,"G4":5,"A4":5}
LH = {"C3":5,"D3":4,"E3":3,"F3":2,"G3":1}
def notes(seq, hand):
    F = RH if hand=="RH" else LH
    out=[]
    for tok in seq.split():
        p,_,b = tok.partition(":")
        beats = float(b) if b else 1.0
        beats = int(beats) if beats==int(beats) else beats
        if p=="R": out.append({"rest":True,"beats":beats})
        else: out.append({"pitch":p,"beats":beats,"finger":F[p]})
    return out
E="Original simple 5-finger arrangement for this app"
S=[
 # id, title, titleVi, composer, hand, week, extension, phrases(measure starts), seq
 ("hot_cross_buns","Hot Cross Buns","Bánh nóng","Dân ca Anh (traditional)","RH",2,None,[0,2],
  "E4 D4 C4:2  E4 D4 C4:2  C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5  E4 D4 C4:2"),
 ("mary_lamb","Mary Had a Little Lamb","Chú cừu nhỏ","Dân ca Mỹ (traditional)","RH",3,None,[0,4],
  "E4 D4 C4 D4  E4 E4 E4:2  D4 D4 D4:2  E4 G4 G4:2  E4 D4 C4 D4  E4 E4 E4 E4  D4 D4 E4 D4  C4:4"),
 ("au_clair","Au clair de la lune","Dưới ánh trăng","Dân ca Pháp (traditional)","RH",3,None,[0,4],
  "C4 C4 C4 D4  E4:2 D4:2  C4 E4 D4 D4  C4:4  C4 C4 C4 D4  E4:2 D4:2  C4 E4 D4 D4  C4:4"),
 ("go_tell_aunt_rhody","Go Tell Aunt Rhody","Đi báo cô Rhody","Dân ca Mỹ (traditional)","RH",4,None,[0,2,4,6],
  "E4:2 E4 D4  C4:2 C4:2  D4:2 D4 F4  E4 D4 C4:2  G4:2 G4 F4  E4:2 E4:2  D4 C4 D4 E4  C4:4"),
 ("lightly_row","Lightly Row","Chèo thuyền nhẹ","Dân ca Đức (traditional)","RH",4,None,[0,4],
  "G4 E4 E4:2  F4 D4 D4:2  C4 D4 E4 F4  G4 G4 G4:2  G4 E4 E4:2  F4 D4 D4:2  C4 E4 G4 G4  C4:4"),
 ("ode_to_joy_easy","Ode to Joy","Bài ca niềm vui","Ludwig van Beethoven","RH",5,None,[0,4],
  "E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4 D4 D4:2  E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4 C4 C4:2"),
 ("jingle_bells","Jingle Bells (chorus)","Chuông ngân vang","James Lord Pierpont (1857)","RH",5,None,[0,4,8,12],
  "E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  E4 D4 D4 E4  D4:2 G4:2  E4 E4 E4:2  E4 E4 E4:2  E4 G4 C4 D4  E4:4  F4 F4 F4 F4  F4 E4 E4 E4  G4 G4 F4 D4  C4:4"),
 ("saints","When the Saints Go Marching In","Các thánh tiến bước","Spiritual (traditional)","RH",5,None,[0,4,8,12],
  "R C4 E4 F4  G4:4  R C4 E4 F4  G4:4  R C4 E4 F4  G4:2 E4:2  C4:2 E4:2  D4:4  R E4 E4 D4  C4:3 C4  E4:2 G4 G4  F4:4  E4 F4 G4:2  E4:2 C4:2  D4:4  C4:4"),
 ("largo_new_world","Largo — New World Symphony","Khúc Largo (Thế giới mới)","Antonín Dvořák (1893)","RH",6,None,[0,4],
  "E4 G4 G4:2  E4 D4 C4:2  D4 E4 G4 E4  D4:4  E4 G4 G4:2  E4 D4 C4:2  D4 E4 D4 C4  C4:4"),
 ("hot_cross_buns_lh","Hot Cross Buns (left hand)","Bánh nóng — tay trái","Dân ca Anh (traditional)","LH",6,None,[0,2],
  "E3 D3 C3:2  E3 D3 C3:2  C3:0.5 C3:0.5 C3:0.5 C3:0.5 D3:0.5 D3:0.5 D3:0.5 D3:0.5  E3 D3 C3:2"),
 ("mary_lamb_lh","Mary Had a Little Lamb (left hand)","Chú cừu nhỏ — tay trái","Dân ca Mỹ (traditional)","LH",6,None,[0,4],
  "E3 D3 C3 D3  E3 E3 E3:2  D3 D3 D3:2  E3 G3 G3:2  E3 D3 C3 D3  E3 E3 E3 E3  D3 D3 E3 D3  C3:4"),
 ("au_clair_lh","Au clair de la lune (left hand)","Dưới ánh trăng — tay trái","Dân ca Pháp (traditional)","LH",6,None,[0,4],
  "C3 C3 C3 D3  E3:2 D3:2  C3 E3 D3 D3  C3:4  C3 C3 C3 D3  E3:2 D3:2  C3 E3 D3 D3  C3:4"),
 ("frere_jacques_easy","Frère Jacques","Kìa con bướm vàng","Dân ca Pháp (traditional)","RH",7,"A4",[0,2,4,6],
  "C4 D4 E4 C4  C4 D4 E4 C4  E4 F4 G4:2  E4 F4 G4:2  G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4  G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4  C4 G4 C4:2  C4 G4 C4:2"),
 ("london_bridge","London Bridge","Cầu London","Dân ca Anh (traditional)","RH",7,"A4",[0,4],
  "G4 A4 G4 F4  E4 F4 G4:2  D4 E4 F4:2  E4 F4 G4:2  G4 A4 G4 F4  E4 F4 G4:2  D4:2 G4:2  E4 C4:3"),
 ("twinkle_easy","Twinkle Twinkle Little Star","Ngôi sao nhỏ","Dân ca Pháp \"Ah! vous dirai-je, maman\" (traditional)","RH",7,"A4",[0,4,8],
  "C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2  G4 G4 F4 F4  E4 E4 D4:2  G4 G4 F4 F4  E4 E4 D4:2  C4 C4 G4 G4  A4 A4 G4:2  F4 F4 E4 E4  D4 D4 C4:2"),
 ("this_old_man","This Old Man","Ông lão vui tính","Dân ca Anh (traditional)","RH",8,"A4",[0,4],
  "G4 E4 G4:2  G4 E4 G4:2  A4 G4 F4 E4  D4 E4 F4:2  E4 F4 G4 C4  C4 C4 C4 D4  E4 F4 G4:2  G4 D4 D4 F4  E4 D4 C4:2"),
 ("old_macdonald","Old MacDonald Had a Farm","Ông MacDonald có trang trại","Dân ca Mỹ (traditional)","RH",8,"A4",[0,4],
  "F4 F4 F4 C4  D4 D4 C4:2  A4 A4 G4 G4  F4:3 C4  F4 F4 F4 C4  D4 D4 C4:2  A4 A4 G4 G4  F4:4"),
 ("oh_susanna","Oh! Susanna","Ô Susanna","Stephen Foster (1848)","RH",8,"A4",[0,4],
  "C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 C4 D4:2  C4 D4 E4 G4  G4 A4 G4 E4  C4 D4 E4 E4  D4 D4 C4:2"),
]
for (sid,t,tv,comp,hand,week,ext,phr,seq) in S:
    d={"id":sid,"title":t,"titleVi":tv,"composer":comp,"sourceStatus":"public-domain","arrangementBy":E,
       "attributionRequired":False,"hand":hand,"bpm":60,"timeSignature":"4/4","week":week}
    if ext: d["extension"]=ext
    d["phrases"]=phr
    d["notes"]=notes(seq,hand)
    tot=sum(n["beats"] for n in d["notes"])
    assert tot%4==0,(sid,tot)
    with open(f"src/data/songs/{sid}.json","w",encoding="utf-8") as f:
        json.dump(d,f,ensure_ascii=False,indent=1); f.write("\n")
    print(f"{sid:22} w{week} {hand} {int(tot//4)} ô nhịp, {len(d['notes'])} nốt")
