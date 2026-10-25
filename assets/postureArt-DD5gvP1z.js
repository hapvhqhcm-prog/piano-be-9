import{a4 as p,P as t,H as z,X as w}from"./index-Jo0INxx0.js";import{a as H}from"./diagramKit-cFiMD_oO.js";const q="http://www.w3.org/2000/svg",k="rgba(61,52,102,.38)",n="#4a3268",c={base:"#ffd5b5",light:"#fff3ea"},a="#e8574a",A="84 0 280 244",g=(e,i,r)=>`<path d="${e}" fill="none" stroke="${n}" stroke-width="${r+3.4}" stroke-linecap="round" stroke-linejoin="round"/><path d="${e}" fill="none" stroke="${i}" stroke-width="${r}" stroke-linecap="round" stroke-linejoin="round"/>`,y=(e,i)=>`<path class="pz-glow" d="${e}" fill="none" stroke="${t.good}" stroke-width="${i}" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/>`,l=(e,i,r,o)=>{const s=r.length*5.6+12;return`<g class="pz-pop"><rect x="${e-s/2}" y="${i-9}" width="${s}" height="14" rx="7" fill="#fff" stroke="${o}" stroke-width="1.3"/><text x="${e}" y="${i+1.6}" font-size="10" font-weight="800" font-family="Baloo 2, Nunito, sans-serif" fill="${o}" text-anchor="middle">${r}</text></g>`},P=(e,i)=>`<g transform="translate(${e} ${i})"><circle r="12" fill="${a}" stroke="#fff" stroke-width="3"/><path d="M-4.4 -4.4 L4.4 4.4 M4.4 -4.4 L-4.4 4.4" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></g>`;function S(e,i={}){const r=e==="sit",o=r&&i.variant==="bad",s=h=>e===h||e==="all",f=p("pz-wood"),x=p("pz-shirt"),u=p("pz-wall"),M=p("pz-bub"),v=s("hands")?D():"",$=r&&!o?8:0,b=o?-16:0;let m="";for(let h=1;h<8;h++){const d=222+h*5.5;m+=`M${d} 147 L${d+4.6} 139 `}const V=[1,2,4,5,6].map(h=>{const d=222+h*5.5+2.9;return`<path d="M${d-1.6} 142.6 L${d+1.6} 142.6 L${d+3.6} 139 L${d+.4} 139 Z" fill="${t.night}"/>`}).join(""),Z=o?"M142 108 L178 128 L224 138":"M158 106 L174 134 L224 138",G=o?"M142 108 L152 114":"M158 106 L165 121",j=r?o?"M197 160 L202 196":"M197 160 L199 205":"M197 160 L199 216",L=r?o?"translate(4 -24)":"translate(0 -11)":"",B=o?"M137 158 Q126 124 144 101 Q151 94 160 96 Q173 100 172 116 L170 158 Z":"M137 158 Q131 130 137 106 Q142 94 157 94 Q172 96 172 114 L170 158 Z",Q=o?"translate(5 7)":"";return`
    <style>
      .pz-glow { animation: pz-pulse 1.3s ease-in-out infinite; }
      .pz-pop { animation: pz-pop .5s cubic-bezier(.3,1.6,.5,1) both; transform-box: fill-box; transform-origin: center; }
      @keyframes pz-pulse { 50% { opacity: .12; } }
      @keyframes pz-pop { from { transform: scale(.2); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .pz-glow, .pz-pop { animation: none; } }
    </style>
    <defs>
      <linearGradient id="${f}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#a8673f"/><stop offset="1" stop-color="#7d4a2c"/>
      </linearGradient>
      <linearGradient id="${x}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${t.violet}"/><stop offset="1" stop-color="${t.indigo}"/>
      </linearGradient>
      <clipPath id="${M}"><circle cx="218" cy="38" r="29.5"/></clipPath>
      <linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${o?"#fff1ef":r?"#ecfaf3":"#f3eeff"}"/><stop offset="1" stop-color="#fff6ea"/>
      </linearGradient>
    </defs>

    <!-- phông nền + sàn gỗ + thảm -->
    <rect x="88" y="4" width="272" height="236" rx="26" fill="url(#${u})"/>
    <path d="M88 228 H360 V214 Q360 240 334 240 H114 Q88 240 88 214 Z" fill="#f1d6ae"/>
    <path d="M88 228 H360" stroke="#e2bf8f" stroke-width="2"/>
    <ellipse cx="160" cy="230" rx="66" ry="5" fill="${t.lavender}" stroke="${k}" stroke-width="1"/>

    <!-- đàn piano đứng -->
    <g stroke="${k}" stroke-width="1.3" stroke-linejoin="round">
      <rect x="262" y="44" width="80" height="186" rx="6" fill="url(#${f})"/>
      <rect x="268" y="56" width="66" height="70" rx="6" fill="#ffffff" fill-opacity=".1"/>
      <rect x="268" y="176" width="66" height="44" rx="6" fill="#ffffff" fill-opacity=".1"/>
      <rect x="254" y="35" width="96" height="12" rx="5" fill="#6d3f25"/>
      <rect x="222" y="146" width="44" height="21" rx="3" fill="#8a5332"/>
      <path d="M222 147 L266 147 L270.6 139 L226.6 139 Z" fill="#fff"/>
      <path d="${m}" stroke="#b9b2d8" stroke-width=".8"/>
      ${V}
      <rect x="229" y="167" width="8" height="61" rx="3" fill="#7d4a2c"/>
      <rect x="226" y="224" width="14" height="6" rx="2" fill="${t.sun}"/>
      <rect x="250" y="222" width="12" height="4" rx="2" fill="${t.sun}"/>
      <!-- giá nhạc + iPad -->
      <rect x="244" y="131" width="20" height="5" rx="2" fill="#6d3f25"/>
      <g transform="rotate(10 256 134)">
        <rect x="231" y="86" width="34" height="48" rx="6" fill="${t.night}"/>
        <rect x="234.5" y="90" width="27" height="40" rx="3" fill="#eaf6ff" stroke="none"/>
        <path d="M237 102 H259 M237 106 H259 M237 110 H259 M237 114 H259 M237 118 H259" stroke="#9fb4d8" stroke-width=".8"/>
        ${z(244,114,2.6,t.coral)}${z(253,108,2.6,t.indigo)}
      </g>
      <!-- máy đếm nhịp trên nóc đàn -->
      <path d="M292 35 L299 13 H305 L312 35 Z" fill="${t.mint}"/>
      <path d="M302 31 L308 16" stroke="${t.ink}" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="306" cy="20" r="2" fill="${t.sun}"/>
    </g>

    ${r&&!o?`<!-- hộp kê chân -->
    <g stroke="${k}" stroke-width="1.3"><rect x="180" y="214" width="50" height="14" rx="3" fill="${t.wood}"/><path d="M184 218 H226" stroke="${t.woodDark}" stroke-width="1.2"/></g>`:""}

    <g${b?` transform="translate(${b} 0)"`:""}>
    <!-- ghế đàn -->
    <g stroke="${k}" stroke-width="1.3">
      <rect x="110" y="${170+$}" width="7" height="${58-$}" rx="3" fill="#8a5332"/>
      <rect x="167" y="${170+$}" width="7" height="${58-$}" rx="3" fill="#8a5332"/>
      <rect x="104" y="${166+$}" width="76" height="7" rx="3" fill="#a8673f"/>
      <rect x="100" y="${156+$}" width="84" height="12" rx="6" fill="${t.mint}"/>
      ${r&&!o?`<rect x="106" y="153" width="70" height="12" rx="6" fill="${t.sunLight}"/><path d="M114 159 H168" stroke="${t.sun}" stroke-width="1.4" stroke-dasharray="3 3"/>`:""}
    </g>

    <!-- vầng sáng nhắc (dưới hình bé) -->
    ${s("back")?y("M134 156 Q130 128 136 102 Q140 92 150 90",14):""}
    ${s("feet")?y("M188 225 H222",16)+y("M196 168 L198 216",22):""}
    ${s("hands")?y("M170 138 L226 138 Q238 128 248 142",20):""}

    <!-- bé: chân -->
    ${g("M146 150 L196 156","#3f3a9e",21)}
    ${g(j,"#3f3a9e",16)}
    <g stroke="${k}" stroke-width="1.3"${L?` transform="${L}"`:""}>
      <path d="M187 229 V221 Q187 214 195 214 H201 Q207 214 212 218 L219 222 Q224 225 224 229 Z" fill="${t.coral}"/>
      <rect x="186" y="226.5" width="39" height="3.5" rx="1.7" fill="#fff"/>
    </g>

    <!-- bé: thân (áo) -->
    <path d="${B}" fill="url(#${x})" stroke="${n}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M147 132 l2.6 5.2 5.8 .8 -4.2 4 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.2 -4 5.8 -.8 Z" fill="${t.sun}" transform="translate(6 -6)"/>

    <!-- bé: đầu -->
    <g${Q?` transform="${Q}"`:""}>
    <rect x="153" y="84" width="12" height="14" rx="5" fill="${c.base}" stroke="${n}" stroke-width="1.5"/>
    <circle cx="163" cy="64" r="25" fill="${c.base}" stroke="${n}" stroke-width="1.7"/>
    <path d="M187 61 q5 3 1 8" fill="${c.base}" stroke="${n}" stroke-width="1.5"/>
    <path d="M139 70 Q133 40 160 38 Q184 37 189 56 Q178 50 168 53 Q161 47 152 53 Q147 59 148 72 Z" fill="${t.hair}"/>
    <path d="M160 39 q4 -9 12 -7 q-6 2 -6 7" fill="${t.hair}"/>
    <circle cx="150" cy="70" r="5" fill="${c.base}" stroke="${n}" stroke-width="1.4"/>
    <ellipse cx="176" cy="63" rx="3.1" ry="4" fill="${t.night}"/><circle cx="177.2" cy="61.6" r="1.1" fill="#fff"/>
    <path d="M171 54.5 q5 -3 9 0" fill="none" stroke="${t.hair}" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="174" cy="73" rx="5" ry="3.2" fill="#ff9fb6" opacity=".7"/>
    <path d="${o?"M176 79 q5 -2.5 9 0":"M176 78 q5 3.5 9 -1"}" fill="none" stroke="#c2324d" stroke-width="2.2" stroke-linecap="round"/>
    </g>
    </g>

    <!-- bé: tay (vai → khuỷu → cổ tay ngang phím) -->
    ${g(Z,c.base,11)}
    ${g(G,t.violet,16)}
    <!-- (2026-10-18) bàn tay = "găng" tròn đơn giản trên phím (không vẽ ngón) -->
    <path d="M219 140 Q219 128.5 232 128.5 Q246 128.5 247.5 139 Q248 145.5 241.5 145.5 H225 Q219 145.5 219 140 Z" fill="${c.base}" stroke="${n}" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="230" cy="133" rx="5" ry="1.8" fill="${c.light}" opacity=".85"/>

    ${r?o?E():N():""}

    <!-- chú thích ✓ -->
    ${s("back")?`<g class="pz-pop"><path d="M122 104 V156" stroke="${t.good}" stroke-width="3.4" stroke-dasharray="6 5" stroke-linecap="round"/>${w(122,92)}</g>`:""}
    ${s("feet")?`<g class="pz-pop"><path d="M184 234 H228" stroke="${t.good}" stroke-width="3.4" stroke-linecap="round"/>${w(172,212)}</g>`:""}
    ${s("hands")?`<g class="pz-pop"><path d="M172 152 H222" stroke="${t.good}" stroke-width="3.4" stroke-dasharray="6 5" stroke-linecap="round"/>${w(198,120)}
        <!-- khung phóng to: sơ đồ "cây cầu" trên phím -->
        <circle cx="228" cy="96" r="2.4" fill="#fff" stroke="${t.good}" stroke-width="1.5"/>
        <circle cx="224" cy="83" r="3.4" fill="#fff" stroke="${t.good}" stroke-width="1.5"/>
        <circle cx="218" cy="38" r="31" fill="#fff" stroke="${t.good}" stroke-width="3"/>
        <g clip-path="url(#${M})">${v}</g>
</g>`:""}`}function D(){const i=[203,218,233];let r=`<rect x="186" y="52" width="64" height="20" fill="#fff" stroke="${n}" stroke-width="1.4"/>`;for(const f of[196.5,210.5,225.5,240.5])r+=`<path d="M${f} 52 V72" stroke="${n}" stroke-width="1.2"/>`;const o=[i[0],46],s=[i[2],46];r+=`<path d="M218 46 V26" stroke="${n}" stroke-width="6" stroke-linecap="round"/><path d="M218 46 V26" stroke="${t.violet}" stroke-width="3" stroke-linecap="round"/>`,r+=`<path d="${H(o,s,24)}" fill="none" stroke="${n}" stroke-width="8.4" stroke-linecap="round"/><path d="${H(o,s,24)}" fill="none" stroke="${t.violet}" stroke-width="5" stroke-linecap="round"/>`;for(const f of i)r+=`<circle cx="${f}" cy="46" r="5.4" fill="#2b7bd0" stroke="${n}" stroke-width="1.6"/>`;return r}function N(){const e=t.good;return`<g class="pz-measure">
    <path d="M128 158 L140 100" stroke="${e}" stroke-width="2.6" stroke-dasharray="5 4" stroke-linecap="round"/>
    <path d="M128 158 V100" stroke="${e}" stroke-width="1.4" stroke-dasharray="2 4" opacity=".7"/>
    <path d="M172 112 V150" stroke="${t.indigo}" stroke-width="1.6" stroke-dasharray="3 3"/>
    <path d="M172 146 H176" stroke="${t.indigo}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M168 139 H272" stroke="${t.orange}" stroke-width="2.4" stroke-dasharray="6 4" stroke-linecap="round"/>
    ${l(124,92,"lưng thẳng",e)}
    ${l(306,139,"ngang phím",t.orange)}
    ${l(186,108,"khuỷu trước",t.indigo)}
    ${l(124,146,"gối","#c98a12")}
    ${l(206,238,"kê chân",t.woodDark)}
    ${w(342,20,11)}
  </g>`}function E(){return`<g class="pz-measure">
    <path d="M128 104 Q114 126 126 156" stroke="${a}" stroke-width="2.6" stroke-dasharray="5 4" fill="none" stroke-linecap="round"/>
    <circle cx="178" cy="128" r="9" fill="none" stroke="${a}" stroke-width="2.4" stroke-dasharray="4 3"/>
    <path d="M190 206 V226" stroke="${a}" stroke-width="2.2" stroke-dasharray="3 3"/>
    <path d="M186 222 L190 228 L194 222" stroke="${a}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${l(120,92,"lưng gù",a)}
    ${l(196,114,"ngồi xa",a)}
    ${l(222,214,"chân hẫng",a)}
    ${P(342,20)}
  </g>`}function X(e,i={}){const r=document.createElementNS(q,"svg");return r.setAttribute("viewBox",A),r.setAttribute("class",`posture-art focus-${e}${i.variant==="bad"?" is-bad":""}`),r.setAttribute("aria-hidden","true"),r.innerHTML=S(e,i),r}export{A as P,S as a,X as p};
