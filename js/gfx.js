// =============================================================
// 그래픽 자원 / 연출 도구
//   - Ninja Adventure 몬스터·보스·효과 스프라이트, Kenney 파티클 불러오기
//   - 스프라이트 시트 애니메이션, 빛나는 효과(더하기 합성), 조명(어둠 + 빛 웅덩이)
//   - 방 바닥(타일 + 장식 + 횃불) 미리 그려두기
//   - 효과 품질: 높음(조명/빛/장식/잔해) / 낮음(가벼움)
// =============================================================
"use strict";

const GFX = {
    ready: false,
    mon: {},        // key -> [4방향][4프레임] 캔버스
    boss: {},       // key -> {idle:[프레임], move:[프레임]}
    fx: {},         // key -> [프레임]
    kp: {},         // Kenney 파티클 이미지
    tiles: {},
};

// ---------------- 설정 (기기마다 저장) ----------------
const Opts = {
    data: { quality: "high", sfx: true, music: true, shake: true, sfxVol: 0.8, musicVol: 0.45 },
    load() {
        const saved = Store.get("sr_opts", null);
        if (saved && typeof saved === "object") Object.assign(this.data, saved);
        // 처음 켰을 때: 성능이 낮아 보이는 기기는 효과 낮음으로 시작
        else {
            const lowEnd = (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2;
            if (lowEnd) this.data.quality = "low";
        }
    },
    save() { Store.set("sr_opts", this.data); },
    get high() { return this.data.quality === "high"; },
};

function _sliceFrames(img, n, fw, fh, row) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const c = document.createElement("canvas"); c.width = fw; c.height = fh;
        c.getContext("2d").drawImage(img, i * fw, (row || 0) * fh, fw, fh, 0, 0, fw, fh);
        out.push(c);
    }
    return out;
}

async function loadGfx() {
    const jobs = [];
    const add = (src, fn) => jobs.push(loadImage(src).then(img => { if (img) fn(img); }));
    // 일반 몬스터: 64x64 = 열(아래/위/왼쪽/오른쪽) x 행(4프레임)
    for (const key of ASSET_META.monsters) {
        add(`assets/monsters2/${key}.png`, img => {
            const dirs = [];
            for (let d = 0; d < 4; d++) {
                const frames = [];
                for (let f = 0; f < 4; f++) {
                    const c = document.createElement("canvas"); c.width = 16; c.height = 16;
                    c.getContext("2d").drawImage(img, d * 16, f * 16, 16, 16, 0, 0, 16, 16);
                    frames.push(c);
                }
                dirs.push(frames);
            }
            GFX.mon[key] = dirs;
        });
    }
    for (const [key, anims] of Object.entries(ASSET_META.boss)) {
        GFX.boss[key] = {};
        for (const name of ["idle", "move"]) {
            const [n, fw, fh] = anims[name];
            add(`assets/bosses/${key}_${name}.png`, img => { GFX.boss[key][name] = _sliceFrames(img, n, fw, fh); });
        }
    }
    for (const [key, [n, fw, fh]] of Object.entries(ASSET_META.fx)) {
        add(`assets/fx/${key}.png`, img => { GFX.fx[key] = _sliceFrames(img, n, fw, fh); });
    }
    for (const k of ["circle_05", "light_01", "star_06", "star_07", "spark_01", "smoke_04", "smoke_07", "scorch_02", "slash_02",
                     "twirl_01", "magic_02", "flare_01", "muzzle_02", "dirt_02", "circle_03", "trace_01"]) {
        add(`assets/kp/${k}.png`, img => { GFX.kp[k] = img; });
    }
    for (const k of ["floor_battle", "floor_start", "floor_boss", "crate", "brick", "pillar", "rock", "skull", "bone",
                     "pebbles", "grass1", "grass2", "grass3", "crack", "field"]) {
        add(`assets/tiles/${k}.png`, img => { GFX.tiles[k] = img; });
    }
    await Promise.all(jobs);
    GFX.ready = true;
}

