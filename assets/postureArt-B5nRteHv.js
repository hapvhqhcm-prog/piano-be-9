import{u as d,P as t,j as $,k as a}from"./index-CjXROQro.js";const x="http://www.w3.org/2000/svg",e="rgba(61,52,102,.38)",h=(r,i,s)=>`<path d="${r}" fill="none" stroke="${e}" stroke-width="${s+2.6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${r}" fill="none" stroke="${i}" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>`,f=(r,i)=>`<path class="pz-glow" d="${r}" fill="none" stroke="${t.good}" stroke-width="${i}" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/>`;function y(r){const i=o=>r===o||r==="all",s=d("pz-wood"),c=d("pz-shirt"),p=d("pz-wall");let k="";for(let o=1;o<8;o++){const l=222+o*5.5;k+=`M${l} 147 L${l+4.6} 139 `}const g=[1,2,4,5,6].map(o=>{const l=222+o*5.5+2.9;return`<path d="M${l-1.6} 142.6 L${l+1.6} 142.6 L${l+3.6} 139 L${l+.4} 139 Z" fill="${t.night}"/>`}).join(""),n=document.createElementNS(x,"svg");return n.setAttribute("viewBox","84 0 280 244"),n.setAttribute("class",`posture-art focus-${r}`),n.setAttribute("aria-hidden","true"),n.innerHTML=`
    <style>
      .pz-glow { animation: pz-pulse 1.3s ease-in-out infinite; }
      .pz-pop { animation: pz-pop .5s cubic-bezier(.3,1.6,.5,1) both; transform-box: fill-box; transform-origin: center; }
      @keyframes pz-pulse { 50% { opacity: .12; } }
      @keyframes pz-pop { from { transform: scale(.2); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .pz-glow, .pz-pop { animation: none; } }
    </style>
    <defs>
      <linearGradient id="${s}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#a8673f"/><stop offset="1" stop-color="#7d4a2c"/>
      </linearGradient>
      <linearGradient id="${c}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${t.violet}"/><stop offset="1" stop-color="${t.indigo}"/>
      </linearGradient>
      <linearGradient id="${p}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f3eeff"/><stop offset="1" stop-color="#fff6ea"/>
      </linearGradient>
    </defs>

    <!-- phông nền + sàn gỗ + thảm -->
    <rect x="88" y="4" width="272" height="236" rx="26" fill="url(#${p})"/>
    <path d="M88 230 H360 V214 a0 0 0 0 1 0 0 V214 Z" fill="none"/>
    <path d="M88 228 H360 V214 Q360 240 334 240 H114 Q88 240 88 214 Z" fill="#f1d6ae"/>
    <path d="M88 228 H360" stroke="#e2bf8f" stroke-width="2"/>
    <ellipse cx="160" cy="230" rx="66" ry="5" fill="${t.lavender}" stroke="${e}" stroke-width="1"/>

    <!-- đàn piano đứng -->
    <g stroke="${e}" stroke-width="1.3" stroke-linejoin="round">
      <rect x="262" y="44" width="80" height="186" rx="6" fill="url(#${s})"/>
      <rect x="268" y="56" width="66" height="70" rx="6" fill="#ffffff" fill-opacity=".1"/>
      <rect x="268" y="176" width="66" height="44" rx="6" fill="#ffffff" fill-opacity=".1"/>
      <rect x="254" y="35" width="96" height="12" rx="5" fill="#6d3f25"/>
      <rect x="222" y="146" width="44" height="21" rx="3" fill="#8a5332"/>
      <path d="M222 147 L266 147 L270.6 139 L226.6 139 Z" fill="#fff"/>
      <path d="${k}" stroke="#b9b2d8" stroke-width=".8"/>
      ${g}
      <rect x="229" y="167" width="8" height="61" rx="3" fill="#7d4a2c"/>
      <rect x="226" y="224" width="14" height="6" rx="2" fill="${t.sun}"/>
      <rect x="250" y="222" width="12" height="4" rx="2" fill="${t.sun}"/>
      <!-- giá nhạc + iPad -->
      <rect x="244" y="131" width="20" height="5" rx="2" fill="#6d3f25"/>
      <g transform="rotate(10 256 134)">
        <rect x="231" y="86" width="34" height="48" rx="6" fill="${t.night}"/>
        <rect x="234.5" y="90" width="27" height="40" rx="3" fill="#eaf6ff" stroke="none"/>
        <path d="M237 102 H259 M237 106 H259 M237 110 H259 M237 114 H259 M237 118 H259" stroke="#9fb4d8" stroke-width=".8"/>
        ${$(244,114,2.6,t.coral)}${$(253,108,2.6,t.indigo)}
      </g>
      <!-- máy đếm nhịp trên nóc đàn -->
      <path d="M292 35 L299 13 H305 L312 35 Z" fill="${t.mint}"/>
      <path d="M302 31 L308 16" stroke="${t.ink}" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="306" cy="20" r="2" fill="${t.sun}"/>
    </g>

    <!-- ghế đàn -->
    <g stroke="${e}" stroke-width="1.3">
      <rect x="110" y="170" width="7" height="58" rx="3" fill="#8a5332"/>
      <rect x="167" y="170" width="7" height="58" rx="3" fill="#8a5332"/>
      <rect x="104" y="166" width="76" height="7" rx="3" fill="#a8673f"/>
      <rect x="100" y="156" width="84" height="12" rx="6" fill="${t.mint}"/>
    </g>

    <!-- vầng sáng nhắc (dưới hình bé) -->
    ${i("back")?f("M134 156 Q130 128 136 102 Q140 92 150 90",14):""}
    ${i("feet")?f("M188 225 H222",16)+f("M196 168 L198 216",22):""}
    ${i("hands")?f("M170 138 L226 138 Q238 128 248 142",20):""}

    <!-- bé: chân -->
    ${h("M146 150 L196 156","#3f3a9e",21)}
    ${h("M197 160 L199 216","#3f3a9e",16)}
    <g stroke="${e}" stroke-width="1.3">
      <path d="M187 229 V221 Q187 214 195 214 H201 Q207 214 212 218 L219 222 Q224 225 224 229 Z" fill="${t.coral}"/>
      <rect x="186" y="226.5" width="39" height="3.5" rx="1.7" fill="#fff"/>
    </g>

    <!-- bé: thân (áo) -->
    <path d="M137 158 Q131 130 137 106 Q142 94 157 94 Q172 96 172 114 L170 158 Z" fill="url(#${c})" stroke="${e}" stroke-width="1.4"/>
    <path d="M147 132 l2.6 5.2 5.8 .8 -4.2 4 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.2 -4 5.8 -.8 Z" fill="${t.sun}" transform="translate(6 -6)"/>

    <!-- bé: đầu -->
    <rect x="153" y="84" width="12" height="14" rx="5" fill="${t.skin}" stroke="${e}" stroke-width="1.2"/>
    <circle cx="163" cy="64" r="25" fill="${t.skin}" stroke="${e}" stroke-width="1.4"/>
    <path d="M187 61 q5 3 1 8" fill="${t.skin}" stroke="${e}" stroke-width="1.4"/>
    <path d="M139 70 Q133 40 160 38 Q184 37 189 56 Q178 50 168 53 Q161 47 152 53 Q147 59 148 72 Z" fill="${t.hair}"/>
    <path d="M160 39 q4 -9 12 -7 q-6 2 -6 7" fill="${t.hair}"/>
    <circle cx="150" cy="70" r="5" fill="${t.skin}" stroke="${e}" stroke-width="1.2"/>
    <ellipse cx="176" cy="63" rx="3.1" ry="4" fill="${t.night}"/><circle cx="177.2" cy="61.6" r="1.1" fill="#fff"/>
    <path d="M171 54.5 q5 -3 9 0" fill="none" stroke="${t.hair}" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="174" cy="73" rx="5" ry="3.2" fill="#ff9fb6" opacity=".7"/>
    <path d="M176 78 q5 3.5 9 -1" fill="none" stroke="#c2324d" stroke-width="2.2" stroke-linecap="round"/>

    <!-- bé: tay (vai → khuỷu → cổ tay ngang phím) -->
    ${h("M158 106 L170 136 L224 138",t.skin,11)}
    ${h("M158 106 L164 120",t.violet,16)}
    <g stroke="${e}" stroke-width="1.2">
      <path d="M222 138 Q226 129 236 129 Q245 130 247 140 L246 145 Q243 141 240 141 Q236 136 230 138 Z" fill="${t.skin}"/>
      <path d="M240 134 Q247 136 246.5 144" fill="none" stroke="${t.skinDark}" stroke-width="1.4" stroke-linecap="round"/>
    </g>

    <!-- chú thích ✓ -->
    ${i("back")?`<g class="pz-pop"><path d="M122 104 V156" stroke="${t.good}" stroke-width="3.4" stroke-dasharray="6 5" stroke-linecap="round"/>${a(122,92)}</g>`:""}
    ${i("feet")?`<g class="pz-pop"><path d="M184 234 H228" stroke="${t.good}" stroke-width="3.4" stroke-linecap="round"/>${a(172,212)}</g>`:""}
    ${i("hands")?`<g class="pz-pop"><path d="M172 152 H222" stroke="${t.good}" stroke-width="3.4" stroke-dasharray="6 5" stroke-linecap="round"/>${a(198,120)}
        <!-- khung phóng to: bàn tay khum như ôm quả bóng -->
        <circle cx="228" cy="96" r="2.4" fill="#fff" stroke="${t.good}" stroke-width="1.5"/>
        <circle cx="224" cy="83" r="3.4" fill="#fff" stroke="${t.good}" stroke-width="1.5"/>
        <circle cx="218" cy="38" r="31" fill="#fff" stroke="${t.good}" stroke-width="3"/>
        <circle cx="219" cy="47" r="14" fill="${t.sun}" stroke="${e}" stroke-width="1.2"/>
        <path d="M207 41 Q219 35 231 42" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round"/>
        ${h("M210 37 Q213 42 210.5 47",t.skin,5.5)}
        <path d="M190 33 Q203 25 216 23 Q233 21 240 33 Q244 42 240 55 Q237 59 233.5 55.5 Q235 45 230 39 Q224 34 215 36 Q204 39 192 47 Z" fill="${t.skin}" stroke="${e}" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M228 27 Q236 33 236.5 45 M222 25 Q230 30 231.5 40" fill="none" stroke="${t.skinDark}" stroke-width="1.3" stroke-linecap="round"/>
        <ellipse cx="237" cy="55" rx="2.6" ry="1.8" fill="#fff" opacity=".7"/>`:""}`,n}export{y as p};
