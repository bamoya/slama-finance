// Approved animation CSS (variant A), extracted verbatim from design/animations-reference.html.
// Scenes are driven frame by frame (Web Animations API seek), see AnimStage.tsx.
export const ANIM_CSS = String.raw`
/* Film frames are always light, like the rendered video. */
.frame { --u: 10px; position: relative; width: 100%; max-width: 100%; aspect-ratio: 16/9; border-radius: 14px; overflow: hidden; border: 1px solid var(--line);
  background: #f7f8fa; color: #252a32;  box-shadow: 0 20px 60px -30px rgb(0 0 0 / .35); }
.frame * { box-sizing: border-box; }
.cap { position: absolute; left: 0; right: 0; top: 6%; text-align: center; font: 800 calc(3 * var(--u)) var(--display); letter-spacing: -.02em; opacity: 0; }
.cap.sub { top: 13%; font: 500 calc(1.55 * var(--u)) var(--display); color: #5b6472; letter-spacing: 0; }
.cap.light { color: #fff; }
.night { position: absolute; inset: 0; background: #161a20; opacity: 0; }
.pill { display: inline-flex; align-items: center; gap: calc(.4 * var(--u)); font: 700 calc(1.05 * var(--u)) var(--display); border-radius: 999px; padding: calc(.35 * var(--u)) calc(.9 * var(--u)); }
.ok { color: #1f8a5b; background: #dff3e8; } .late { color: #fff; background: #c2412d; } .gold { color: #946f29; background: #f4ead6; }
.avatar { width: calc(4.2 * var(--u)); aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font: 800 calc(1.6 * var(--u)) var(--display); color: #fff; flex: none; }
.a-biz { background: #946f29; } .a-cli { background: #2f5d50; }

@keyframes in { to { opacity: 1; translate: 0 0; scale: 1; } }
@keyframes fade { to { opacity: 1; } }
@keyframes out { to { opacity: 0; } }
@keyframes nightcycle { 0% { opacity: 0; } 8%,40% { opacity: 1; } 48%,100% { opacity: 0; } }

/* ===== Variant A: Avion (refined) ===== */
.A .doc { position: absolute; left: 11%; top: 31%; width: calc(21 * var(--u)); aspect-ratio: .74; background: #fff; border: 1px solid #e3e5ea; border-radius: calc(1 * var(--u)); padding: calc(1.5 * var(--u)); display: grid; align-content: start; gap: calc(.9 * var(--u)); box-shadow: 0 calc(1.5 * var(--u)) calc(4 * var(--u)) calc(-2 * var(--u)) rgb(0 0 0 / .25); opacity: 0; translate: 0 calc(2 * var(--u)); }
.A .doc b { font: 800 calc(1.7 * var(--u)) var(--display); }
.A .ln { height: calc(.7 * var(--u)); background: #eceef2; border-radius: 9px; }
.A .tot { margin-top: calc(.6 * var(--u)); border-top: 1px solid #eceef2; padding-top: calc(.8 * var(--u)); display: flex; justify-content: space-between; font: 700 calc(1.3 * var(--u)) var(--display); }
.A .plane { position: absolute; left: 30%; top: 47%; width: calc(4 * var(--u)); aspect-ratio: 1; opacity: 0; offset-path: path("M0 0 C 200 -170, 430 -150, 560 30"); offset-rotate: auto; }
.A .trail { position: absolute; left: 32%; top: 30%; width: 40%; height: 28%; opacity: 0; }
.A .trail path { stroke-dasharray: 600; stroke-dashoffset: 600; }
.A .inbox { position: absolute; right: 9%; top: 27%; width: calc(27 * var(--u)); background: #fff; border-radius: calc(1.2 * var(--u)); box-shadow: 0 calc(1.5 * var(--u)) calc(4 * var(--u)) calc(-2 * var(--u)) rgb(0 0 0 / .3); overflow: hidden; }
.A .inbox .bar { font: 700 calc(1.2 * var(--u)) var(--display); padding: calc(1 * var(--u)) calc(1.3 * var(--u)); border-bottom: 1px solid #eceef2; display: flex; justify-content: space-between; }
.A .row { display: flex; gap: calc(.9 * var(--u)); align-items: center; padding: calc(1 * var(--u)) calc(1.3 * var(--u)); border-bottom: 1px solid #f1f2f5; }
.A .row.new { background: #fbf6ec; opacity: 0; max-height: 0; padding-block: 0; overflow: hidden; }
.A .row div { display: grid; gap: calc(.2 * var(--u)); min-width: 0; }
.A .row b { font: 700 calc(1.05 * var(--u)) var(--display); } .A .row span { font: 500 calc(.95 * var(--u)) var(--display); color: #687280; }
.A .row .ph { width: 70%; height: calc(.6 * var(--u)); background: #eceef2; border-radius: 9px; }
.A .sent { position: absolute; left: 15%; top: 74%; opacity: 0; scale: .6; }
.play .A.inv .cap { animation: fade .5s .1s forwards; } .play .A.inv .cap.sub { animation: fade .5s .4s forwards; }
.play .A.inv .doc { animation: in .5s .5s ease-out forwards; }
.play .A.inv .trail { animation: fade .1s 1.3s forwards; } .play .A.inv .trail path { animation: draw 1.3s 1.3s ease-in-out forwards; }
.play .A.inv .plane { animation: fly 1.3s 1.3s cubic-bezier(.45,.05,.3,1) forwards; }
.play .A.inv .sent { animation: in .35s 1.4s forwards; }
.play .A.inv .row.new { animation: newrow .6s 2.6s cubic-bezier(.2,1.2,.4,1) forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes fly { 0% { opacity: 0; offset-distance: 0%; } 10%,90% { opacity: 1; } 100% { opacity: 0; offset-distance: 100%; } }
@keyframes newrow { to { opacity: 1; max-height: calc(8 * var(--u)); padding-block: calc(1 * var(--u)); } }
/* A reminder */
.A .cal { position: absolute; left: 13%; top: 31%; width: calc(19 * var(--u)); background: #fff; border-radius: calc(1.2 * var(--u)); overflow: visible; box-shadow: 0 calc(1.5 * var(--u)) calc(4 * var(--u)) calc(-2 * var(--u)) rgb(0 0 0 / .35); text-align: center; }
.A .cal .top { background: #c2412d; color: #fff; font: 700 calc(1.25 * var(--u)) var(--display); padding: calc(.8 * var(--u)); border-radius: calc(1.2 * var(--u)) calc(1.2 * var(--u)) 0 0; }
.A .cal .day { font: 800 calc(6.4 * var(--u)) var(--display); padding-top: calc(.4 * var(--u)); } .A .cal .lab { font: 600 calc(1.1 * var(--u)) var(--display); color: #687280; padding-bottom: calc(1.1 * var(--u)); }
.A .cal .pill { position: absolute; right: calc(-1.4 * var(--u)); top: calc(-1.4 * var(--u)); opacity: 0; scale: .6; }
.A .client { position: absolute; right: 17%; top: 30%; display: grid; justify-items: center; gap: calc(.7 * var(--u)); }
.A .client .avatar { width: calc(9 * var(--u)); font-size: calc(3.2 * var(--u)); }
.A .client b { font: 700 calc(1.35 * var(--u)) var(--display); }
.A .zz { position: absolute; right: 14%; top: 24%; font: 800 calc(2.2 * var(--u)) var(--display); color: #8a93a0; opacity: 0; }
.A .env { position: absolute; left: 38%; top: 46%; padding: calc(.8 * var(--u)) calc(1.2 * var(--u)); background: #fff; border: calc(.2 * var(--u)) solid #946f29; border-radius: calc(.8 * var(--u)); font: 700 calc(1.1 * var(--u)) var(--display); color: #946f29; opacity: 0; }
.A .bell { position: absolute; right: 17.5%; top: 21%; font-size: calc(3 * var(--u)); opacity: 0; }
.A .owner { position: absolute; left: 13%; top: 23%; width: calc(19 * var(--u)); display: flex; gap: calc(.7 * var(--u)); align-items: center; font: 700 calc(1.15 * var(--u)) var(--display); }
.A .owner .avatar { width: calc(2.6 * var(--u)); font-size: calc(1.05 * var(--u)); }
.A .money { position: absolute; left: 66%; top: 52%; display: flex; gap: calc(.6 * var(--u)); align-items: center; background: #1f8a5b; color: #fff; border-radius: 999px; padding: calc(.4 * var(--u)) calc(.9 * var(--u)); font: 700 calc(1 * var(--u)) var(--display); box-shadow: 0 calc(.6 * var(--u)) calc(1.4 * var(--u)) calc(-.8 * var(--u)) rgb(31 138 91 / .6); opacity: 0; z-index: 2; }
.A .moneytrail { position: absolute; left: 33%; top: 49%; width: 36%; height: 16%; opacity: 0; }
.A .moneytrail path { stroke-dasharray: 600; stroke-dashoffset: -600; }
.A .cal .paidtop { position: absolute; inset: 0 0 auto 0; background: #1f8a5b; color: #fff; font: 700 calc(1.25 * var(--u)) var(--display); padding: calc(.8 * var(--u)); border-radius: calc(1.2 * var(--u)) calc(1.2 * var(--u)) 0 0; opacity: 0; }
.A .cal .okpill { position: static; display: block; width: max-content; margin: 0 auto calc(1.1 * var(--u)); opacity: 0; scale: 1; font-size: calc(1.05 * var(--u)); padding: calc(.35 * var(--u)) calc(.9 * var(--u)); }
.A .client .paidmark { opacity: 0; scale: .6; }
.play .A.rem .night { animation: nightcycle 6.5s forwards; } .play .A.rem .cap.q { animation: nightcycle 6.5s forwards; }
.play .A.rem .cap.a { animation: fade .5s 3.1s forwards; }
.play .A.rem .cal .pill { animation: in .35s .9s forwards; }
.play .A.rem .zz { animation: zz 2.2s .6s; }
.play .A.rem .env { animation: env 1.3s 3.3s cubic-bezier(.45,.05,.3,1) forwards; }
.play .A.rem .bell { animation: ring .9s 4.5s forwards; }
.play .A.rem .client .paidmark { animation: in .3s 5.2s forwards; }
.play .A.rem .money { animation: payback 1.3s 5.5s cubic-bezier(.45,.05,.3,1) forwards; }
.play .A.rem .cal .pill.late { animation: in .35s .9s forwards, out .2s 6.7s forwards; }
.play .A.rem .cal .paidtop { animation: fade .3s 6.7s forwards; }
.play .A.rem .cal .okpill { animation: fade .4s 6.8s forwards; }
@keyframes payback { 0% { opacity: 0; left: 66%; top: 52%; } 12% { opacity: 1; } 80% { opacity: 1; scale: 1; } 100% { opacity: 0; left: 24%; top: 50%; scale: .7; } }
@keyframes zz { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; translate: calc(2 * var(--u)) calc(-3 * var(--u)); } }
@keyframes env { 0% { opacity: 0; left: 36%; } 15%,85% { opacity: 1; } 100% { opacity: 0; left: 62%; top: 38%; } }
@keyframes ring { 0% { opacity: 0; } 15% { opacity: 1; rotate: -18deg; } 35% { rotate: 16deg; } 55% { rotate: -10deg; } 75% { rotate: 6deg; } 100% { opacity: 1; rotate: 0deg; } }

/* ===== Mini B-Finance app screens (match the real SaaS UI) ===== */
.app { position: absolute; left: 9%; right: 9%; top: 21%; bottom: 5%; background: #fff; border-radius: calc(1.1 * var(--u)); overflow: hidden; box-shadow: 0 calc(2 * var(--u)) calc(5 * var(--u)) calc(-2.5 * var(--u)) rgb(0 0 0 / .35); display: grid; grid-template-rows: calc(2.6 * var(--u)) 1fr; border: 1px solid #e3e5ea; }
.app .chrome { background: #f1f2f5; display: flex; align-items: center; gap: calc(.5 * var(--u)); padding: 0 calc(1 * var(--u)); border-bottom: 1px solid #e3e5ea; }
.app .chrome i { width: calc(.8 * var(--u)); aspect-ratio: 1; border-radius: 50%; background: #d6d9df; }
.app .chrome i:nth-child(1) { background: #ef6a5e; } .app .chrome i:nth-child(2) { background: #f5bf4f; } .app .chrome i:nth-child(3) { background: #61c454; }
.app .chrome span { margin-left: auto; margin-right: auto; font: 500 calc(.9 * var(--u)) var(--display); color: #5b6472; background: #fff; border-radius: 9px; padding: calc(.25 * var(--u)) calc(2.5 * var(--u)); }
.app .body { display: grid; grid-template-columns: calc(13.5 * var(--u)) 1fr; min-height: 0; }
.app .side { background: #23292b; padding: calc(1.1 * var(--u)) calc(.9 * var(--u)); display: grid; align-content: start; gap: calc(.25 * var(--u)); }
.app .brand { color: #fff; font: 800 calc(1.2 * var(--u)) var(--display); display: flex; gap: calc(.5 * var(--u)); align-items: center; margin-bottom: calc(.3 * var(--u)); }
.app .brand em { width: calc(1.6 * var(--u)); aspect-ratio: 1; border-radius: calc(.35 * var(--u)); background: #946f29; display: grid; place-items: center; font: 800 calc(1 * var(--u)) var(--display); font-style: normal; }
.app .org { color: #dfe3e8; font: 600 calc(.85 * var(--u)) var(--display); display: flex; gap: calc(.5 * var(--u)); align-items: center; padding: calc(.4 * var(--u)) 0 calc(.7 * var(--u)); border-bottom: 1px solid #343a39; margin-bottom: calc(.4 * var(--u)); }
.app .org b { width: calc(1.6 * var(--u)); aspect-ratio: 1; border-radius: calc(.35 * var(--u)); background: #f4ead6; color: #946f29; display: grid; place-items: center; font: 800 calc(.7 * var(--u)) var(--display); }
.app .grp { color: #7d8790; font: 600 calc(.7 * var(--u)) var(--display); text-transform: uppercase; letter-spacing: .06em; margin-top: calc(.5 * var(--u)); }
.app .nav { color: #b2bcbd; font: 500 calc(.9 * var(--u)) var(--display); padding: calc(.4 * var(--u)) calc(.6 * var(--u)); border-radius: calc(.45 * var(--u)); display: flex; justify-content: space-between; align-items: center; }
.app .nav.on { background: #343a39; color: #dfc48c; font-weight: 600; }
.app .nav.lock { color: #5d666e; } .app .nav.lock::after { content: "🔒"; font-size: calc(.75 * var(--u)); }
.app .main { background: #f5f6f8; padding: calc(1.1 * var(--u)) calc(1.3 * var(--u)); display: grid; align-content: start; gap: calc(.9 * var(--u)); min-width: 0; position: relative; }
.app .ph { background: #fff; border: 1px solid #e6e8ec; border-radius: calc(.9 * var(--u)); padding: calc(.9 * var(--u)) calc(1.1 * var(--u)); display: flex; justify-content: space-between; align-items: center; gap: calc(1 * var(--u)); }
.app .ph small { display: block; font: 600 calc(.72 * var(--u)) var(--display); color: #946f29; }
.app .ph b { font: 750 calc(1.35 * var(--u)) var(--display); letter-spacing: -.02em; }
.app .btn { font: 700 calc(.85 * var(--u)) var(--display); color: #fff; background: #946f29; border-radius: calc(.5 * var(--u)); padding: calc(.5 * var(--u)) calc(.9 * var(--u)); white-space: nowrap; }
.app .btn.ghost { background: #fff; color: #252a32; border: 1px solid #e3e5ea; }
.app .card { background: #fff; border: 1px solid #e6e8ec; border-radius: calc(.9 * var(--u)); overflow: hidden; }
.app table { width: 100%; border-collapse: collapse; font: 500 calc(.85 * var(--u)) var(--display); }
.app th { text-align: left; font: 600 calc(.7 * var(--u)) var(--display); text-transform: uppercase; letter-spacing: .05em; color: #687280; background: #fafbfc; padding: calc(.6 * var(--u)) calc(.9 * var(--u)); border-bottom: 1px solid #eef0f3; }
.app td { padding: calc(.7 * var(--u)) calc(.9 * var(--u)); border-bottom: 1px solid #f1f2f5; color: #252a32; }
.badge { display: inline-block; font: 700 calc(.72 * var(--u)) var(--display); border-radius: 999px; padding: calc(.15 * var(--u)) calc(.6 * var(--u)); }
.badge.ok { color: #1f7a52; background: #e3f5ec; border: 1px solid #bfe6d1; }
.badge.gold { color: #946f29; background: #f7efe0; border: 1px solid #ead9b6; }
.badge.grey { color: #5b6472; background: #eef0f3; }
.app .toast { position: absolute; right: calc(1.3 * var(--u)); bottom: calc(1.2 * var(--u)); background: #fff; border: 1px solid #e6e8ec; border-radius: calc(.8 * var(--u)); padding: calc(.7 * var(--u)) calc(1 * var(--u)); box-shadow: 0 calc(1.2 * var(--u)) calc(2.5 * var(--u)) calc(-1.2 * var(--u)) rgb(0 0 0 / .3); display: flex; gap: calc(.7 * var(--u)); align-items: center; font: 600 calc(.85 * var(--u)) var(--display); opacity: 0; translate: 0 calc(1 * var(--u)); }
.app .toast .ic { width: calc(1.8 * var(--u)); aspect-ratio: 1; border-radius: 50%; background: #946f29; color: #fff; display: grid; place-items: center; font: 800 calc(.8 * var(--u)) var(--display); }
.ptr { position: absolute; width: calc(1.7 * var(--u)); z-index: 5; pointer-events: none; }
.ptr .ring { position: absolute; left: calc(-.6 * var(--u)); top: calc(-.6 * var(--u)); width: calc(1.6 * var(--u)); aspect-ratio: 1; border-radius: 50%; border: calc(.2 * var(--u)) solid #946f29; opacity: 0; }

/* Reports scene */
.R .mail { position: absolute; right: 2%; top: 26%; width: calc(30 * var(--u)); background: #fff; border: 1px solid #e3e5ea; border-radius: calc(1 * var(--u)); box-shadow: 0 calc(2 * var(--u)) calc(5 * var(--u)) calc(-2.5 * var(--u)) rgb(0 0 0 / .4); overflow: hidden; opacity: 0; translate: calc(3 * var(--u)) 0; z-index: 4; }
.R .mail .mh { padding: calc(.8 * var(--u)) calc(1.1 * var(--u)); border-bottom: 1px solid #eef0f3; display: grid; gap: calc(.2 * var(--u)); }
.R .mail .mh b { font: 700 calc(.95 * var(--u)) var(--display); } .R .mail .mh span { font: 500 calc(.78 * var(--u)) var(--display); color: #687280; }
.R .mail .mb { padding: calc(1 * var(--u)) calc(1.1 * var(--u)); display: grid; gap: calc(.8 * var(--u)); }
.R .mail .gl { height: calc(.25 * var(--u)); background: #946f29; border-radius: 9px; }
.R .mail .ti { font: 750 calc(1.1 * var(--u)) var(--display); }
.R .bars { display: flex; align-items: flex-end; gap: calc(.6 * var(--u)); height: calc(6.5 * var(--u)); border-bottom: 1px solid #eef0f3; }
.R .bars i { flex: 1; border-radius: calc(.25 * var(--u)) calc(.25 * var(--u)) 0 0; background: #946f29; height: 0; }
.R .bars i:nth-child(even) { background: #c9b07a; }
.R .k { display: flex; justify-content: space-between; font: 500 calc(.72 * var(--u)) var(--display); color: #687280; }
.R .k b { display: block; font: 800 calc(.95 * var(--u)) var(--display); color: #252a32; }
.R .next { transition: none; }
.play .R .cap { animation: fade .5s .1s forwards; } .play .R .cap.sub { animation: fade .5s .4s forwards; }
.play .R .ptr { animation: rptr 2.2s .6s ease-in-out forwards; }
.play .R .ptr .ring { animation: ringp .4s 1.5s; }
.play .R .toast { animation: in .35s 1.7s forwards, out .3s 3.1s forwards; }
.play .R .mail { animation: in .5s 3.2s forwards; }
.play .R .bars i { animation: barh .6s 3.6s cubic-bezier(.2,1.1,.4,1) forwards; }
.play .R .bars i:nth-child(2) { animation-delay: 3.7s; } .play .R .bars i:nth-child(3) { animation-delay: 3.8s; } .play .R .bars i:nth-child(4) { animation-delay: 3.9s; } .play .R .bars i:nth-child(5) { animation-delay: 4s; } .play .R .bars i:nth-child(6) { animation-delay: 4.1s; }
@keyframes rptr { 0% { left: 60%; top: 75%; } 60%,100% { left: 83.4%; top: 43.6%; } }
@keyframes ringp { 0% { opacity: 1; scale: .4; } 100% { opacity: 0; scale: 1.6; } }
@keyframes barh { to { height: var(--h); } }

/* Templates scene */
.T .lays { display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(.6 * var(--u)); }
.T .lay { background: #fff; border: 1px solid #e6e8ec; border-radius: calc(.7 * var(--u)); padding: calc(.6 * var(--u)); display: grid; gap: calc(.35 * var(--u)); justify-items: center; font: 600 calc(.78 * var(--u)) var(--display); color: #5b6472; }
.T .lay i { width: 70%; aspect-ratio: .8; border: 1px solid #e6e8ec; border-radius: calc(.3 * var(--u)); background: linear-gradient(#fff, #fff) padding-box; position: relative; }
.T .lay i::before { content: ""; position: absolute; left: 12%; right: 12%; top: 12%; height: 12%; background: var(--c, #946f29); border-radius: 2px; }
.T .lay i::after { content: ""; position: absolute; left: 12%; right: 30%; top: 34%; height: 40%; background: repeating-linear-gradient(#eceef2 0 2px, transparent 2px 6px); }
.T .lay.sel { border-color: #946f29; background: #fbf6ec; color: #946f29; }
.T .cols { display: grid; grid-template-columns: 1fr 1.1fr; gap: calc(.9 * var(--u)); min-height: 0; }
.T .opts { display: grid; gap: calc(.7 * var(--u)); align-content: start; }
.T .lbl { font: 600 calc(.8 * var(--u)) var(--display); color: #252a32; }
.T .sw { display: flex; gap: calc(.6 * var(--u)); }
.T .sw i { width: calc(1.9 * var(--u)); aspect-ratio: 1; border-radius: 50%; border: calc(.25 * var(--u)) solid #fff; box-shadow: 0 0 0 1px #e3e5ea; }
.T .inp { background: #f3f4f6; border-radius: calc(.5 * var(--u)); padding: calc(.5 * var(--u)) calc(.7 * var(--u)); font: 500 calc(.8 * var(--u)) var(--display); color: #252a32; display: flex; justify-content: space-between; }
.T .inp small { color: #946f29; font-weight: 700; }
.T .prev { background: #fff; border: 1px solid #e6e8ec; border-radius: calc(.8 * var(--u)); padding: calc(.9 * var(--u)); display: grid; gap: calc(.6 * var(--u)); align-content: start; --acc: #946f29; }
.T .prev .t { font: 600 calc(.78 * var(--u)) var(--display); color: #687280; display: flex; gap: calc(.4 * var(--u)); }
.T .paper { border: 1px solid #eef0f3; border-radius: calc(.4 * var(--u)); padding: calc(.8 * var(--u)); display: grid; gap: calc(.45 * var(--u)); }
.T .paper .hd { display: flex; justify-content: space-between; align-items: center; border-bottom: calc(.2 * var(--u)) solid var(--acc); padding-bottom: calc(.5 * var(--u)); }
.T .paper .lg { width: calc(2 * var(--u)); aspect-ratio: 1; border-radius: calc(.35 * var(--u)); background: var(--acc); color: #fff; display: grid; place-items: center; font: 800 calc(.9 * var(--u)) var(--display); scale: 0; }
.T .paper .hd b { font: 800 calc(1.05 * var(--u)) var(--display); color: var(--acc); }
.T .paper .l { height: calc(.4 * var(--u)); background: #eceef2; border-radius: 9px; }
.T .paper .tt { display: flex; justify-content: space-between; font: 800 calc(.8 * var(--u)) var(--display); color: var(--acc); background: color-mix(in srgb, var(--acc) 12%, #fff); border-radius: calc(.3 * var(--u)); padding: calc(.35 * var(--u)) calc(.5 * var(--u)); }
.play .T .cap { animation: fade .5s .1s forwards; } .play .T .cap.sub { animation: fade .5s .4s forwards; }
.play .T .ptr { animation: tptr 4s .6s ease-in-out forwards; }
.play .T .prev { animation: tacc 4s .6s steps(1) forwards; }
.play .T .lay.l2 { animation: tsel .2s 3.1s forwards; } .play .T .lay.l1 { animation: tunsel .2s 3.1s forwards; }
.play .T .paper .lg { animation: lgin .45s 4.2s cubic-bezier(.2,1.4,.4,1) forwards; }
@keyframes tptr { 0% { left: 40%; top: 85%; } 15%,26% { left: 27.3%; top: 64.4%; } 38%,50% { left: 29.8%; top: 64.4%; } 65%,75% { left: 39.3%; top: 50%; } 88%,100% { left: 52.4%; top: 71.8%; } }
@keyframes tacc { 0% { --acc: #946f29; } 25% { --acc: #2f6f5e; } 47% { --acc: #2d5a9e; } 100% { --acc: #2d5a9e; } }
@keyframes tsel { to { border-color: #946f29; background: #fbf6ec; color: #946f29; } }
@keyframes tunsel { to { border-color: #e6e8ec; background: #fff; color: #5b6472; } }
@keyframes lgin { to { scale: 1; } }
@property --acc { syntax: "<color>"; inherits: true; initial-value: #946f29; }

/* Team scene */
.S .dialog { position: absolute; left: 50%; top: 52%; translate: -50% -50%; width: calc(26 * var(--u)); background: #fff; border-radius: calc(1 * var(--u)); box-shadow: 0 calc(2.5 * var(--u)) calc(6 * var(--u)) calc(-2 * var(--u)) rgb(0 0 0 / .45); padding: calc(1.2 * var(--u)); display: grid; gap: calc(.7 * var(--u)); z-index: 4; opacity: 0; }
.S .dialog b { font: 750 calc(1.1 * var(--u)) var(--display); }
.S .inp { background: #f3f4f6; border-radius: calc(.5 * var(--u)); padding: calc(.5 * var(--u)) calc(.7 * var(--u)); font: 500 calc(.82 * var(--u)) var(--display); display: flex; justify-content: space-between; }
.S .inp small { color: #687280; }
.S .perm { display: grid; grid-template-columns: 1fr auto; gap: calc(.3 * var(--u)) calc(.8 * var(--u)); font: 500 calc(.78 * var(--u)) var(--display); color: #5b6472; }
.S .perm span:nth-child(even) { font-weight: 700; } .S .yes { color: #1f7a52; } .S .no { color: #b23a28; }
.S .row2 { display: flex; justify-content: flex-end; gap: calc(.5 * var(--u)); }
.S .dialog .btn { font: 700 calc(.85 * var(--u)) var(--display); color: #fff; background: #946f29; border-radius: calc(.5 * var(--u)); padding: calc(.5 * var(--u)) calc(.9 * var(--u)); white-space: nowrap; }
.S .dialog .btn.ghost { background: #fff; color: #252a32; border: 1px solid #e3e5ea; }
.S .scrim { position: absolute; inset: 0; background: rgb(22 26 32 / .35); opacity: 0; z-index: 3; }
.S .staffapp { opacity: 0; }
.S .deny { position: absolute; left: calc(1.3 * var(--u)); bottom: calc(1.2 * var(--u)); background: #fdecea; border: 1px solid #f5c4bd; color: #b23a28; border-radius: calc(.7 * var(--u)); padding: calc(.6 * var(--u)) calc(.9 * var(--u)); font: 700 calc(.82 * var(--u)) var(--display); opacity: 0; translate: 0 calc(1 * var(--u)); }
.play .S .cap { animation: fade .5s .1s forwards; } .play .S .cap.sub { animation: fade .5s .4s forwards; }
.play .S .scrim { animation: fade .3s .8s forwards, out .3s 2.6s forwards; }
.play .S .dialog { animation: fade .3s .8s forwards, out .3s 2.6s forwards; }
.play .S .ptr.p1 { animation: sptr1 1.6s .9s ease-in-out forwards, out .2s 2.6s forwards; }
.play .S .ptr.p1 .ring { animation: ringp .4s 2.2s; }
.play .S .toast { animation: in .35s 2.5s forwards, out .3s 3.3s forwards; }
.play .S .ownerapp { animation: out .4s 3.3s forwards; }
.play .S .staffapp { animation: fade .4s 3.3s forwards; }
.play .S .ptr.p2 { opacity: 0; animation: fade .1s 3.8s forwards, sptr2 .9s 3.8s ease-in-out forwards; }
.play .S .ptr.p2 .ring { animation: ringp .4s 4.7s; }
.play .S .nav.lock.set { animation: shake .45s 4.7s; }
.play .S .deny { animation: in .35s 4.8s forwards; }
@keyframes sptr1 { 0% { left: 62%; top: 80%; } 80%,100% { left: 57.2%; top: 63.6%; } }
@keyframes sptr2 { 0% { left: 40%; top: 60%; } 100% { left: 13.3%; top: 71%; } }
@keyframes shake { 20% { translate: calc(-.3 * var(--u)) 0; } 40% { translate: calc(.3 * var(--u)) 0; } 60% { translate: calc(-.2 * var(--u)) 0; } 80% { translate: calc(.2 * var(--u)) 0; } }

`