// ---------------- 색 입히기 (흰 그림 -> 원하는 색) ----------------
const _colorCache = new WeakMap();
function coloredImage(img, color) {
    if (!img) return null;
    let m = _colorCache.get(img);
    if (!m) { m = new Map(); _colorCache.set(img, m); }
    const key = color.join(",");
    let c = m.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = rgb(color); g.fillRect(0, 0, c.width, c.height);
    m.set(key, c);
    return c;
}
// 몬스터/보스 그림에 색 덧입히기 (엘리트·분노) / 맞을 때 하얗게
const _tintCache2 = new WeakMap();
function tintSprite(frame, color, flash) {
    if (!color && !flash) return frame;
    let m = _tintCache2.get(frame);
    if (!m) { m = new Map(); _tintCache2.set(frame, m); }
    const key = (color ? color.join(",") : "-") + (flash ? "f" : "");
    let c = m.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = frame.width; c.height = frame.height;
    const g = c.getContext("2d");
    g.drawImage(frame, 0, 0);
    const o = document.createElement("canvas"); o.width = frame.width; o.height = frame.height;
    const og = o.getContext("2d");
    og.fillStyle = flash ? "rgba(255,255,255,0.85)" : rgb(color, 0.38);
    og.fillRect(0, 0, o.width, o.height);
    og.globalCompositeOperation = "destination-in"; og.drawImage(frame, 0, 0);
    g.globalCompositeOperation = flash ? "source-over" : "source-atop";
    g.drawImage(o, 0, 0);
    m.set(key, c);
    return c;
}

