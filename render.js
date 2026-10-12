// =============================================================
// 그리기 (Python 버전의 draw_* 함수들을 캔버스로 옮김)
// 모든 좌표는 게임 내부 좌표(900 x 650) 기준이다.
// =============================================================
"use strict";

const R = {};   // 그리기 도구 모음

R.font = (size, bold) => `${bold ? "bold " : ""}${size}px ${FONT_FAMILY}`;
R.circle = (ctx, x, y, r, color, width) => {
    if (r <= 0) return;
    ctx.beginPath();
    if (width) {
        ctx.arc(x, y, Math.max(0.5, r - width / 2), 0, Math.PI * 2);
        ctx.strokeStyle = typeof color === "string" ? color : rgb(color); ctx.lineWidth = width; ctx.stroke();
    } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = typeof color === "string" ? color : rgb(color); ctx.fill();
    }
};
R.line = (ctx, x1, y1, x2, y2, color, width) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = typeof color === "string" ? color : rgb(color); ctx.lineWidth = width || 1; ctx.lineCap = "round"; ctx.stroke();
};
R.lines = (ctx, pts, color, width, closed) => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (closed) ctx.closePath();
    ctx.strokeStyle = rgb(color); ctx.lineWidth = width || 1; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
};
R.poly = (ctx, pts, color, width) => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (width) { ctx.strokeStyle = rgb(color); ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.stroke(); }
    else { ctx.fillStyle = rgb(color); ctx.fill(); }
};
R.rect = (ctx, x, y, w, h, color, width, radius) => {
    ctx.beginPath();
    if (radius && ctx.roundRect) ctx.roundRect(x, y, w, h, radius); else ctx.rect(x, y, w, h);
    if (width) { ctx.strokeStyle = typeof color === "string" ? color : rgb(color); ctx.lineWidth = width; ctx.stroke(); }
    else { ctx.fillStyle = typeof color === "string" ? color : rgb(color); ctx.fill(); }
};
R.text = (ctx, text, x, y, size, color, opts) => {
    opts = opts || {};
    ctx.font = R.font(size, opts.bold);
    ctx.textBaseline = "top";
    ctx.textAlign = opts.align || "left";
    if (opts.shadow) { ctx.fillStyle = "rgba(0,0,0,1)"; ctx.fillText(text, x + 2, y + 2); }
    ctx.fillStyle = typeof color === "string" ? color : rgb(color);
    ctx.fillText(text, x, y);
};
R.textWidth = (ctx, text, size, bold) => { ctx.font = R.font(size, bold); return ctx.measureText(text).width; };
R.rotatePoints = (pts, cx, cy, dx, dy, s) => pts.map(([px, py]) => { px *= (s || 1); py *= (s || 1); return [cx + px * dx - py * dy, cy + px * dy + py * dx]; });

