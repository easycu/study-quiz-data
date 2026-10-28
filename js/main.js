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
const OVERLAYS = ["menu", "ranking", "settings", "nameEntry", "pause", "depthSelect", "stars", "notes", "stoneSelect"];
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
function startGame(opts) {
    tryFullscreenLandscape();
    game = new Game(onGameEnd, opts);
    if (opts && opts.save) game.wantSave = true;     // 이어한 판은 바로 다시 저장 (곧바로 나가도 판이 남게)
    game.onPauseChange = paused => show(paused ? "pause" : null);
    Input.handler = game;
    Input.keys.clear();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    show(null);
}
function onGameEnd(r) {
    const st = r.stats, acc = st.asked ? Math.round(st.correct / st.asked * 100) : 0;
    const sec = Math.floor(r.timeMs / 1000), time = `${Math.floor(sec / 60)}분 ${sec % 60}초`;
    $("resTitle").textContent = r.won ? "🌙 꿈에서 깨어났다!" : "게임 오버";
    const end = $("resEnding");
    if (r.won) {
        end.classList.remove("hidden");
        end.innerHTML = (r.depth ? `꿈의 심연 ${r.depth}단계를 돌파했어요!` : "모든 스테이지를 클리어했어요!") +
            `<br>엔딩 보너스 꿈가루 +${st.endingDust}` + (st.opened ? `<br><b>✦ 꿈의 심연 ${r.depth + 1}단계가 열렸어요!</b> (몬스터가 더 강해지고 꿈가루를 더 줘요)` : "");
    } else end.classList.add("hidden");
    const cell = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    $("finalScore").innerHTML =
        cell("점수", r.score.toLocaleString()) + cell("도달", (r.depth ? `심연 ${r.depth} · ` : "") + `스테이지 ${r.stage}`) + cell("시간", time) + cell("처치", r.kills) +
        cell("정답률", `${st.correct}/${st.asked} (${acc}%)`) + cell("최고 연속 정답", st.bestStreak) + cell("방 별점", `★ ${st.stars}`) +
        cell("얻은 꿈가루", `✦ ${st.dust}`) + cell("고른 카드", st.cards) + cell("총", esc(r.gun || "없음")) +
        `<div class="wide2"><span>기억</span><b>${esc(r.skills.join(", ") || "없음")}</b></div>`;
    const wrong = st.wrong || [];
    $("resWrongTitle").textContent = wrong.length ? `이번 판에 틀린 문제 (${wrong.length})` : "이번 판에 틀린 문제 없음 👏";
    $("resWrong").innerHTML = wrong.map(w => `<div class="note"><div class="q">${w.img && !w.q ? "(이미지 문제)" : esc(w.q)}</div>` +
        `<div class="a">정답 <b>${esc(w.a)}</b>${w.e ? " · " + esc(w.e) : ""}</div></div>`).join("");
    $("nameInput").value = localStorageName();
    show("nameEntry");
    $("pauseBtn").classList.add("hidden");
}
function localStorageName() { return Store.get("sr_last_name", "") || ""; }
function backToMenu() {
    game = null;
    Input.handler = null;
    Input.releaseJoystick();
    refreshMenu();
    show("menu");
}
// 메뉴: 이어하기 / 꿈가루 표시
let startArmed = false;
function refreshMenu() {
    const sv = RunSave.exists();
    const c = $("btnContinue");
    c.classList.toggle("hidden", !sv);
    if (sv) c.textContent = `▶ 이어하기  ·  ${sv.depth ? `심연 ${sv.depth} · ` : ""}STAGE ${sv.stage}`;
    $("btnStars").textContent = `✦ 꿈의 별자리 (${Meta.d.dust})`;
    $("startWarn").classList.add("hidden"); startArmed = false;
}
let pendingDepth = 0;
function beginNewRun() {
    RunSave.clear();
    if (Meta.d.maxDepth > 0) { renderDepths(); show("depthSelect"); }
    else chooseStone(0);
}
// 수호석 고르기 -> 시작
function chooseStone(depth) {
    pendingDepth = depth;
    const box = $("stoneList");
    box.innerHTML = STONES.map(st => {
        const ok = Meta.stoneOk(st.id), cur = Meta.d.stone === st.id;
        return `<button class="stone${ok ? "" : " locked"}${cur ? " cur" : ""}" data-s="${st.id}" ${ok ? "" : "disabled"} style="--c:rgb(${st.color})">` +
            `<span class="si">${st.icon}</span><b>${st.name}</b><small>${ok ? st.eff : "🔒 " + st.lock}</small></button>`;
    }).join("");
    box.querySelectorAll("button.stone").forEach(b => b.onclick = () => { Meta.setStone(b.dataset.s); startGame({ depth: pendingDepth, stone: b.dataset.s }); });
    show("stoneSelect");
}
function renderDepths() {
    const box = $("depthList"), max = Meta.d.maxDepth;
    let html = "";
    for (let d = 0; d <= max; d++) {
        const info = d === 0 ? "기본 난이도" :
            `몬스터 체력 +${Math.round(ABYSS_HP_PER_DEPTH * d * 100)}% · 피해 +${Math.round(ABYSS_DMG_PER_DEPTH * d * 100)}% · 수 +${Math.round(ABYSS_COUNT_PER_DEPTH * d)} · 꿈가루 +${Math.round(ABYSS_DUST_PER_DEPTH * d * 100)}%`;
        html += `<button class="depth${d === max ? " big" : ""}" data-d="${d}"><b>${d === 0 ? "꿈의 문턱" : `꿈의 심연 ${d}단계`}</b><small>${info}</small></button>`;
    }
    box.innerHTML = html;
    box.querySelectorAll("button.depth").forEach(b => b.onclick = () => chooseStone(Number(b.dataset.d)));
}