// ---------------- 그리기 도구 ----------------
// 픽셀 그림 (흐리게 번지지 않게)
function drawPixel(ctx, img, cx, cy, w, h, flipX, alpha) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha !== undefined) ctx.globalAlpha *= alpha;
    if (flipX) { ctx.translate(cx, cy); ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, -h / 2, w, h); }
    else ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
    ctx.restore();
}
// 빛 (더하기 합성으로 밝게)
function drawGlow(ctx, x, y, radius, color, alpha) {
    const img = GFX.kp.circle_05;
    if (!img || !Opts.high || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(coloredImage(img, color), x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
}
// 효과 스프라이트 (흰색 Kenney 파티클을 색 입혀서)
function drawKp(ctx, name, x, y, size, color, alpha, rot, additive) {
    const img = GFX.kp[name];
    if (!img) return;
    ctx.save();
    if (additive) ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(color ? coloredImage(img, color) : img, -size / 2, -size / 2, size, size);
    ctx.restore();
}
// 스프라이트 시트 애니메이션 한 장 (t: 0~1 진행도)
function drawSheet(ctx, key, t, x, y, scale, rot, alpha, color) {
    const frames = GFX.fx[key];
    if (!frames) return false;
    const f = frames[Math.min(frames.length - 1, Math.max(0, Math.floor(t * frames.length)))];
    const img = color ? tintSprite(f, color) : f;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha !== undefined) ctx.globalAlpha *= alpha;
    ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -f.width * scale / 2, -f.height * scale / 2, f.width * scale, f.height * scale);
    ctx.restore();
    return true;
}
// 바닥 그림자
function drawBlobShadow(ctx, x, y, rx, ry, alpha) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${alpha === undefined ? 0.32 : alpha})`; ctx.fill();
}

// ---------------- 몬스터 / 보스 그림 고르기 ----------------
function monsterGfxKey(m) {
    if (m.type === "summoner") return "summoner";
    if (m.isMinion && m.subtype === "chase") return m.color === SPLITTER_COLOR ? "splitter" : "minion";
    return GFX.mon[m.subtype] ? m.subtype : (m.type === "melee" ? "chase" : "single");
}
function dirIndex(dx, dy) {       // 0 아래 / 1 위 / 2 왼쪽 / 3 오른쪽
    if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 0 : 1;
    return dx < 0 ? 2 : 3;
}
function monsterFrame(m, now, aim) {
    const dirs = GFX.mon[monsterGfxKey(m)];
    if (!dirs) return null;
    const d = dirIndex(aim.x - m.x, aim.y - m.y);
    const speedy = m.speed > 0 ? 1 : 0.4;
    return dirs[d][Math.floor((now * speedy + m.animOffset) / ANIM_FRAME_MS) % 4];
}
function bossGfxKey(m) {
    const k = (m.parts && m.parts[0]) || m.variant;
    return GFX.boss[k] ? k : "brute";
}
function bossFrame(m, now) {
    const b = GFX.boss[bossGfxKey(m)];
    if (!b) return null;
    const moving = m.bstate === "move" || m.dashState === "dashing";
    const frames = (moving ? b.move : b.idle) || b.idle;
    if (!frames || !frames.length) return null;
    return frames[Math.floor((now + m.animOffset) / (moving ? 110 : 150)) % frames.length];
}

// ---------------- 방 바닥 (한 번만 그려 두기) ----------------
function _seeded(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const ROOM_AMBIENT = {     // [어둠 색, 어둠 진하기]
    start: [[14, 18, 30], 0.45], battle: [[6, 6, 16], 0.74], boss: [[26, 4, 8], 0.78],
};
function roomFloor(room, stage) {
    if (room._floor && room._floorStage === stage) return room._floor;
    const W = PLAY_RIGHT - PLAY_LEFT, H = PLAY_BOTTOM - PLAY_TOP;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    const tile = GFX.tiles[room.type === "start" ? "floor_start" : room.type === "boss" ? "floor_boss" : "floor_battle"];
    if (tile) {
        const tw = tile.width * 2, th = tile.height * 2;
        for (let y = 0; y < H; y += th) for (let x = 0; x < W; x += tw) g.drawImage(tile, x, y, tw, th);
    } else { g.fillStyle = rgb(ROOM_BG_COLOR[room.type] || [38, 38, 52]); g.fillRect(0, 0, W, H); }
    // 가장자리를 조금 어둡게 (벽 쪽 그늘)
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // 장식 (바닥 무늬): 장애물 자리는 피함
    const rnd = _seeded((room.x + 50) * 7919 + (room.y + 50) * 104729 + stage * 31);
    const obs = room.obstacles || [];
    const decoKeys = room.type === "start" ? ["grass1", "grass2", "grass3", "pebbles"] : ["skull", "bone", "pebbles", "crack", "rock", "grass1", "pebbles", "crack"];
    const n = room.type === "start" ? 14 : 18;
    for (let i = 0; i < n; i++) {
        const x = PLAY_LEFT + 30 + rnd() * (W - 60), y = PLAY_TOP + 30 + rnd() * (H - 60);
        if (obs.some(o => o.overlapsCircle(x, y, 20))) continue;
        const img = GFX.tiles[decoKeys[Math.floor(rnd() * decoKeys.length)]];
        if (!img) continue;
        g.globalAlpha = 0.55 + rnd() * 0.3;
        const s = 2;
        g.drawImage(img, Math.round(x - PLAY_LEFT - 8 * s), Math.round(y - PLAY_TOP - 8 * s), 16 * s, 16 * s);
    }
    g.globalAlpha = 1;
    room._floor = c; room._floorStage = stage;
    // 횃불 자리 (문 위치는 피해서 벽을 따라)
    const T = [];
    const doorClear = (x, y) => Math.abs(x - SCREEN_W / 2) < 70 && (y < PLAY_TOP + 20 || y > PLAY_BOTTOM - 20) ||
                                Math.abs(y - SCREEN_H / 2) < 70 && (x < PLAY_LEFT + 20 || x > PLAY_RIGHT - 20);
    if (room.type !== "start") {
        for (const [x, y] of [[PLAY_LEFT + 150, PLAY_TOP + 12], [PLAY_RIGHT - 150, PLAY_TOP + 12], [PLAY_LEFT + 150, PLAY_BOTTOM - 12],
                              [PLAY_RIGHT - 150, PLAY_BOTTOM - 12], [PLAY_LEFT + 12, PLAY_TOP + 120], [PLAY_RIGHT - 12, PLAY_BOTTOM - 120]]) {
            if (!doorClear(x, y)) T.push([x, y, rnd() * 1000]);
        }
    } else T.push([PLAY_LEFT + 200, PLAY_TOP + 12, 0], [PLAY_RIGHT - 200, PLAY_TOP + 12, 300]);
    room._torches = T;
    return c;
}
function drawTorch(ctx, x, y, now, seed) {
    // 받침
    R.rect(ctx, x - 4, y - 2, 8, 10, [70, 50, 40], 0, 2);
    R.rect(ctx, x - 6, y - 4, 12, 4, [110, 80, 60], 0, 1);
    const frames = GFX.fx.torch;
    if (frames) {
        const f = frames[Math.floor((now + seed) / 90) % frames.length];
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(f, x - 12, y - 26, 24, 24);
        ctx.restore();
    } else R.circle(ctx, x, y - 10, 5, [255, 170, 60]);
}

// ---------------- 장애물 (타일 그림으로) ----------------
const _patternCache = {};
function _tilePattern(ctx, key) {
    if (_patternCache[key]) return _patternCache[key];
    const img = GFX.tiles[key];
    if (!img) return null;
    const c = document.createElement("canvas"); c.width = 32; c.height = 32;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 32, 32);
    _patternCache[key] = ctx.createPattern(c, "repeat");
    return _patternCache[key];
}
function drawObstacleTextured(ctx, o) {
    if (o.kind === "circle") {
        const img = GFX.tiles[o.style === "rock" ? "rock" : "pillar"];
        if (!img) return false;
        drawBlobShadow(ctx, o.x + 3, o.y + o.r * 0.55, o.r * 1.05, o.r * 0.5, 0.38);
        const s = o.r * 2.3;
        drawPixel(ctx, img, o.x, o.y - o.r * 0.15, s, s);
        return true;
    }
    const pat = _tilePattern(ctx, o.style === "crate" ? "crate" : "brick");
    if (!pat) return false;
    const x0 = Math.trunc(o.x), y0 = Math.trunc(o.y), w = Math.trunc(o.w), h = Math.trunc(o.h);
    R.rect(ctx, x0 + 4, y0 + 6, w, h, "rgba(0,0,0,0.38)", 0, 4);
    ctx.save();
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 3); else ctx.rect(x0, y0, w, h);
    ctx.translate(x0, y0); ctx.fillStyle = pat; ctx.fill(); ctx.translate(-x0, -y0);
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(20,14,12,0.85)"; ctx.stroke();
    ctx.restore();
    R.line(ctx, x0 + 3, y0 + 2, x0 + w - 3, y0 + 2, "rgba(255,255,255,0.18)", 2);
    return true;
}

// ---------------- 조명 ----------------
const Light = { canvas: null, ctx: null, scale: 0.5 };
function _lightCtx() {
    const W = PLAY_RIGHT - PLAY_LEFT, H = PLAY_BOTTOM - PLAY_TOP;
    if (!Light.canvas) {
        Light.canvas = document.createElement("canvas");
        Light.canvas.width = Math.ceil(W * Light.scale); Light.canvas.height = Math.ceil(H * Light.scale);
        Light.ctx = Light.canvas.getContext("2d");
    }
    return Light.ctx;
}
// lights: [[x, y, 반지름, 세기(0~1)]]  -> 어둠에서 그만큼 구멍을 낸다
function drawDarkness(ctx, roomType, lights) {
    if (!Opts.high) return;
    const [col, dark] = ROOM_AMBIENT[roomType] || ROOM_AMBIENT.battle;
    const lc = _lightCtx(), s = Light.scale, img = GFX.kp.circle_05;
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, Light.canvas.width, Light.canvas.height);
    lc.fillStyle = rgb(col); lc.fillRect(0, 0, Light.canvas.width, Light.canvas.height);
    lc.globalCompositeOperation = "destination-out";
    for (const [x, y, r, k] of lights) {
        if (!img) break;
        lc.globalAlpha = clamp(k, 0, 1);
        const rr = r * s;
        lc.drawImage(img, (x - PLAY_LEFT) * s - rr, (y - PLAY_TOP) * s - rr, rr * 2, rr * 2);
    }
    lc.globalAlpha = 1;
    ctx.save();
    ctx.globalAlpha = dark;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(Light.canvas, PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
    ctx.restore();
}

// ---------------- 새 파티클 (그림 파티클) ----------------
// kind: "spark"(별빛) / "smoke"(연기) / "debris"(파편, 중력)
class FxParticle {
    constructor(o) {
        Object.assign(this, { vx: 0, vy: 0, grav: 0, drag: 0.92, size: 12, grow: 0, rot: 0, spin: 0, add: true, life: 400, alpha: 1 }, o);
        this.t0 = o.t0;
    }
    alive(now) { return now - this.t0 < this.life; }
    update() { this.x += this.vx; this.y += this.vy; this.vy += this.grav; this.vx *= this.drag; this.vy *= this.drag; this.rot += this.spin; this.size += this.grow; }
    draw(ctx, now) {
        const t = clamp((now - this.t0) / this.life, 0, 1), a = this.alpha * (1 - t) * (t < 0.1 ? t / 0.1 : 1);
        drawKp(ctx, this.img, this.x, this.y, Math.max(1, this.size), this.color, a, this.rot, this.add);
    }
}
const FX_MAX_PARTICLES = 260;
function fxCount(n) { return Opts.high ? n : Math.ceil(n / 3); }
function spawnHitSparks(list, x, y, color, now, n, crit) {
    if (list.length > FX_MAX_PARTICLES) return;
    n = fxCount(n);
    for (let i = 0; i < n; i++) {
        const a = uniform(0, Math.PI * 2), s = uniform(1.5, crit ? 6 : 4);
        list.push(new FxParticle({ img: "star_07", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, size: uniform(8, crit ? 22 : 14), life: uniform(180, 320), t0: now, spin: uniform(-0.2, 0.2) }));
    }
    list.push(new FxParticle({ img: crit ? "star_06" : "flare_01", x, y, color: crit ? [255, 230, 150] : color, size: crit ? 46 : 26, life: crit ? 200 : 120, t0: now, grow: 0.5 }));
}
function spawnSmokePuff(list, x, y, color, now, n, size) {
    if (list.length > FX_MAX_PARTICLES) return;
    n = fxCount(n);
    for (let i = 0; i < n; i++) {
        const a = uniform(0, Math.PI * 2), s = uniform(0.4, 1.6);
        list.push(new FxParticle({ img: Math.random() < 0.5 ? "smoke_04" : "smoke_07", x: x + uniform(-6, 6), y: y + uniform(-6, 6), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.4,
            color: color || [120, 115, 125], size: uniform(size * 0.6, size), grow: 0.35, life: uniform(400, 700), t0: now, add: false, alpha: 0.55, rot: uniform(0, 6), spin: uniform(-0.03, 0.03), drag: 0.95 }));
    }
}
function spawnDebris(list, x, y, color, now, n) {
    if (!Opts.high || list.length > FX_MAX_PARTICLES) return;
    for (let i = 0; i < n; i++) {
        const a = uniform(-Math.PI, 0), s = uniform(2, 5);
        list.push(new FxParticle({ img: "dirt_02", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 0.25, color, size: uniform(6, 12), life: uniform(350, 550), t0: now, add: false, drag: 0.96, spin: uniform(-0.3, 0.3) }));
    }
}
// 원소 이름 -> 대표 색
const ELEMENT_FX_COLOR = {
    fire: [255, 140, 50], ice: [140, 220, 255], lightning: [255, 240, 110], light: [255, 245, 190], nature: [120, 230, 110],
    dark: [190, 110, 255], earth: [210, 150, 90], wind: [150, 255, 220], spread: [255, 120, 170], none: [235, 235, 245],
};
// 효과 색으로 원소 짐작 (기억 효과 그림 고르기용)
function guessElement(c) {
    if (!c) return "none";
    const [r, g, b] = c;
    if (r > 200 && g < 180 && b < 120) return "fire";
    if (b > 200 && r < 200) return "ice";
    if (r > 200 && g > 200 && b < 215) return "light";
    if (b > 150 && g < 140) return "dark";
    return "none";
}