// ---------------- 스프라이트 ----------------
const Sprites = { player: {}, monsters: {}, ready: false };
function loadImage(src) {
    return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
async function loadSprites() {
    const P = { down: [1, 4], up: [1, 4], left: [1, 4], right: [1, 4] };
    try {
        for (const dir of Object.keys(P)) {
            const idle = [], move = [];
            for (let i = 0; i < P[dir][0]; i++) idle.push(await loadImage(`assets/player/${dir}/idle_${i}.png`));
            for (let i = 0; i < P[dir][1]; i++) move.push(await loadImage(`assets/player/${dir}/move_${i}.png`));
            const I = idle.filter(Boolean), M = move.filter(Boolean);
            if (!I.length && !M.length) { Sprites.player = {}; break; }
            Sprites.player[dir] = { idle: I.length ? I : M.slice(0, 1), move: M.length ? M : I };
        }
        const MON = { bamboo: [4, 4], squid: [5, 4], spirit: [4, 4], raccoon: [6, 5] };
        for (const skin of Object.keys(MON)) {
            const idle = [], move = [];
            for (let i = 0; i < MON[skin][0]; i++) idle.push(await loadImage(`assets/monsters/${skin}/idle/idle_${i}.png`));
            for (let i = 0; i < MON[skin][1]; i++) move.push(await loadImage(`assets/monsters/${skin}/move/move_${i}.png`));
            const I = idle.filter(Boolean), M = move.filter(Boolean);
            if (I.length || M.length) Sprites.monsters[skin] = { idle: I.length ? I : M, move: M.length ? M : I };
        }
    } catch (e) { /* 그림이 없으면 도형으로 그린다 */ }
    Sprites.ready = true;
}
function pickAnimFrame(frames, now, offset) {
    if (!frames || !frames.length) return null;
    return frames[Math.floor((now + offset) / ANIM_FRAME_MS) % frames.length];
}
function monsterSpriteKey(m) {
    if (m.isBoss) return MONSTER_SKIN_BOSS;
    if (m.type === "melee") return m.subtype === "dash" ? MONSTER_SKIN_MELEE_DASH : MONSTER_SKIN_MELEE;
    return MONSTER_SKIN_RANGED;
}
// 색 입히기 (그림 모양 안쪽에만) - 결과는 캐시
const _tintCache = new Map();
function tintedFrame(img, color, flash) {
    if (!color && !flash) return img;
    const key = img.src + "|" + (color ? color.join(",") : "-") + "|" + (flash ? 1 : 0);
    let c = _tintCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const overlay = document.createElement("canvas");
    overlay.width = img.width; overlay.height = img.height;
    const o = overlay.getContext("2d");
    o.fillStyle = flash ? "rgba(255,255,255,0.75)" : rgb(color, 0.35);
    o.fillRect(0, 0, c.width, c.height);
    o.globalCompositeOperation = "destination-in";
    o.drawImage(img, 0, 0);
    g.globalCompositeOperation = flash ? "source-over" : "lighter";
    g.drawImage(overlay, 0, 0);
    _tintCache.set(key, c);
    return c;
}
function blitSprite(ctx, frame, cx, cy, diameter, flash, tint) {
    const size = Math.max(8, Math.trunc(diameter));
    ctx.drawImage(tintedFrame(frame, tint, flash), cx - size / 2, cy - size / 2, size, size);
}

// ---------------- 장애물 ----------------
function drawObstacle(ctx, o) {
    if (o.kind === "circle") {
        if (o.style === "rock") {
            const base = [104, 92, 78];
            R.circle(ctx, o.x + 2, o.y + 3, o.r + 1, shadeColor(base, -45));
            R.circle(ctx, o.x, o.y, o.r, base);
            R.circle(ctx, o.x - o.r / 3, o.y - o.r / 3, Math.max(2, o.r / 3), shadeColor(base, 30));
        } else {
            R.circle(ctx, o.x, o.y, o.r + 2, shadeColor(OBSTACLE_COLOR, -40));
            R.circle(ctx, o.x, o.y, o.r, OBSTACLE_COLOR);
            R.circle(ctx, o.x - o.r * 0.3, o.y - o.r * 0.3, Math.max(2, o.r / 3), shadeColor(OBSTACLE_COLOR, 35));
        }
        return;
    }
    const x0 = Math.trunc(o.x), y0 = Math.trunc(o.y), w = Math.trunc(o.w), h = Math.trunc(o.h);
    R.rect(ctx, x0 + 3, y0 + 4, w, h, [18, 16, 22], 0, 4);
    if (o.style === "crate") {
        const wood = [128, 92, 56];
        R.rect(ctx, x0, y0, w, h, wood, 0, 4);
        R.rect(ctx, x0 + 1.5, y0 + 1.5, w - 3, h - 3, shadeColor(wood, -45), 3, 4);
        R.line(ctx, x0 + 4, y0 + 4, x0 + w - 5, y0 + h - 5, shadeColor(wood, -35), 3);
        R.line(ctx, x0 + w - 5, y0 + 4, x0 + 4, y0 + h - 5, shadeColor(wood, -35), 3);
        R.line(ctx, x0 + 4, y0 + 3, x0 + w - 5, y0 + 3, shadeColor(wood, 25), 1);
    } else {
        const stone = [98, 96, 108], mortar = shadeColor(stone, -30);
        R.rect(ctx, x0, y0, w, h, stone, 0, 3);
        if (w >= h) {
            for (let bx = x0 + 22; bx < x0 + w - 4; bx += 22) R.line(ctx, bx, y0 + 2, bx, y0 + h - 3, mortar, 2);
            R.line(ctx, x0 + 3, y0 + 2, x0 + w - 4, y0 + 2, shadeColor(stone, 30), 1);
        } else {
            for (let by = y0 + 22; by < y0 + h - 4; by += 22) R.line(ctx, x0 + 2, by, x0 + w - 3, by, mortar, 2);
            R.line(ctx, x0 + 2, y0 + 3, x0 + 2, y0 + h - 4, shadeColor(stone, 30), 1);
        }
        R.rect(ctx, x0 + 1, y0 + 1, w - 2, h - 2, shadeColor(stone, -50), 2, 3);
    }
}

// ---------------- 장판 / 레이저 / 격분 ----------------
function drawHazard(ctx, h, now) {
    if (!h.isActive(now)) {
        const pulse = Math.trunc(5 * Math.abs(Math.sin(now / 90)));
        R.circle(ctx, h.x, h.y, h.radius + pulse, [255, 120, 90], 3);
        R.circle(ctx, h.x, h.y, Math.max(3, h.radius / 5), shadeColor(h.color, -30), 2);
        return;
    }
    const remain = Math.max(0, h.expireAt - now);
    const alpha = remain > 700 ? 150 : Math.max(30, Math.trunc(150 * remain / 700));
    R.circle(ctx, h.x, h.y, h.radius, rgb(h.color, alpha / 255));
    R.circle(ctx, h.x, h.y, h.radius, h.color, 2);
    for (let i = 0; i < 5; i++) {
        const a = radians((now / 7 + i * 72) % 360);
        R.circle(ctx, h.x + Math.cos(a) * h.radius * 0.55, h.y + Math.sin(a) * h.radius * 0.55, 3, shadeColor(h.color, 50));
    }
}
function drawRotatingLaser(ctx, L, now) {
    if (L.state === "warning" || L.state === "active") {
        for (const a of L.beamAngles()) {
            const len = rayExitLength(L.cx, L.cy, a, L.length);
            const ex = L.cx + Math.cos(a) * len, ey = L.cy + Math.sin(a) * len;
            if (L.state === "active") {
                R.line(ctx, L.cx, L.cy, ex, ey, [120, 25, 25], L.width + 8);
                R.line(ctx, L.cx, L.cy, ex, ey, LASER_COLOR, L.width);
                R.line(ctx, L.cx, L.cy, ex, ey, [255, 240, 240], Math.max(2, L.width / 3));
            } else if (Math.floor(now / 110) % 2 === 0) R.line(ctx, L.cx, L.cy, ex, ey, [255, 150, 120], 3);
            else R.line(ctx, L.cx, L.cy, ex, ey, [150, 70, 60], 2);
        }
    }
    const coreR = L.state === "active" ? 12 : 9;
    R.circle(ctx, L.cx, L.cy, coreR + 3, [60, 20, 20]);
    R.circle(ctx, L.cx, L.cy, coreR, L.state === "active" ? LASER_COLOR : [170, 90, 80]);
    R.circle(ctx, L.cx, L.cy, Math.max(2, coreR / 3), [255, 230, 230]);
}
function drawRageAura(ctx, m, now) {
    const st = m.rageStacks;
    if (!st) return;
    const pulse = Math.trunc(4 * Math.abs(Math.sin(now / 110)));
    R.circle(ctx, m.x, m.y, m.radius + 5 + pulse, RAGE_COLOR, 1 + st);
    const spikes = 3 + st * 2, len = 5 + st * 3;
    for (let i = 0; i < spikes; i++) {
        const a = radians(i * (360 / spikes) + (now / 14) % 360);
        R.line(ctx, m.x + Math.cos(a) * (m.radius + 5), m.y + Math.sin(a) * (m.radius + 5),
               m.x + Math.cos(a) * (m.radius + 5 + len), m.y + Math.sin(a) * (m.radius + 5 + len), RAGE_COLOR, 2);
    }
}

// ---------------- 몬스터 / 보스 / 플레이어 ----------------
function drawMonsterShape(ctx, m, now) {
    const cx = m.x, cy = m.y, r = m.radius;
    if (m.isElite) R.circle(ctx, cx, cy, r + 7, [255, 215, 60], 3);
    drawRageAura(ctx, m, now);
    const skin = Sprites.monsters[monsterSpriteKey(m)];
    if (skin) {
        const frame = pickAnimFrame(skin.move || skin.idle, now, m.animOffset);
        if (frame) { blitSprite(ctx, frame, cx, cy, r * 2 + 14, now < m.hitFlashUntil, m.color); return; }
    }
    const sub = m.subtype;
    if (sub === "dash") {
        for (let i = 0; i < 8; i++) {
            const a = radians(i * 45 + (now / 10) % 45);
            R.line(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6), shadeColor(m.color, -20), 3);
        }
    } else if (sub === "spread") {
        for (const s of [-1, 1]) R.poly(ctx, [[cx + s * (r + 10), cy], [cx + s * r * 0.3, cy - r * 0.6], [cx + s * r * 0.3, cy + r * 0.6]], shadeColor(m.color, 10));
    } else if (sub === "double") R.circle(ctx, cx, cy, r + 5, shadeColor(m.color, -10), 2);
    else if (sub === "exploder") R.circle(ctx, cx, cy, r + 3 + 3 + Math.trunc(3 * Math.abs(Math.sin(now / 150))), shadeColor(m.color, 30), 2);
    else if (sub === "brute") R.circle(ctx, cx, cy, r + 4, shadeColor(m.color, -40), 4);
    else if (sub === "splitter") R.line(ctx, cx, cy - r + 2, cx, cy + r - 2, shadeColor(m.color, -50), 3);
    else if (m.type === "summoner") {
        for (let i = 0; i < 2; i++) { const a = radians(now / 5 + i * 180); R.circle(ctx, cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10), 3, shadeColor(m.color, 50)); }
    }
    const body = now < m.hitFlashUntil ? [255, 255, 255] : m.color;
    R.circle(ctx, cx, cy, r + 1, shadeColor(body, -60));
    R.circle(ctx, cx, cy, r, body);
    R.circle(ctx, cx - r / 3, cy - r / 3, Math.max(2, r / 3), shadeColor(body, 70));
}
function drawBossShape(ctx, m, now) {
    const cx = m.x, cy = m.y, r = m.radius;
    drawRageAura(ctx, m, now);
    const skin = Sprites.monsters[MONSTER_SKIN_BOSS];
    if (skin) {
        const frame = pickAnimFrame(skin.move || skin.idle, now, m.animOffset);
        if (frame) { blitSprite(ctx, frame, cx, cy, r * 2 + 10, now < m.hitFlashUntil, m.enraged ? m.color : null); return; }
    }
    for (let i = 0; i < 10; i++) {
        const a = radians(i * 36 + (now / 20) % 36);
        R.line(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14), shadeColor(m.color, -30), 5);
    }
    const body = now < m.hitFlashUntil ? [255, 255, 255] : m.color;
    R.circle(ctx, cx, cy, r + 2, shadeColor(body, -60));
    R.circle(ctx, cx, cy, r, body);
    R.circle(ctx, cx - r / 3, cy - r / 3, r / 3, shadeColor(body, 70));
    for (const s of [-1, 1]) R.circle(ctx, cx + s * r / 2, cy - r / 4, Math.max(3, r / 6), [20, 10, 10]);
}
function facingDirectionName(fx, fy) {
    if (Math.abs(fy) >= Math.abs(fx)) return fy >= 0 ? "down" : "up";
    return fx >= 0 ? "right" : "left";
}
function drawPlayerShape(ctx, p, now) {
    const d = Sprites.player[facingDirectionName(p.facingX, p.facingY)];
    if (d) {
        const frames = (p.isMoving ? d.move : d.idle) || d.idle || d.move;
        const f = pickAnimFrame(frames, now, p.animOffset);
        if (f) { blitSprite(ctx, f, p.x, p.y, p.radius * 2 + 18, false, null); return; }
    }
    const r = p.radius;
    R.circle(ctx, p.x, p.y, r + 5, shadeColor(p.color, -40));
    R.circle(ctx, p.x, p.y, r, p.color);
    R.circle(ctx, p.x - r / 3, p.y - r / 3, Math.max(2, r / 3), shadeColor(p.color, 80));
    const fx = p.facingX, fy = p.facingY, px = -fy, py = fx;
    R.poly(ctx, [[p.x + fx * (r + 8), p.y + fy * (r + 8)],
                 [p.x + fx * r * 0.4 + px * r * 0.5, p.y + fy * r * 0.4 + py * r * 0.5],
                 [p.x + fx * r * 0.4 - px * r * 0.5, p.y + fy * r * 0.4 - py * r * 0.5]], shadeColor(p.color, 60));
}