// Additions on top of the approved CSS: cursor keyframes use measured targets (any layout), cursors and
// dark-scene text are readable from the first frame, square layout (stage 83u x 83u).
export const ANIM_OVERRIDES = String.raw`
.frame { max-width: none; }
.frame *, .frame *::before, .frame *::after { animation-play-state: paused !important; }
.frame .ptr { opacity: 0; }
.R .ptr { left: 60%; top: 75%; }
.T .ptr { left: 40%; top: 85%; }
.S .ptr.p1 { left: 62%; top: 80%; }
.play .R .ptr { animation: fade .3s .3s forwards, rptr 2.2s .6s ease-in-out forwards; }
.play .T .ptr { animation: fade .3s .3s forwards, tptr 4s .6s ease-in-out forwards; }
.play .T .ptr .ring { animation: none; }
.play .S .ptr.p1 { animation: sptr1 1.6s .9s ease-in-out forwards, fade .1s .8s forwards, out .2s 2.6s forwards; }
@keyframes rptr { 0% { left: 60%; top: 75%; } 60%,100% { left: calc(var(--btn-x) - .28 * var(--u)); top: calc(var(--btn-y) - .14 * var(--u)); } }
@keyframes sptr1 { 0% { left: 62%; top: 80%; } 80%,100% { left: calc(var(--send-x) - .28 * var(--u)); top: calc(var(--send-y) - .14 * var(--u)); } }
@keyframes sptr2 { 0% { left: 40%; top: 60%; } 100% { left: calc(var(--lock-x) - .28 * var(--u)); top: calc(var(--lock-y) - .14 * var(--u)); } }
@keyframes tptr {
  0% { left: 40%; top: 85%; }
  15%,26% { left: calc(var(--sw2-x) - .28 * var(--u)); top: calc(var(--sw2-y) - .14 * var(--u)); }
  38%,50% { left: calc(var(--sw3-x) - .28 * var(--u)); top: calc(var(--sw3-y) - .14 * var(--u)); }
  65%,75% { left: calc(var(--lay-x) - .28 * var(--u)); top: calc(var(--lay-y) - .14 * var(--u)); }
  88%,100% { left: calc(var(--logo-x) - .28 * var(--u)); top: calc(var(--logo-y) - .14 * var(--u)); }
}
@keyframes nightink { 0% { color: #252a32; } 8%,40% { color: #e9edf2; } 48%,100% { color: #252a32; } }
.play .A.rem .owner, .play .A.rem .client b { animation: nightink 6.5s forwards; }
.A .row .avatar { color: #fff; }
.A .inbox .bar span { white-space: nowrap; }
.A .inbox .bar span:last-child { font-size: calc(.95 * var(--u)); }
.sq .app { left: 2%; right: 2%; top: 24%; bottom: 12%; }
.sq .A .doc { left: 5%; top: 33%; }
.sq .A .inbox { right: 3%; width: calc(25 * var(--u)); top: 30%; }
.sq .A .trail { left: 37%; width: 26%; top: 31%; }
.sq .A .plane { left: 36%; top: 50%; offset-path: path("M0 0 C 100 -95, 220 -85, 290 15"); }
.sq .A .sent { left: 7%; top: 80%; }
`
