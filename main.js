// =============================================================
// 시작점: 메뉴 / 랭킹 / 설정 / 이름 입력 / 일시정지 + 화면 크기 맞추기 + 게임 루프
// =============================================================
"use strict";

const $ = id => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
let game = null;
let syncPromise = null;

// ---------------- 화면 크기: 900x650 게임 화면을 창에 꽉 맞추고 남는 곳은 검은 여백 ----------------
function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const scale = Math.min(w / SCREEN_W, h / SCREEN_H);
    Input.view = { scale, offX: (w - SCREEN_W * scale) / 2, offY: (h - SCREEN_H * scale) / 2, dpr };
    // 일시정지 버튼: 게임 화면 윗줄(점수 오른쪽)에 둔다
    const btn = $("pauseBtn");
    const size = Math.max(38, 44 * scale);
    btn.style.width = btn.style.height = size + "px";
    btn.style.left = (Input.view.offX + 700 * scale) + "px";
    btn.style.top = (Input.view.offY + 10 * scale) + "px";
    // 세로 화면 안내 (터치 기기에서 세로일 때만)
    const portrait = h > w && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    $("rotateHint").classList.toggle("hidden", !portrait);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));
resize();

// ---------------- 게임 루프 (1초에 60칸 고정 진행) ----------------
let lastT = performance.now(), acc = 0;
function frame(t) {
    let dt = t - lastT; lastT = t;
    if (dt > 250) dt = 250;               // 다른 탭에 갔다 오면 한꺼번에 몰아서 진행하지 않게
    acc += dt;
    let steps = 0;
    while (acc >= FRAME_MS && steps < 5) {
        if (game) game.step();
        acc -= FRAME_MS; steps++;
    }
    if (steps >= 5) acc = 0;
    draw();
    requestAnimationFrame(frame);
}
function draw() {
    const v = Input.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!game) return;
    ctx.save();
    ctx.translate(v.offX, v.offY);
    ctx.scale(v.scale, v.scale);
    ctx.beginPath(); ctx.rect(0, 0, SCREEN_W, SCREEN_H); ctx.clip();
    game.draw(ctx);
    if (game.paused) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    ctx.restore();
    if (!game.quiz && !game.paused) Input.drawJoystick(ctx);
}

// ---------------- 화면 전환 ----------------
const OVERLAYS = ["menu", "ranking", "settings", "nameEntry", "pause"];
function show(id) {
    for (const o of OVERLAYS) $(o).classList.toggle("hidden", o !== id);
    $("pauseBtn").classList.toggle("hidden", !(game && id === null));
}

// ---------------- 문제 받기 ----------------
function setStatus(text, kind) {
    const el = $("syncStatus");
    el.textContent = text;
    el.className = "status" + (kind ? " " + kind : "");
}
function startSync() {
    if (syncPromise) return syncPromise;
    $("btnSync").disabled = true;
    $("btnStart").disabled = true;
    setStatus("문제를 불러오는 중...");
    syncPromise = Problems.sync(msg => setStatus(msg)).then(res => {
        const total = (Problems.list || []).length;
        setStatus(res.message + (res.ok ? "" : ` · 지금 문제 ${total}개`), res.ok ? "ok" : "warn");
        return res;
    }).catch(e => {
        setStatus("문제를 불러오지 못했습니다: " + e, "err");
    }).finally(() => {
        $("btnSync").disabled = false;
        $("btnStart").disabled = false;
        syncPromise = null;
    });
    return syncPromise;
}