// ---------------- 꿈의 별자리 (별 지도) ----------------
let resetArmed = false, starTab = 0, starSel = null;
function renderStars() {
    $("dustNow").textContent = Meta.d.dust;
    const cons = CONSTELLATIONS[starTab];
    $("consTabs").innerHTML = CONSTELLATIONS.map((c, i) => {
        const lit = c.nodes.filter(n => Meta.level(n.id) > 0).length;
        return `<button class="ctab${i === starTab ? " on" : ""}" data-i="${i}" style="--c:rgb(${c.color})">${c.icon} ${c.name}<small>${lit}/${c.nodes.length}</small></button>`;
    }).join("");
    $("consTabs").querySelectorAll("button.ctab").forEach(b => b.onclick = () => { starTab = Number(b.dataset.i); starSel = null; renderStars(); });
    // 별 지도: 선 -> 별
    const col = `rgb(${cons.color})`;
    let svg = `<defs><radialGradient id="sky" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#262046"/><stop offset="1" stop-color="#0b0b18"/></radialGradient></defs>`;
    svg += `<rect x="0" y="0" width="100" height="100" fill="url(#sky)" rx="3"/>`;
    for (let k = 0; k < 40; k++) { const x = (k * 37.3) % 100, y = (k * 61.7) % 100; svg += `<circle cx="${x}" cy="${y}" r="${0.15 + (k % 3) * 0.12}" fill="#fff" opacity="${0.15 + (k % 4) * 0.1}"/>`; }
    for (const n of cons.nodes) for (const pid of n.parents) {
        const pn = NODE_BY_ID[pid], on = Meta.level(pid) > 0 && Meta.level(n.id) > 0, near = Meta.level(pid) > 0;
        svg += `<line x1="${pn.x}" y1="${pn.y}" x2="${n.x}" y2="${n.y}" stroke="${on ? col : near ? "#8a86b0" : "#3b3a55"}" stroke-width="${on ? 0.9 : 0.5}" ${on ? "" : 'stroke-dasharray="1.5 1.2"'}/>`;
    }
    for (const n of cons.nodes) {
        const lv = Meta.level(n.id), open = Meta.unlocked(n.id), sel = starSel === n.id;
        const r = n.cap ? 4.4 : 3.2;
        if (lv > 0) svg += `<circle cx="${n.x}" cy="${n.y}" r="${r * 2.2}" fill="${col}" opacity="0.18"/>`;
        svg += `<g class="star" data-n="${n.id}" style="cursor:pointer">` +
            `<circle cx="${n.x}" cy="${n.y}" r="${r + 3.5}" fill="transparent"/>` +
            `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${lv > 0 ? col : open ? "#2c2a4a" : "#1a1a2a"}" stroke="${sel ? "#fff" : lv > 0 ? "#fff" : open ? col : "#4a4866"}" stroke-width="${sel ? 0.9 : 0.5}"/>` +
            (n.cap ? `<text x="${n.x}" y="${n.y + 1.3}" font-size="3.6" text-anchor="middle" fill="${lv > 0 ? "#222" : col}">★</text>` : "") +
            `<text x="${n.x}" y="${n.y + r + 4.2}" font-size="3" text-anchor="middle" fill="${lv > 0 ? "#fff" : open ? "#c8c4e8" : "#6a6888"}">${n.name}${n.max > 1 ? ` ${lv}/${n.max}` : ""}</text></g>`;
    }
    const map = $("starMap");
    map.innerHTML = svg;
    map.querySelectorAll("g.star").forEach(gEl => gEl.addEventListener("click", () => { starSel = gEl.dataset.n; renderStars(); }));
    // 설명 칸
    const info = $("starInfo");
    const n = starSel ? NODE_BY_ID[starSel] : null;
    if (!n) info.innerHTML = `<h3 style="color:${col}">${cons.icon} ${cons.name}의 별자리</h3><p>${cons.desc}</p><p class="hint">별을 누르면 설명이 나와요.<br>이어진 별을 하나라도 밝혀야 다음 별을 밝힐 수 있어요.<br>★ 큰 별은 끝별(마지막 특전)이에요.</p>`;
    else {
        const lv = Meta.level(n.id), open = Meta.unlocked(n.id), cost = Meta.cost(n.id), maxed = lv >= n.max;
        const btn = maxed ? `<button disabled>완성</button>` : !open ? `<button disabled>🔒 이어진 별을 먼저</button>` :
            `<button id="btnBuyStar" ${Meta.d.dust >= cost ? "" : "disabled"}>✦ ${cost} 밝히기</button>`;
        info.innerHTML = `<h3 style="color:${col}">${n.cap ? "★ " : ""}${n.name}</h3><div class="lv">${"★".repeat(lv)}${"☆".repeat(n.max - lv)}  ${lv}/${n.max}</div>` +
            `<p>${n.eff}${n.max > 1 && !n.once ? " (단계마다)" : ""}</p>${btn}`;
        const b = $("btnBuyStar");
        if (b) b.onclick = () => { if (Meta.buy(n.id)) { Sound.play("powerup", { vol: 0.5 }); } renderStars(); };
    }
    const total = Meta.totalCost();
    $("starsNote").textContent = `쓴 꿈가루 ${Meta.d.spent} / 전체 ${total}` + (Meta.d.refunded ? " · 별자리가 새로 바뀌어서 예전에 쓴 꿈가루를 모두 돌려드렸어요" : "");
    $("btnStarsReset").textContent = resetArmed ? "정말 초기화할까요? (한 번 더 누르기)" : `초기화 (쓴 꿈가루 ${Meta.d.spent} 돌려받기)`;
}
$("btnStars").onclick = () => { resetArmed = false; starSel = null; renderStars(); show("stars"); if (Meta.d.refunded) { Meta.d.refunded = false; Meta.save(); } };
$("btnStarsReset").onclick = () => {
    if (!resetArmed) { resetArmed = true; renderStars(); return; }
    Meta.reset(); resetArmed = false; renderStars();
};