// ---------------- 총 그림 / 총알 ----------------
function gunBorderColor(gun, now) {
    if (gun.grade === "mythic") {
        const h = (now / 8) % 360;
        // HSV(h, 80%, 100%) -> RGB
        const s = 0.8, v = 1, c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), mm = v - c;
        const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        return [Math.round((r1 + mm) * 255), Math.round((g1 + mm) * 255), Math.round((b1 + mm) * 255)];
    }
    return gun.borderColor;
}
function drawGunShape(ctx, cx, cy, gun, now, scale) {
    scale = scale || 1;
    const P = pts => pts.map(([x, y]) => [cx + x * scale, cy + y * scale]);
    const slide = P([[-21, -13], [16, -13], [16, -11], [29, -11], [29, -3], [-21, -3]]);
    const grip = P([[-19, -4], [-6, -4], [-10, 14], [-23, 14]]);
    const hammer = P([[-25, -13], [-21, -13], [-21, -8], [-25, -8]]);
    const sight = P([[23, -15], [26, -15], [26, -11], [23, -11]]);
    const guard = P([[-6, -3], [-6, 4], [3, 4], [3, -3]]);
    const border = gunBorderColor(gun, now);
    const bw = Math.max(2, Math.round(gun.borderWidth * scale * 1.6));
    if (gun.grade === "legendary" || gun.grade === "mythic") {
        R.circle(ctx, cx, cy, (30 + 3 * Math.sin(now / 160)) * scale, rgb(border, 60 / 255));
    }
    for (const poly of [grip, slide, hammer, sight]) R.poly(ctx, poly, border, bw);
    R.lines(ctx, guard, border, bw);
    R.poly(ctx, hammer, shadeColor(gun.color, -70));
    R.poly(ctx, grip, shadeColor(gun.color, -60));
    R.poly(ctx, slide, gun.color);
    R.poly(ctx, sight, shadeColor(gun.color, -40));
    R.lines(ctx, guard, shadeColor(gun.color, -80), Math.max(1, Math.round(2 * scale)));
    R.line(ctx, cx - 17 * scale, cy - 10 * scale, cx + 13 * scale, cy - 10 * scale, shadeColor(gun.color, 70), Math.max(1, Math.round(2 * scale)));
    if (gun.gradeIndex >= 2) R.circle(ctx, cx - 14 * scale, cy + 4 * scale, Math.max(2, Math.round(3 * scale)), border);
    if (gun.grade === "mythic") {
        for (let k = 0; k < 3; k++) {
            const a = now / 300 + k * Math.PI * 2 / 3;
            R.circle(ctx, cx + Math.cos(a) * 32 * scale, cy + Math.sin(a) * 20 * scale, Math.max(1, Math.round(2 * scale)), [255, 255, 255]);
        }
    }
}
function drawElementBullet(ctx, b, now) {
    const el = b.gun.element, color = b.gun.color, cx = b.x, cy = b.y, dx = b.dirX, dy = b.dirY, r = b.radius;
    const rot = pts => R.rotatePoints(pts, cx, cy, dx, dy);
    if (el === "fire") {
        R.poly(ctx, rot([[0, -r], [-r * 3.2, 0], [0, r]]), [220, 60, 20]);
        R.circle(ctx, cx, cy, r + 2, color);
        R.circle(ctx, cx, cy, Math.max(2, r - 2), [255, 230, 120]);
    } else if (el === "ice") {
        const p = rot([[r * 2.2, 0], [0, -r * 0.9], [-r * 1.4, 0], [0, r * 0.9]]);
        R.poly(ctx, p, color); R.poly(ctx, p, [240, 255, 255], 2);
    } else if (el === "lightning") {
        const p = rot([[r * 2, 0], [r * 0.6, -r * 0.9], [-r * 0.4, r * 0.9], [-r * 2, 0]]);
        R.lines(ctx, p, [200, 170, 20], 5); R.lines(ctx, p, [255, 255, 200], 2);
    } else if (el === "light") {
        const a = now / 120, star = [];
        for (let k = 0; k < 8; k++) { const rr = k % 2 === 0 ? r + 5 : Math.max(2, r - 2), an = k * Math.PI / 4; star.push([Math.cos(an) * rr, Math.sin(an) * rr]); }
        R.circle(ctx, cx, cy, r + 3, [255, 240, 170], 1);
        R.poly(ctx, R.rotatePoints(star, cx, cy, Math.cos(a), Math.sin(a)), color);
    } else if (el === "nature") {
        R.poly(ctx, rot([[r * 2, 0], [r * 0.8, -r * 0.9], [-r * 0.6, -r * 0.8], [-r * 1.6, 0], [-r * 0.6, r * 0.8], [r * 0.8, r * 0.9]]), color);
        const v = rot([[r * 1.8, 0], [-r * 1.6, 0]]);
        R.line(ctx, v[0][0], v[0][1], v[1][0], v[1][1], [30, 110, 40], 2);
    } else if (el === "earth") {
        const p = rot([[r * 1.3, 0], [r * 0.5, -r * 1.1], [-r * 0.8, -r * 0.9], [-r * 1.3, r * 0.1], [-r * 0.4, r * 1.1], [r * 0.8, r * 0.8]]);
        R.poly(ctx, p, color); R.poly(ctx, p, shadeColor(color, -60), 2);
    } else if (el === "wind") {
        for (const [off, w] of [[0, 3], [-r * 0.9, 2]]) {
            const arc = [];
            for (let i = 0; i < 9; i++) { const t = -1.3 + i * 0.325; arc.push([off + r * 0.9 * Math.cos(t), r * 1.5 * Math.sin(t)]); }
            R.lines(ctx, rot(arc), off === 0 ? color : [220, 255, 245], w);
        }
    } else if (el === "spread") {
        R.circle(ctx, cx, cy, r, color);
        R.circle(ctx, cx, cy, Math.max(1, r - 3), [255, 235, 245]);
    } else if (el === "dark") {
        R.circle(ctx, cx, cy, r + 3, color);
        R.circle(ctx, cx, cy, r, [20, 5, 35]);
        R.circle(ctx, cx, cy, r + 3, [210, 150, 255], 1);
    }
}
function drawGlowBullet(ctx, b, now) {
    if (b.owner === "player" && b.gun) { drawElementBullet(ctx, b, now); return; }
    let core, glow;
    if (b.owner === "player") { core = [255, 240, 150]; glow = [255, 210, 80]; }
    else if (b.homing) { core = [180, 240, 245]; glow = [70, 190, 215]; }
    else { core = [255, 160, 150]; glow = [230, 60, 60]; }
    R.circle(ctx, b.x, b.y, b.radius + 3, glow);
    R.circle(ctx, b.x, b.y, b.radius, core);
}
function drawGunPickup(ctx, gun, x, y, now, near) {
    const bob = Math.sin(now / 250 + x) * 3;
    ctx.beginPath(); ctx.ellipse(x, y + 21, 30, 7, 0, 0, Math.PI * 2); ctx.fillStyle = rgb([15, 15, 22]); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = rgb(gun.borderColor); ctx.stroke();
    drawGunShape(ctx, x, y + bob - 2, gun, now, 1.25);
    R.text(ctx, gun.name, x, y - 46, 14, gunBorderColor(gun, now), { align: "center" });
    if (near) {
        const desc = gun.description();
        const w = R.textWidth(ctx, desc, 14) + 16;
        const bx = clamp(x - w / 2, PLAY_LEFT + 4, PLAY_RIGHT - w - 4);
        R.rect(ctx, bx, y + 34, w, 24, [12, 12, 20], 0, 6);
        R.rect(ctx, bx, y + 34, w, 24, gun.borderColor, 1, 6);
        R.text(ctx, desc, bx + 8, y + 38, 14, [235, 235, 240]);
    }
}
function drawPortal(ctx, x, y, now, active) {
    for (let k = 0; k < 4; k++) {
        const rr = PORTAL_RADIUS - k * 7;
        const a = now / (220 - k * 30) * (k % 2 === 0 ? 1 : -1);
        const col = active ? [120 + k * 30, 80 + k * 20, 255] : [90, 90, 110];
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.6, 0, -a - 4.2, -a);
        ctx.strokeStyle = rgb(col); ctx.lineWidth = 3; ctx.stroke();
    }
    R.text(ctx, "다음 스테이지 ▶", x, y + PORTAL_RADIUS * 0.6 + 4, 14, [200, 190, 255], { align: "center" });
}
function drawMonsterStatus(ctx, m, now) {
    const cx = m.x, cy = m.y, r = m.radius;
    if (now < m.burnUntil) {
        for (let k = 0; k < 3; k++) {
            const a = now / 140 + k * Math.PI * 2 / 3, fx = cx + Math.cos(a) * (r + 3), fy = cy + Math.sin(a) * (r + 3);
            const f = 3 + Math.trunc(2 * Math.abs(Math.sin(now / 70 + k)));
            R.poly(ctx, [[fx, fy - f * 2], [fx - f, fy + f], [fx + f, fy + f]], [255, 120, 30]);
        }
    }
    if (monsterIsSlowed(m, now)) {
        R.circle(ctx, cx, cy, r + 5, GUN_ELEMENTS.ice[1], 2);
        for (let k = 0; k < 4; k++) {
            const a = k * Math.PI / 2 + Math.PI / 4;
            R.line(ctx, cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2), cx + Math.cos(a) * (r + 9), cy + Math.sin(a) * (r + 9), [230, 250, 255], 2);
        }
    }
    if (monsterIsStunned(m, now)) {
        for (let k = 0; k < 3; k++) {
            const a = now / 160 + k * Math.PI * 2 / 3, sx = cx + Math.cos(a) * (r * 0.7 + 4), sy = cy - r - 10 + Math.sin(a) * 4;
            R.poly(ctx, [[sx, sy - 5], [sx + 2, sy - 1], [sx + 5, sy], [sx + 2, sy + 1], [sx, sy + 5], [sx - 2, sy + 1], [sx - 5, sy], [sx - 2, sy - 1]], [255, 225, 90]);
        }
    }
    if (m.lightStacks > 0) {
        const sx = cx + r + 6, sy = cy - r - 4;
        const star = [[sx, sy - 6], [sx + 2, sy - 2], [sx + 6, sy], [sx + 2, sy + 2], [sx, sy + 6], [sx - 2, sy + 2], [sx - 6, sy], [sx - 2, sy - 2]];
        R.poly(ctx, star, GUN_ELEMENTS.light[1]); R.poly(ctx, star, [230, 190, 60], 1);
        const maxed = m.lightStacks >= LIGHT_MAX_STACKS;
        R.text(ctx, maxed ? "MAX" : String(m.lightStacks), sx + 7, sy - 8, 14, maxed ? [255, 200, 60] : [255, 240, 160]);
    }
}
function drawZap(ctx, x1, y1, x2, y2) {
    const pts = [[x1, y1]];
    for (let k = 1; k < 6; k++) { const t = k / 6; pts.push([x1 + (x2 - x1) * t + uniform(-7, 7), y1 + (y2 - y1) * t + uniform(-7, 7)]); }
    pts.push([x2, y2]);
    R.lines(ctx, pts, [200, 170, 20], 4); R.lines(ctx, pts, [255, 255, 210], 2);
}