// ---------------- 게임 시작 / 끝 ----------------
function tryFullscreenLandscape() {
    // 안드로이드 크롬: 전체화면 + 가로 고정. (아이폰은 지원하지 않아서 그냥 무시됨)
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
function startGame() {
    tryFullscreenLandscape();
    game = new Game(onGameEnd);
    game.onPauseChange = paused => show(paused ? "pause" : null);
    Input.handler = game;
    Input.keys.clear();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    show(null);
}
function onGameEnd(result) {
    $("finalScore").textContent = `점수 ${result.score}  ·  스테이지 ${result.stage}  ·  처치 ${result.kills}`;
    $("nameInput").value = localStorageName();
    show("nameEntry");
    $("pauseBtn").classList.add("hidden");
}
function localStorageName() { return Store.get("sr_last_name", "") || ""; }
function backToMenu() {
    game = null;
    Input.handler = null;
    Input.releaseJoystick();
    show("menu");
}

$("btnStart").onclick = async () => {
    if (syncPromise) { $("btnStart").disabled = true; await syncPromise; }
    startGame();
};
$("btnSync").onclick = () => startSync();
$("btnRanking").onclick = () => { renderRanking(); show("ranking"); };
$("btnSettings").onclick = () => { renderSettings(currentGunSettings()); show("settings"); };
document.querySelectorAll(".back").forEach(b => b.onclick = () => show("menu"));

$("pauseBtn").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); if (game && !game.gameOver) game.setPaused(true); });
$("btnResume").onclick = () => game && game.setPaused(false);
$("btnQuit").onclick = () => backToMenu();

function saveName(save) {
    if (!game) return backToMenu();
    if (save) {
        const name = $("nameInput").value.trim() || "Player";
        Store.set("sr_last_name", name);
        saveScoreEntry(name, game.score, game.stage, game.totalKills);
        backToMenu();
        renderRanking(); show("ranking");
        return;
    }
    backToMenu();
}
$("btnNameSave").onclick = () => saveName(true);
$("btnNameSkip").onclick = () => saveName(false);
$("nameInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveName(true); } });

// 다른 앱/탭으로 가면 자동 일시정지 (전투 중 갑자기 죽지 않게)
document.addEventListener("visibilitychange", () => {
    if (document.hidden && game && !game.paused && !game.gameOver && !game.ended) game.setPaused(true);
});

// ---------------- 랭킹 ----------------
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function renderRanking() {
    const scores = loadScores();
    const t = $("rankTable");
    if (!scores.length) { t.innerHTML = `<tr><td>아직 기록이 없습니다. 게임을 플레이해보세요!</td></tr>`; return; }
    t.innerHTML = `<tr><th>순위</th><th>점수</th><th>스테이지</th><th>처치</th><th>이름</th><th>날짜</th></tr>` +
        scores.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.score || 0)}</td><td>${esc(s.stage || 1)}</td><td>${esc(s.kills || 0)}</td>` +
            `<td class="name">${esc(s.name || "Player")}</td><td>${esc(s.date || "")}</td></tr>`).join("");
}

// ---------------- 총 성능 보기 (값은 문제 편집기에서 바꿔 깃허브에 올림) ----------------
function renderSettings(values) {
    const t = $("gunTable");
    const grades = GUN_GRADES.map(g => g[1]);
    let html = `<tr><th>총</th>${grades.map(g => `<th>${g}</th>`).join("")}<th>의미</th></tr>`;
    for (const el of GUN_ELEMENT_ORDER) {
        html += `<tr><td>${GUN_ELEMENTS[el][0]}</td>` + values.effects[el].map(v => `<td>${esc(v)}</td>`).join("") +
            `<td class="desc">${esc(GUN_SETTING_INFO[el][0])}</td></tr>`;
    }
    html += `<tr><td>공격력<br>보너스</td>` + values.atk_bonus.map(v => `<td>${esc(v)}</td>`).join("") +
        `<td class="desc">등급별 공격력 +%</td></tr>`;
    t.innerHTML = html;
    const msg = $("settingsMsg");
    msg.textContent = { github: "깃허브의 총 설정을 쓰는 중입니다.",
                        local: "이 기기에 저장된 예전 설정을 쓰는 중입니다 (깃허브에 아직 총 설정이 없음).",
                        default: "기본값을 쓰는 중입니다 (깃허브에 아직 총 설정이 없음)." }[GunSource.from];
    msg.className = "status" + (GunSource.from === "github" ? " ok" : " warn");
}

// ---------------- 시작 ----------------
try { loadGunSettings(); } catch (e) { /* 저장된 설정이 망가졌으면 기본값 사용 */ }
Input.init(canvas);
loadSprites();
show("menu");
startSync();
requestAnimationFrame(frame);