// ---------------- 오답 노트 ----------------
function renderNotes() {
    const list = wrongNoteEntries();
    const total = list.reduce((a, e) => a + e.count, 0);
    $("notesInfo").textContent = list.length ? `틀린 문제 ${list.length}개 (모두 ${total}번 틀림) · 최근에 틀린 순서` : "아직 틀린 문제가 없어요";
    const byId = new Map((Problems.list || []).map(p => [p.id, p]));
    let html = "", lastDate = null;
    for (const e of list) {
        if (e.last !== lastDate) { html += `<div class="date">${esc(e.last || "날짜 없음")}</div>`; lastDate = e.last; }
        const prob = byId.get(e.id);
        const img = prob && prob._qimg ? `<img src="${prob._qimg}" alt="문제 이미지">` : "";
        html += `<div class="note" data-id="${esc(e.id)}"><div class="q">${esc(e.question || "")}</div>${img}` +
            `<div class="meta">${e.count}번 틀림</div>` +
            `<div class="tries"><button class="ox" data-a="O">O</button><button class="ox" data-a="X">X</button>` +
            `<button class="show">정답 보기</button><button class="del">지우기</button></div>` +
            `<div class="ans hidden">정답 <b>${esc(e.correct)}</b>${e.explanation ? `<div class="exp">${esc(e.explanation)}</div>` : ""}</div></div>`;
    }
    $("notesList").innerHTML = html;
    $("notesList").querySelectorAll(".note").forEach(el => {
        const id = el.dataset.id, e = list.find(x => x.id === id), ans = el.querySelector(".ans");
        el.querySelectorAll("button.ox").forEach(b => b.onclick = () => {
            const ok = b.dataset.a === e.correct;
            el.classList.remove("ok", "bad"); el.classList.add(ok ? "ok" : "bad");
            ans.classList.remove("hidden");
            ans.firstChild.textContent = ok ? "⭕ 맞았어요! 정답 " : "❌ 틀렸어요. 정답 ";
            Sound.play(ok ? "correct" : "wrong", { vol: 0.5 });
        });
        el.querySelector("button.show").onclick = () => ans.classList.toggle("hidden");
        el.querySelector("button.del").onclick = () => { removeWrongNote(id); renderNotes(); };
    });
}
$("btnNotes").onclick = () => { renderNotes(); show("notes"); };

