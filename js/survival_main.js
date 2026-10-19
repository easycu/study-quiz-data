// =============================================================
// 서바이벌 모드 시작점: 무기 고르기 / 일시정지 / 결과 / 기록 + 화면 맞추기 + 게임 루프
// =============================================================
"use strict";

const $ = id => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
let game = null;
const KEY_SURV = "sr_surv_scores";

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const scale = Math.min(w / SCREEN_W, h / SCREEN_H);
    Input.view = { scale, offX: (w - SCREEN_W * scale) / 2, offY: (h - SCREEN_H * scale) / 2, dpr };
    const btn = $("pauseBtn"), size = Math.max(38, 44 * scale);
    btn.style.width = btn.style.height = size + "px";
    btn.style.left = (Input.view.offX + 790 * scale) + "px";
    btn.style.top = (Input.view.offY + 18 * scale) + "px";
    const portrait = h > w && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    $("rotateHint").classList.toggle("hidden", !portrait);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));
resize();

// ---------------- 게임 루프 (1초에 60칸) ----------------
let lastT = performance.now(), acc = 0;
function frame(t) {
    let dt = t - lastT; lastT = t;
    if (dt > 250) dt = 250;
    acc += dt;
    let steps = 0;
    while (acc >= FRAME_MS && steps < 5) { if (game) game.step(); acc -= FRAME_MS; steps++; }
    if (steps >= 5) acc = 0;
    draw();
    requestAnimationFrame(frame);
}
let demoT = 0;
function draw() {
    const v = Input.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(v.offX, v.offY); ctx.scale(v.scale, v.scale);
    ctx.beginPath(); ctx.rect(0, 0, SCREEN_W, SCREEN_H); ctx.clip();
    if (game) {
        svDraw(ctx, game, game.now, Input.lastType === "touch");
        if (game.paused) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    } else {
        // 메뉴 뒤 배경: 바닥만 천천히 흐르게
        const tile = GFX.tiles.field || GFX.tiles.floor_battle;
        demoT += 0.4;
        if (tile) { const tw = tile.width * 2; ctx.imageSmoothingEnabled = false; for (let y = -tw; y < SCREEN_H; y += tw) for (let x = -tw; x < SCREEN_W + tw; x += tw) ctx.drawImage(tile, x - (demoT % tw), y - (demoT * 0.5 % tw), tw, tw); }
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    ctx.restore();
    if (game && !game.ui && !game.paused && !game.over) Input.drawJoystick(ctx);
    // 문제/강화 화면에서는 일시정지 버튼을 숨겨서 화면을 가리지 않게
    const pb = $("pauseBtn"), hidePb = !game || !!game.ui || game.paused || game.over;
    if (pb.classList.contains("hidden") !== hidePb) pb.classList.toggle("hidden", hidePb);
}

// ---------------- 화면 전환 ----------------
const OVERLAYS = ["svMenu", "pause", "svResult"];
function show(id) {
    for (const o of OVERLAYS) $(o).classList.toggle("hidden", o !== id);
    $("pauseBtn").classList.toggle("hidden", !(game && id === null));
}

function tryFullscreenLandscape() {
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!touch) return;
    const el = document.documentElement;
    try {
        if (!document.fullscreenElement && el.requestFullscreen) {
            el.requestFullscreen({ navigationUI: "hide" }).then(() => {
                if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
            }).catch(() => {});
        }
    } catch (e) { /* 무시 */ }
}
let syncPromise = null;
function startGame(weapon) {
    tryFullscreenLandscape();
    game = new SurvivalGame(weapon, onEnd);
    game.onPauseChange = paused => show(paused ? "pause" : null);
    Input.handler = game;
    Input.keys.clear();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    show(null);
}
document.querySelectorAll("button.wpn").forEach(b => b.onclick = async () => {
    if (syncPromise) { document.querySelectorAll("button.wpn").forEach(x => x.disabled = true); await syncPromise; document.querySelectorAll("button.wpn").forEach(x => x.disabled = false); }
    startGame(b.dataset.w);
});