// ---------------- 게임 화면 ----------------
function drawGame(ctx, g, now) {
    const room = g.room, p = g.player;
    ctx.fillStyle = rgb([16, 16, 24]); ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const bg = ROOM_BG_COLOR[room.type] || [38, 38, 52];
    R.rect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP, bg);
    const grid = shadeColor(bg, 10);
    for (let gx = PLAY_LEFT + (40 - PLAY_LEFT % 40); gx < PLAY_RIGHT; gx += 40) R.line(ctx, gx + 0.5, PLAY_TOP, gx + 0.5, PLAY_BOTTOM, grid, 1);
    for (let gy = PLAY_TOP + (40 - PLAY_TOP % 40); gy < PLAY_BOTTOM; gy += 40) R.line(ctx, PLAY_LEFT, gy + 0.5, PLAY_RIGHT, gy + 0.5, grid, 1);
    R.rect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP, [20, 20, 30], 6, 10);
    R.rect(ctx, PLAY_LEFT + 1, PLAY_TOP + 1, PLAY_RIGHT - PLAY_LEFT - 2, PLAY_BOTTOM - PLAY_TOP - 2, [120, 120, 150], 2, 10);
    const door = (x, y, w, h) => { R.rect(ctx, x, y, w, h, [60, 140, 90], 0, 6); R.rect(ctx, x + 3, y + 3, w - 6, h - 6, [140, 230, 160], 0, 4); };
    if (room.connections.N) door(SCREEN_W / 2 - 26, PLAY_TOP - 10, 52, 14);
    if (room.connections.S) door(SCREEN_W / 2 - 26, PLAY_BOTTOM - 4, 52, 14);
    if (room.connections.W) door(PLAY_LEFT - 10, SCREEN_H / 2 - 26, 14, 52);
    if (room.connections.E) door(PLAY_RIGHT - 4, SCREEN_H / 2 - 26, 14, 52);

    for (const h of g.hazards) drawHazard(ctx, h, now);
    for (const o of g.obstacles) drawObstacle(ctx, o);
    const ready = now >= room.rewardActiveAt;
    if (room.portal) drawPortal(ctx, room.portal[0], room.portal[1], now, ready);
    for (const [gun, gx, gy] of (room.gunChoices || [])) drawGunPickup(ctx, gun, gx, gy, now, hypot(p.x - gx, p.y - gy) < 110);
    for (const L of g.lasers) if (L.state !== "active") drawRotatingLaser(ctx, L, now);

    for (const m of g.monsters) {
        if (m.dashState === "telegraph") {
            R.circle(ctx, m.x, m.y, m.radius + 8 + 6 + Math.trunc(6 * Math.abs(Math.sin(now / 80))), [255, 70, 40], 3);
            R.line(ctx, m.x, m.y, p.x, p.y, [255, 120, 60], 2);
        }
        if (m.isBoss) drawBossShape(ctx, m, now); else drawMonsterShape(ctx, m, now);
        drawMonsterStatus(ctx, m, now);
        const bw = m.radius * 2, ratio = Math.max(0, m.hp / m.maxHp), bx = m.x - bw / 2, by = m.y - m.radius - 12;
        R.rect(ctx, bx - 1, by - 1, bw + 2, 7, [40, 0, 0], 0, 2);
        R.rect(ctx, bx, by, bw, 5, [70, 0, 0]);
        R.rect(ctx, bx, by, bw * ratio, 5, [90, 220, 90]);
    }
    for (const L of g.lasers) if (L.state === "active") drawRotatingLaser(ctx, L, now);
    for (const b of g.bullets) drawGlowBullet(ctx, b, now);
    for (const z of g.zaps) drawZap(ctx, z[0], z[1], z[2], z[3]);
    for (const pt of g.particles) R.circle(ctx, pt.x, pt.y, Math.max(1, pt.size), pt.color);
    drawPlayerShape(ctx, p, now);
    if (now < p.darkShieldUntil) R.circle(ctx, p.x, p.y, p.radius + 9 + 2 * Math.sin(now / 60), GUN_ELEMENTS.dark[1], 3);

    // ---- HUD ----
    R.rect(ctx, 0, 0, SCREEN_W, PLAY_TOP - 6, [26, 26, 38]);
    R.line(ctx, 0, PLAY_TOP - 6, SCREEN_W, PLAY_TOP - 6, [70, 70, 95], 2);
    R.rect(ctx, 12, 14, 64, 54, [16, 16, 24], 0, 8);
    if (p.gun) { R.rect(ctx, 13, 15, 62, 52, gunBorderColor(p.gun, now), 2, 8); drawGunShape(ctx, 43, 42, p.gun, now, 1.0); }
    else R.rect(ctx, 12.5, 14.5, 63, 53, [55, 55, 72], 1, 8);
    const hx = 90;
    R.text(ctx, `HP ${Math.max(0, p.hp).toFixed(1)}/${p.maxHp.toFixed(1)}`, hx, 14, 20, [255, 255, 255], { shadow: true });
    R.rect(ctx, hx, 44, 164, 18, [50, 0, 0], 0, 4);
    R.rect(ctx, hx + 2, 46, Math.max(0, 160 * Math.max(0, p.hp / p.maxHp)), 14, [220, 60, 60], 0, 3);
    R.text(ctx, `ATK ${playerShotDamage(p).toFixed(1)}`, hx + 190, 14, 20, [255, 255, 255], { shadow: true });
    R.text(ctx, `STAGE ${g.stage}`, hx + 310, 14, 20, [255, 230, 140], { shadow: true });
    R.text(ctx, `SCORE ${g.score}`, hx + 420, 14, 20, [170, 220, 255], { shadow: true });
    R.text(ctx, `ASPD ${p.shotsPerSec.toFixed(1)}/s   SPD ${p.speed.toFixed(1)}`, hx, 68, 14, [200, 200, 215]);
    R.text(ctx, ROOM_TYPE_LABEL[room.type] || room.type, SCREEN_W - 20, 18, 14, [230, 230, 235], { align: "right" });
    const sec = Math.max(0, Math.floor(g.elapsedMs / 1000));
    R.text(ctx, `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`, SCREEN_W - 20, 2, 14, [150, 150, 165], { align: "right" });
    R.text(ctx, g.input.lastType === "touch" ? "이동: 화면을 누르고 끌기 (조이패드)   (공격은 자동)" : "이동: WASD / 방향키 / 마우스 끌기   (공격은 자동)", 20, SCREEN_H - 24, 14, [170, 170, 185]);
    drawMinimap(ctx, g.rooms, g.currentCoord, now);
    for (const pp of g.popups) R.text(ctx, pp.text, pp.x - 10, pp.y + pp.offset(now) - 10, 14, pp.color, { shadow: true });
    if (g.gameOver) drawCenterBanner(ctx, "GAME OVER", [255, 70, 70]);
    if (g.stageMessage) drawCenterBanner(ctx, g.stageMessage, [255, 220, 70]);
}
function drawCenterBanner(ctx, text, color) {
    const w = R.textWidth(ctx, text, 44, true), h = 50;
    R.rect(ctx, SCREEN_W / 2 - w / 2 - 24, SCREEN_H / 2 - h / 2 - 14, w + 48, h + 28, [10, 10, 16], 0, 12);
    R.rect(ctx, SCREEN_W / 2 - w / 2 - 24, SCREEN_H / 2 - h / 2 - 14, w + 48, h + 28, shadeColor(color, -60), 2, 12);
    R.text(ctx, text, SCREEN_W / 2, SCREEN_H / 2 - h / 2, 44, color, { bold: true, shadow: true, align: "center" });
}
function drawMinimap(ctx, rooms, cur, now) {
    const cell = 14, gap = 4;
    const xs = [...rooms.values()].map(r => r.x), ys = [...rooms.values()].map(r => r.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const mw = (maxX - minX + 1) * (cell + gap), mh = (maxY - minY + 1) * (cell + gap);
    const ox = SCREEN_W - 20 - mw, oy = SCREEN_H - 30 - mh;
    R.rect(ctx, ox - 8, oy - 8, mw + 16, mh + 16, [18, 18, 26], 0, 6);
    R.rect(ctx, ox - 7.5, oy - 7.5, mw + 15, mh + 15, [80, 80, 100], 1, 6);
    const pulse = 2 + Math.trunc(2 * Math.abs(Math.sin(now / 150)));
    for (const r of rooms.values()) {
        const px = ox + (r.x - minX) * (cell + gap), py = oy + (r.y - minY) * (cell + gap);
        const isCur = r.x === cur[0] && r.y === cur[1];
        R.rect(ctx, px, py, cell, cell, isCur ? [255, 230, 60] : r.visited ? [120, 200, 120] : [65, 65, 78], 0, 2);
        if (r.type === "boss") R.rect(ctx, px + 1, py + 1, cell - 2, cell - 2, [230, 60, 60], 2, 2);
        if (isCur) R.rect(ctx, px - pulse, py - pulse, cell + pulse * 2, cell + pulse * 2, [255, 255, 255], 1, 3);
    }
}

// ---------------- 퀴즈 화면 ----------------
// 터치/클릭 영역 (게임 좌표)
const QUIZ_BOX_W = 110, QUIZ_BOX_H = 90;
const QUIZ_O_RECT = [SCREEN_W / 2 - QUIZ_BOX_W - 30, 300, QUIZ_BOX_W, QUIZ_BOX_H];
const QUIZ_X_RECT = [SCREEN_W / 2 + 30, 300, QUIZ_BOX_W, QUIZ_BOX_H];
const QUIZ_SUBMIT_RECT = [SCREEN_W / 2 - 90, 410, 180, 52];
function wrapTextLines(ctx, text, maxW, size) {
    if (!text) return [];
    ctx.font = R.font(size);
    const lines = [];
    let cur = "";
    for (const ch of text) {
        if (ch === "\n") { lines.push(cur); cur = ""; continue; }
        const trial = cur + ch;
        if (cur && ctx.measureText(trial).width > maxW) { lines.push(cur); cur = ch; } else cur = trial;
    }
    if (cur) lines.push(cur);
    return lines;
}
const _quizImages = new Map();
function quizImage(src) {
    if (!src) return null;
    let e = _quizImages.get(src);
    if (!e) {
        e = { img: new Image(), ok: false, failed: false };
        e.img.onload = () => { e.ok = true; };
        e.img.onerror = () => { e.failed = true; };
        e.img.src = src;
        _quizImages.set(src, e);
    }
    return e;
}
// 이미지를 그리고 그린 영역 [x, y, w, h]를 돌려준다 (아직 못 불러왔으면 null)
function drawQuizImage(ctx, src, x, y, maxW, maxH) {
    const e = quizImage(src);
    if (!e || e.failed) { R.text(ctx, "[이미지를 불러올 수 없습니다]", x, y, 14, [230, 120, 120]); return null; }
    if (!e.ok) { R.text(ctx, "이미지 불러오는 중...", x, y, 14, [170, 170, 190]); return null; }
    const s = Math.min(maxW / e.img.width, maxH / e.img.height, 1);
    const w = Math.round(e.img.width * s), h = Math.round(e.img.height * s);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(e.img, x, y, w, h);
    return [x, y, w, h];
}
// "크게 보기" 돋보기 버튼
const QUIZ_ZOOM_BTN = 40, QUIZ_PANEL_RIGHT = SCREEN_W - 70;
function drawZoomButton(ctx, x, y, size) {
    R.rect(ctx, x, y, size, size, [40, 40, 60], 0, 9);
    R.rect(ctx, x + 1, y + 1, size - 2, size - 2, [170, 170, 210], 2, 9);
    const cx = x + size * 0.43, cy = y + size * 0.43, r = size * 0.22;
    R.circle(ctx, cx, cy, r, [235, 235, 245], 3);
    R.line(ctx, cx + r * 0.7, cy + r * 0.7, x + size * 0.78, y + size * 0.78, [235, 235, 245], 4);
}
function drawQuizScreen(ctx, q, now, touchMode) {
    ctx.fillStyle = rgb([16, 16, 24]); ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    R.rect(ctx, 70, 60, SCREEN_W - 140, SCREEN_H - 120, [28, 28, 40], 0, 14);
    R.rect(ctx, 71, 61, SCREEN_W - 142, SCREEN_H - 122, [90, 90, 120], 2, 14);
    const cw = SCREEN_W - 200, cx = 100;
    const cont = touchMode ? "화면을 누르면" : "Enter";

    if (q.phase === "summary") {
        R.text(ctx, "문제 풀이 완료!", SCREEN_W / 2, 110, 44, [255, 220, 90], { bold: true, align: "center" });
        const c = q.correct;
        const lines = [`${QUESTIONS_PER_ROOM}문제 중 ${c}문제 정답!`, "",
            `체력 +${(c * PLAYER_HP_GROWTH_PER_CORRECT).toFixed(1)}   공격력 +${(c * PLAYER_ATK_GROWTH_PER_CORRECT).toFixed(1)}`,
            `공격속도 +${(c * PLAYER_ATTACK_SPEED_GROWTH_PER_CORRECT).toFixed(2)}/초   이동속도 +${(c * PLAYER_MOVE_SPEED_GROWTH_PER_CORRECT).toFixed(2)}`];
        let y = 230;
        for (const l of lines) { if (l) R.text(ctx, l, SCREEN_W / 2, y, 20, [230, 230, 235], { align: "center" }); y += 42; }
        if (c >= QUESTIONS_PER_ROOM) {
            R.text(ctx, q.perfectHeal > 0 ? `만점 보너스! 잃은 체력의 ${Math.round(PERFECT_QUIZ_HEAL_RATIO * 100)}% 회복  (+${q.perfectHeal.toFixed(1)})`
                                          : "만점 보너스! (체력이 이미 가득 차 있음)", SCREEN_W / 2, y + 6, 20, [255, 215, 90], { align: "center" });
        } else {
            R.text(ctx, `오답 패널티: ${QUESTIONS_PER_ROOM - c}문제 x 현재 체력의 ${Math.round(WRONG_ANSWER_DAMAGE_RATIO * 100)}%  (-${q.penalty.toFixed(1)})`,
                   SCREEN_W / 2, y + 6, 20, [255, 110, 110], { align: "center" });
        }
        R.text(ctx, `${cont}  게임으로 돌아가기`, SCREEN_W / 2, SCREEN_H - 110, 14, [170, 220, 170], { align: "center" });
        return;
    }
    const prob = q.questions[q.index];
    const targets = q.zoomTargets = [];        // [{rect, src}] 누르면 크게 보기
    const kind = q.flags[q.index] ? "   ·   오늘 복습" : "   ·   랜덤 연습 (복습 일정에 반영 안 됨)";
    R.text(ctx, `문제 ${q.index + 1} / ${QUESTIONS_PER_ROOM}${kind}`, SCREEN_W / 2, 82, 14, [180, 180, 195], { align: "center" });

    // 이미지 + 옆에 돋보기 버튼. 그린 높이를 돌려준다.
    const image = (src, x, y, maxW, maxH) => {
        const r = drawQuizImage(ctx, src, x, y, maxW - QUIZ_ZOOM_BTN - 10, maxH);
        if (!r) return 20;
        const b = QUIZ_ZOOM_BTN;
        const beside = r[0] + r[2] + 8 + b <= QUIZ_PANEL_RIGHT - 6;
        const bx = beside ? r[0] + r[2] + 8 : r[0] + r[2] - b - 4, by = beside ? r[1] : r[1] + 4;
        drawZoomButton(ctx, bx, by, b);
        targets.push({ rect: r, src }, { rect: [bx, by, b, b], src });
        return r[3];
    };
    const lines = (arr, x, y, size, color, lh) => { for (const l of arr) { R.text(ctx, l, x, y, size, color); y += lh; } };
    const fit = (arr, max) => {
        if (arr.length <= max) return arr;
        const out = arr.slice(0, Math.max(0, max));
        if (out.length) out[out.length - 1] = out[out.length - 1].slice(0, -1) + "…";
        return out;
    };
    const zoomHint = touchMode ? "이미지를 누르면 크게 보기" : "Z  이미지 크게 보기";

    if (q.phase === "answering") {
        if (prob._qimg) image(prob._qimg, cx, 130, cw, 160);
        else lines(wrapTextLines(ctx, prob.question, cw, 20), cx, 130, 20, [240, 240, 245], 32);
        const drawChoice = (rect, label, sel, pressed) => {
            const [x, y, w, h] = rect, d = pressed ? 2 : 0;
            R.rect(ctx, x + d, y + d, w, h, sel ? [255, 220, 90] : [70, 70, 95], 0, 12);
            R.rect(ctx, x + 1.5 + d, y + 1.5 + d, w - 3, h - 3, [230, 230, 240], 3, 12);
            R.text(ctx, label, x + w / 2 + d, y + h / 2 - 26 + d, 44, sel ? [20, 20, 30] : [210, 210, 220], { bold: true, align: "center" });
        };
        drawChoice(QUIZ_O_RECT, "O", q.selected === "O", q.pressed === "O");
        drawChoice(QUIZ_X_RECT, "X", q.selected === "X", q.pressed === "X");
        const [sx, sy, sw, sh] = QUIZ_SUBMIT_RECT;
        const on = q.selected !== null;
        const d = q.pressed === "submit" ? 2 : 0;
        R.rect(ctx, sx + d, sy + d, sw, sh, on ? [47, 125, 79] : [52, 52, 66], 0, 10);
        R.rect(ctx, sx + 1 + d, sy + 1 + d, sw - 2, sh - 2, on ? [140, 230, 160] : [80, 80, 100], 2, 10);
        R.text(ctx, "확인", sx + sw / 2 + d, sy + 13 + d, 22, on ? [255, 255, 255] : [130, 130, 150], { bold: true, align: "center" });
        let hint = touchMode ? "O 또는 X를 누른 뒤 '확인'" : "←  O 선택      →  X 선택      Enter  제출   (마우스로 눌러도 됨)";
        if (prob._qimg) hint += "      " + zoomHint;
        R.text(ctx, hint, SCREEN_W / 2, SCREEN_H - 128, 14, [180, 200, 220], { align: "center" });
        return;
    }

    // ---- 결과: 위 문제(작게) / 가운데 정답 여부 / 아래 해설 (이미지 + 그 밑에 추가 설명 글) ----
    if (prob._qimg) image(prob._qimg, cx, 106, cw, 110);
    else lines(fit(wrapTextLines(ctx, prob.question, cw, 20), 4), cx, 106, 20, [215, 215, 225], 28);
    const correct = prob.correct, right = q.selected === correct;
    R.text(ctx, right ? `정답!   (정답 ${correct})` : `오답   (내 답 ${q.selected}  →  정답 ${correct})`,
           SCREEN_W / 2, 226, 22, right ? [120, 230, 120] : [240, 110, 110], { bold: true, align: "center" });
    const info = q.reviewInfo;
    if (info) {
        const t = `풀이 시간 ${info.elapsedSec.toFixed(1)}초 (${ANSWER_TIER_LABEL_KO[info.tier] || ""})` +
            (info.practice ? "   ·   랜덤 연습 문제 - 복습 일정은 그대로"
                : info.early ? `   ·   복습일 전이라 일정 유지 (${info.due})` : `   ·   다음 복습까지 ${info.interval}일`);
        R.text(ctx, t, SCREEN_W / 2, 258, 14, [150, 175, 205], { align: "center" });
    }
    R.line(ctx, cx, 284.5, cx + cw, 284.5, [70, 70, 95], 1);

    const top = QUIZ_EXPLAIN_TOP, areaH = QUIZ_EXPLAIN_BOTTOM - QUIZ_EXPLAIN_TOP, lh = 28, size = 19;
    let exp = wrapTextLines(ctx, (prob.explanation || "").trim(), cw, size);
    if (prob._eimg) {
        // 이미지를 먼저, 남는 자리에 추가 설명 글 (겹치지 않게)
        exp = fit(exp, Math.floor((areaH - 110 - 10) / lh));
        const imgMaxH = areaH - (exp.length ? exp.length * lh + 10 : 0);
        const h = image(prob._eimg, cx, top, cw, imgMaxH);
        lines(exp, cx, top + h + 10, size, [222, 222, 232], lh);
    } else {
        lines(fit(exp, Math.floor(areaH / lh)), cx, top, size, [222, 222, 232], lh);
    }
    R.text(ctx, `${cont}  다음 문제` + (targets.length ? "      " + zoomHint : ""), SCREEN_W / 2, SCREEN_H - 84, 14, [180, 200, 220], { align: "center" });
}
const QUIZ_EXPLAIN_TOP = 296, QUIZ_EXPLAIN_BOTTOM = SCREEN_H - 94;