$("btnContinue").onclick = async () => {
    if (syncPromise) { $("btnContinue").disabled = true; await syncPromise; $("btnContinue").disabled = false; }
    const sv = RunSave.exists();
    if (!sv) { refreshMenu(); return; }
    try { startGame({ save: sv }); }
    catch (e) { RunSave.clear(); refreshMenu(); setStatus("저장된 판을 불러오지 못했어요: " + e, "err"); show("menu"); }
};
$("btnStart").onclick = async () => {
    if (RunSave.exists() && !startArmed) { startArmed = true; $("startWarn").classList.remove("hidden"); return; }
    if (syncPromise) { $("btnStart").disabled = true; await syncPromise; }
    beginNewRun();
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
    Opts.save(); renderOpts();
    Sound.applyVolume();
    if (k === "music") Sound.musicToggled();
    if (k === "sfx") Sound.play("select", { vol: 0.5 });
}));
// 지금 상황에 맞는 배경음악
function updateMusic() {
    let want = "menu";
    if (game) {
        if (game.gameOver || game.ending) want = null;
        else want = (game.room.type === "boss" && !game.room.cleared) ? "boss" : "battle";
    } else if (Sound.musicRate !== 1) Sound.setMusicRate(1);
    if (want !== Sound.wantMusic) Sound.playMusic(want);
    Sound.setDuck(game && (game.modalOpen || game.paused) ? 0.4 : 1);
}
setInterval(updateMusic, 250);

// ---------------- 시작 ----------------
try { loadGunSettings(); } catch (e) { /* 저장된 설정이 망가졌으면 기본값 사용 */ }
Opts.load(); renderOpts();
Meta.load(); refreshMenu();
Sound.init();
Input.init(canvas);
loadSprites();
loadGfx();
show("menu");
startSync();
requestAnimationFrame(frame);