// ---------------- 결과 ----------------
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function loadSurv() { const s = Store.get(KEY_SURV, []); return Array.isArray(s) ? s : []; }
function onEnd(r) {
    const list = loadSurv();
    const entry = { score: r.score, time: r.timeMs, kills: r.kills, level: r.level, won: r.won, date: todayISO() };
    list.push(entry); list.sort((a, b) => b.score - a.score);
    Store.set(KEY_SURV, list.slice(0, 10));
    const best = list[0] === entry;
    $("svResTitle").textContent = r.won ? "🏆 생존 성공!" : "쓰러졌다...";
    const acc = r.quiz.asked ? Math.round(r.quiz.right / r.quiz.asked * 100) : 0;
    $("svResStats").innerHTML =
        `<div class="big">${r.score.toLocaleString()}점${best ? " <span class='new'>최고 기록!</span>" : ""}</div>` +
        `<div>버틴 시간 <b>${svFmtTime(r.timeMs)}</b> · 처치 <b>${r.kills}</b> · 레벨 <b>${r.level}</b> · 최대 콤보 <b>${r.maxCombo}</b></div>` +
        `<div>문제 <b>${r.quiz.right}/${r.quiz.asked}</b> 정답 (${acc}%)</div>`;
    const rows = Object.entries(r.dmgBy).filter(([k]) => k !== "?").sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    const nm = k => (SV_WEAPONS[k] ? (r.weapons.find(w => w.id === k && w.evo) ? SV_EVO_NAME[k] : SV_WEAPONS[k].name) : k === "bomb" ? "폭탄" : k);
    $("svResDmg").innerHTML = rows.map(([k, v]) => {
        const c = SV_WEAPONS[k] ? SV_WEAPONS[k].color : [200, 200, 200];
        return `<div class="dmgrow"><span>${esc(nm(k))}</span><i style="width:${Math.max(2, v / max * 100)}%;background:rgb(${c})"></i><b>${fmtNum(Math.round(v))}</b></div>`;
    }).join("");
    show("svResult");
    $("pauseBtn").classList.add("hidden");
}
function renderRecords() {
    const s = loadSurv();
    $("svRecords").innerHTML = s.length
        ? `<tr><th>순위</th><th>점수</th><th>시간</th><th>처치</th><th>레벨</th><th>날짜</th></tr>` +
          s.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.score)}${e.won ? " 🏆" : ""}</td><td>${svFmtTime(e.time)}</td><td>${esc(e.kills)}</td><td>${esc(e.level)}</td><td>${esc(e.date)}</td></tr>`).join("")
        : `<tr><td>아직 기록이 없습니다</td></tr>`;
}
function backToMenu() { game = null; Input.handler = null; Input.releaseJoystick(); renderRecords(); show("svMenu"); }
$("btnAgain").onclick = () => backToMenu();
$("pauseBtn").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); if (game && !game.over) game.setPaused(true); });
$("btnResume").onclick = () => game && game.setPaused(false);
$("btnQuit").onclick = () => backToMenu();
document.addEventListener("visibilitychange", () => { if (document.hidden && game && !game.paused && !game.over) game.setPaused(true); });

// ---------------- 화면·소리 설정 ----------------
const OPT_LABEL = {
    quality: v => v === "high" ? "효과: 높음" : "효과: 낮음",
    sfx: v => v ? "효과음: 켜짐" : "효과음: 꺼짐",
    music: v => v ? "배경음악: 켜짐" : "배경음악: 꺼짐",
    shake: v => v ? "화면 흔들림: 켜짐" : "화면 흔들림: 꺼짐",
};
function renderOpts() {
    document.querySelectorAll("button.opt").forEach(b => {
        const k = b.dataset.opt, v = Opts.data[k];
        b.textContent = OPT_LABEL[k](v);
        const on = k === "quality" ? v === "high" : !!v;
        b.classList.toggle("on", on); b.classList.toggle("off", !on);
    });
}
document.querySelectorAll("button.opt").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.opt;
    if (k === "quality") Opts.data.quality = Opts.data.quality === "high" ? "low" : "high";
    else Opts.data[k] = !Opts.data[k];
    Opts.save(); renderOpts(); Sound.applyVolume();
    if (k === "music") Sound.musicToggled();
    if (k === "sfx") Sound.play("select", { vol: 0.5 });
}));
function updateMusic() {
    let want = "menu";
    if (game) want = game.over ? null : (game.boss && !game.boss.dead) ? "boss" : "battle";
    if (want !== Sound.wantMusic) Sound.playMusic(want);
    Sound.setDuck(game && (game.ui || game.paused) ? 0.4 : 1);
}
setInterval(updateMusic, 250);

// ---------------- 시작 ----------------
try { loadGunSettings(); } catch (e) { /* 무시 */ }
Opts.load(); renderOpts();
Sound.init();
Input.init(canvas);
loadSprites();
loadGfx();
renderRecords();
show("svMenu");
$("svStatus").textContent = "문제를 불러오는 중...";
syncPromise = Problems.sync(msg => $("svStatus").textContent = msg)
    .then(res => { $("svStatus").textContent = res.message; $("svStatus").className = "status " + (res.ok ? "ok" : "warn"); })
    .catch(e => { $("svStatus").textContent = "문제를 불러오지 못했습니다: " + e; })
    .finally(() => { syncPromise = null; });
requestAnimationFrame(frame);
