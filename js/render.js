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
        // 몬스터/보스 그림은 gfx.js(loadGfx)에서 불러온다
    } catch (e) { /* 그림이 없으면 도형으로 그린다 */ }
    Sprites.ready = true;
}
function pickAnimFrame(frames, now, offset) {
    if (!frames || !frames.length) return null;
    return frames[Math.floor((now + offset) / ANIM_FRAME_MS) % frames.length];
}
function monsterSpriteKey(m) {
    if (m.isBoss) return MONSTER_SKIN_BOSS;
    if (m.type === "melee") return (m.subtype === "dash" || m.subtype === "leaper" || m.subtype === "assassin") ? MONSTER_SKIN_MELEE_DASH : MONSTER_SKIN_MELEE;
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
    if (GFX.ready && drawObstacleTextured(ctx, o)) return;
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
function drawMonsterShape(ctx, m, now, aim) {
    const cx = m.x, cy = m.y, r = m.radius;
    if (m.isElite) {
        drawGlow(ctx, cx, cy, r * 2.6, affixColor(m.affixes[0] || "fire"), 0.35);
        R.circle(ctx, cx, cy, r + 7, [255, 215, 60], 3);
    }
    drawRageAura(ctx, m, now);
    const sub = m.subtype;
    const fr = sub === "egg" ? null : monsterFrame(m, now, aim || { x: cx, y: cy + 1 });
    if (fr) {
        const flash = now < m.hitFlashUntil;
        const tint = m.isElite ? affixColor(m.affixes[0] || "fire") : (m.rageStacks ? RAGE_COLOR : null);
        // 맞으면 살짝 찌그러졌다 돌아옴
        const squash = flash ? 1.12 : 1;
        const size = r * 2.7;
        drawPixel(ctx, tintSprite(fr, tint, flash), cx, cy - r * 0.15, size * squash, size / squash);
        return;
    }
    if (sub === "egg") {
        const body = now < m.hitFlashUntil ? [255, 255, 255] : m.color;
        ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.85, r * 1.1, 0, 0, Math.PI * 2); ctx.fillStyle = rgb(shadeColor(body, -50)); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.75, r, 0, 0, Math.PI * 2); ctx.fillStyle = rgb(body); ctx.fill();
        R.circle(ctx, cx - r * 0.3, cy - r * 0.2, 3, [170, 150, 90]); R.circle(ctx, cx + r * 0.25, cy + r * 0.3, 2, [170, 150, 90]);
        return;
    }
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
function drawBossShape(ctx, m, now, aim) {
    const cx = m.x, cy = m.y, r = m.radius;
    drawRageAura(ctx, m, now);
    const fr = bossFrame(m, now);
    if (fr) {
        const flash = now < m.hitFlashUntil;
        const tint = m.enraged ? [255, 60, 30] : (m.isMirrorClone ? [180, 180, 255] : null);
        const h = r * 3.0, w = h * fr.width / fr.height;
        const flip = aim && aim.x < cx - 6;
        const squash = flash ? 1.06 : 1;
        drawPixel(ctx, tintSprite(fr, tint, flash), cx, cy - r * 0.25, w * squash, h / squash, flip, m.isMirrorClone ? 0.75 : 1);
        return;
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
function drawPortal(ctx, x, y, now, active, ending) {
    for (let k = 0; k < 4; k++) {
        const rr = PORTAL_RADIUS - k * 7;
        const a = now / (220 - k * 30) * (k % 2 === 0 ? 1 : -1);
        const col = !active ? [90, 90, 110] : ending ? [255, 200 + k * 12, 120 + k * 30] : [120 + k * 30, 80 + k * 20, 255];
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.6, 0, -a - 4.2, -a);
        ctx.strokeStyle = rgb(col); ctx.lineWidth = 3; ctx.stroke();
    }
    R.text(ctx, ending ? "꿈에서 깨어나기 ▶" : "다음 스테이지 ▶", x, y + PORTAL_RADIUS * 0.6 + 4, 14, ending ? [255, 225, 150] : [200, 190, 255], { align: "center" });
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
    const room = g.room, p = g.player, high = Opts.high && GFX.ready;
    ctx.fillStyle = rgb([16, 16, 24]); ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // ---- 바닥 (타일 + 장식, 방마다 한 번만 그림) ----
    if (GFX.ready) ctx.drawImage(roomFloor(room, g.stage), PLAY_LEFT, PLAY_TOP);
    else {
        const bg = ROOM_BG_COLOR[room.type] || [38, 38, 52];
        R.rect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP, bg);
    }
    // 바닥 자국 (폭발 그을음 등)
    if (high) for (const d of (g.decals || [])) {
        const a = clamp((d.until - now) / 1500, 0, 1) * d.alpha;
        drawKp(ctx, d.img, d.x, d.y, d.size, d.color, a, d.rot, false);
    }
    R.rect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP, [20, 20, 30], 6, 10);
    R.rect(ctx, PLAY_LEFT + 1, PLAY_TOP + 1, PLAY_RIGHT - PLAY_LEFT - 2, PLAY_BOTTOM - PLAY_TOP - 2, [120, 120, 150], 2, 10);
    const doorOpen = room.cleared || !(room.type === "battle" || room.type === "boss");
    const door = (x, y, w, h) => {
        R.rect(ctx, x, y, w, h, doorOpen ? [60, 140, 90] : [120, 50, 50], 0, 6);
        R.rect(ctx, x + 3, y + 3, w - 6, h - 6, doorOpen ? [140, 230, 160] : [200, 90, 80], 0, 4);
    };
    if (room.connections.N) door(SCREEN_W / 2 - 26, PLAY_TOP - 10, 52, 14);
    if (room.connections.S) door(SCREEN_W / 2 - 26, PLAY_BOTTOM - 4, 52, 14);
    if (room.connections.W) door(PLAY_LEFT - 10, SCREEN_H / 2 - 26, 14, 52);
    if (room.connections.E) door(PLAY_RIGHT - 4, SCREEN_H / 2 - 26, 14, 52);

    for (const o of g.obstacles) drawObstacle(ctx, o);
    const torches = room._torches || [];
    for (const [tx, ty, seed] of torches) drawTorch(ctx, tx, ty, now, seed);

    // ---- 조명: 어둠을 깔고 빛나는 곳만 구멍 ----
    if (high) {
        const L = [[p.x, p.y, 240, 1]];
        for (const [tx, ty, seed] of torches) L.push([tx, ty - 8, 170 + 12 * Math.sin((now + seed) / 120), 0.9]);
        for (const b of g.bullets) L.push([b.x, b.y, b.owner === "monster" ? 30 : 40, 0.35]);
        for (const f of (g.fx || [])) {
            if (f.kind === "circle" || f.kind === "anim" || f.kind === "bolt" || f.kind === "charge") {
                const t = clamp((now - f.t0) / f.dur, 0, 1);
                L.push([f.x, f.y, (f.r || 40) * 2.2, 1 - t]);
            }
        }
        for (const z of (g.zones || [])) if (z.kind === "fire" || z.kind === "whirl" || z.kind === "snow") L.push([z.x, z.y, z.r * 1.6, 0.6]);
        for (const pt of (g.pets || [])) L.push([pt.x, pt.y, 80, 0.6]);
        for (const L2 of g.lasers) L.push([L2.cx, L2.cy, 90, 0.8]);
        for (const m of g.monsters) {
            if (m.isBoss) L.push([m.x, m.y, 150, 0.55]);
            else if (m.isElite) L.push([m.x, m.y, 70, 0.5]);
        }
        if (room.portal) L.push([room.portal[0], room.portal[1], 130, 0.9]);
        for (const [, gx, gy] of (room.gunChoices || [])) L.push([gx, gy, 80, 0.8]);
        if (isSpecialRoom(room)) L.push([SPECIAL_X, SPECIAL_Y, 190, 1]);
        for (const d of (g.drops || [])) L.push([d.x, d.y, 26, 0.5]);
        drawDarkness(ctx, room.type, L, stageTheme(g.stage));
    }

    // ---- 바닥 위 위험 / 장판 (어둠 위에 그려서 잘 보이게) ----
    for (const h of g.hazards) drawHazard(ctx, h, now);
    for (const z of (g.zones || [])) drawZone(ctx, z, now);
    for (const mi of (g.mines || [])) drawMine(ctx, mi, now);
    for (const tg of (g.telegraphs || [])) drawTelegraph(ctx, tg, now, g.obstacles);
    if (g.decoy) drawDecoy(ctx, g.decoy, now);
    const ready = now >= room.rewardActiveAt;
    if (room.portal) { drawGlow(ctx, room.portal[0], room.portal[1], room.endPortal ? 90 : 60, room.endPortal ? [255, 210, 120] : [140, 100, 255], 0.5); drawPortal(ctx, room.portal[0], room.portal[1], now, ready, room.endPortal); }
    if (isSpecialRoom(room)) drawSpecialRoom(ctx, room, now, p);
    for (const [gun, gx, gy] of (room.gunChoices || [])) { drawGlow(ctx, gx, gy, 46, gun.borderColor, 0.45); drawGunPickup(ctx, gun, gx, gy, now, hypot(p.x - gx, p.y - gy) < 110); }
    for (const L of g.lasers) if (L.state !== "active") drawRotatingLaser(ctx, L, now);

    for (const w of (g.shockwaves || [])) drawShockwave(ctx, w);
    // 그림자 먼저
    if (GFX.ready) {
        for (const m of g.monsters) if (!m.hidden) drawBlobShadow(ctx, m.x, m.y + m.radius * (m.isBoss ? 0.95 : 0.85), m.radius * (m.isBoss ? 1.0 : 0.85), m.radius * 0.32, m.jumpHeight ? 0.22 : 0.32);
        drawBlobShadow(ctx, p.x, p.y + p.radius * 0.95, p.radius * 0.8, p.radius * 0.3);
    }
    let boss = null;
    for (const m of g.monsters) {
        if (m.isBoss) boss = m;
        if (m.hidden) {       // 사라진 암살자/순간이동 중인 보스: 희미한 흔적만
            R.circle(ctx, m.x, m.y, m.radius * 0.6, rgb(m.color, 0.18));
            continue;
        }
        if (!m.isBoss && m.dashState === "telegraph") {
            R.circle(ctx, m.x, m.y, m.radius + 8 + 6 + Math.trunc(6 * Math.abs(Math.sin(now / 80))), [255, 70, 40], 3);
            R.line(ctx, m.x, m.y, p.x, p.y, [255, 120, 60], 2);
        }
        const lift = m.jumpHeight || 0;
        if (lift > 0 && !GFX.ready) {
            ctx.beginPath(); ctx.ellipse(m.x, m.y + m.radius * 0.6, m.radius * 0.9, m.radius * 0.35, 0, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
        }
        ctx.save(); ctx.translate(0, -lift);
        if (m.isBoss) { if (m.enraged) drawGlow(ctx, m.x, m.y, m.radius * 2.6, [255, 60, 30], 0.35); drawBossShape(ctx, m, now, p); }
        else { drawMonsterShape(ctx, m, now, p); drawMonsterAccent(ctx, m, now); }
        drawMonsterStatus(ctx, m, now);
        if (m.isBoss && m.shield > 0 && now < m.shieldUntil) R.circle(ctx, m.x, m.y, m.radius + 8, rgb([150, 210, 255], 0.55), 3);
        if (m.isBoss && m.bstate === "rest") R.text(ctx, "💦", m.x + m.radius - 4, m.y - m.radius - 6, 18, [255, 255, 255]);
        if (now < m.invulnUntil) R.circle(ctx, m.x, m.y, m.radius + 10 + 3 * Math.sin(now / 60), [255, 255, 255], 2);
        const bw = m.radius * 2, ratio = Math.max(0, m.hp / m.maxHp), bx = m.x - bw / 2, by = m.y - m.radius - (m.isBoss ? 30 : 16);
        if (!m.isBoss) {
            R.rect(ctx, bx - 1, by - 1, bw + 2, 7, [40, 0, 0], 0, 2);
            R.rect(ctx, bx, by, bw, 5, [70, 0, 0]);
            R.rect(ctx, bx, by, bw * ratio, 5, [90, 220, 90]);
            if (m.shield > 0 && now < m.shieldUntil) R.rect(ctx, bx, by, bw * Math.min(1, m.shield / m.maxHp), 5, [150, 210, 255]);
        }
        ctx.restore();
    }
    for (const L of g.lasers) if (L.state === "active") drawRotatingLaser(ctx, L, now);
    for (const pt of (g.pets || [])) drawPet(ctx, pt, now);
    for (const b of g.bullets) {
        if (b.owner === "skill") drawSkillBullet(ctx, b, now);
        else {
            drawGlowBullet(ctx, b, now);
            if (b.empower) R.circle(ctx, b.x, b.y, b.radius + 5, [230, 50, 60], 2);
            if (b.hex) R.circle(ctx, b.x, b.y, b.radius + 3, HEXER_COLOR, 2);
        }
    }
    for (const f of (g.fx || [])) drawFx(ctx, f, now, p);
    for (const z of g.zaps) drawZap(ctx, z[0], z[1], z[2], z[3]);
    for (const pt of g.particles) {
        if (pt.draw) pt.draw(ctx, now);
        else R.circle(ctx, pt.x, pt.y, Math.max(1, pt.size), pt.color);
    }
    for (const d of (g.drops || [])) drawDrop(ctx, d, now);
    // 플레이어 (맞은 직후 깜빡임)
    const blink = now < p.invulnUntil && Math.floor(now / 70) % 2 === 0;
    if (!blink || g.gameOver) drawPlayerShape(ctx, p, now);
    if (now < p.darkShieldUntil) R.circle(ctx, p.x, p.y, p.radius + 9 + 2 * Math.sin(now / 60), GUN_ELEMENTS.dark[1], 3);
    if (p.shield > 0 && now < p.shieldUntil) R.circle(ctx, p.x, p.y, p.radius + 12, rgb([150, 215, 255], 0.75), 3);
    if (now < p.dmgReduceUntil) R.circle(ctx, p.x, p.y, p.radius + 16, rgb([255, 240, 140], 0.5), 2);
    if (now < p.slowUntil) R.text(ctx, "느려짐", p.x, p.y + p.radius + 6, 12, HEXER_COLOR, { align: "center", shadow: true, bold: true });

    // ---- 빛 번짐 (더하기 합성) ----
    if (high) {
        for (const b of g.bullets) {
            const col = b.owner === "monster" ? (b.homing ? [80, 200, 230] : [255, 70, 60])
                      : b.owner === "skill" ? (b.color || [255, 240, 200]) : (b.gun ? ELEMENT_FX_COLOR[b.gun.element] || [255, 220, 120] : [255, 220, 120]);
            drawGlow(ctx, b.x, b.y, b.radius * 4 + 8, col, b.owner === "monster" ? 0.55 : 0.45);
        }
        const tg = stageTheme(g.stage).glow;
        for (const [tx, ty, seed] of torches) drawGlow(ctx, tx, ty - 12, 34 + 3 * Math.sin((now + seed) / 90), tg, 0.55);
        for (const z of (g.zones || [])) if (z.kind === "fire") drawGlow(ctx, z.x, z.y, z.r * 1.2, [255, 120, 40], 0.25);
    }
    // 피해 받으면 화면 가장자리가 붉게
    if (g.hurtFlashUntil && now < g.hurtFlashUntil) {
        const k = (g.hurtFlashUntil - now) / 260;
        const vg = ctx.createRadialGradient(SCREEN_W / 2, (PLAY_TOP + PLAY_BOTTOM) / 2, 200, SCREEN_W / 2, (PLAY_TOP + PLAY_BOTTOM) / 2, 560);
        vg.addColorStop(0, "rgba(255,0,0,0)"); vg.addColorStop(1, `rgba(220,20,20,${0.45 * k})`);
        ctx.fillStyle = vg; ctx.fillRect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
    }
    if (boss) drawBossBar(ctx, boss, now);

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
    R.text(ctx, `STAGE ${g.stage}/${FINAL_STAGE}`, hx + 300, 14, 20, [255, 230, 140], { shadow: true });
    R.text(ctx, `SCORE ${g.score}`, hx + 420, 14, 20, [170, 220, 255], { shadow: true });
    R.text(ctx, `ASPD ${p.shotsPerSec.toFixed(1)}/s   SPD ${p.speed.toFixed(1)}`, hx, 68, 14, [200, 200, 215]);
    R.text(ctx, ROOM_TYPE_LABEL[room.type] || room.type, SCREEN_W - 20, 18, 14, [230, 230, 235], { align: "right" });
    // 골드 / 꿈가루 / 연속 정답 / 부활 / 시너지
    R.text(ctx, `💰 ${g.gold || 0}   ✦ ${Meta.d.dust}`, SCREEN_W - 20, 40, 15, [255, 225, 130], { align: "right", bold: true, shadow: true });
    let tail = "";
    if (g.streak >= 2) tail += `🔥 연속 정답 ${g.streak}`;
    if (p.revives > 0) tail += `${tail ? "   " : ""}❂ x${p.revives}`;
    if (tail) R.text(ctx, tail, SCREEN_W - 20, 62, 14, [255, 170, 90], { align: "right", bold: true, shadow: true });
    if (p._synTier > 0 && p.gun) R.text(ctx, `★ ${p.gun.elementName} 시너지 ${["", "I", "II", "완성"][p._synTier]}`, SKILL_HUD_X + SKILL_SLOTS * (SKILL_HUD_SIZE + SKILL_HUD_GAP) + 2, SKILL_HUD_Y + 12, 13, p.gun.color, { bold: true, shadow: true });
    const sec = Math.max(0, Math.floor(g.elapsedMs / 1000));
    R.text(ctx, `${RunMods.depth ? `심연 ${RunMods.depth}  ·  ` : ""}${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`, SCREEN_W - 20, 2, 14, [150, 150, 165], { align: "right" });
    R.text(ctx, g.input.lastType === "touch" ? "이동: 화면을 누르고 끌기 (조이패드)   (공격은 자동)" : "이동: WASD / 방향키 / 마우스 끌기   (공격은 자동)", 20, SCREEN_H - 24, 14, [170, 170, 185]);
    drawSkillHud(ctx, p, now);
    drawMinimap(ctx, g.rooms, g.currentCoord, now);
    for (const pp of g.popups) R.text(ctx, pp.text, pp.x - 10, pp.y + pp.offset(now) - 10, 14, pp.color, { shadow: true });
    if (g.banner && now < g.banner.until) drawTopBanner(ctx, g.banner, now);
    if (g.flashUntil && now < g.flashUntil) { ctx.fillStyle = rgb(g.flashColor || [255, 255, 255], 0.45 * Math.min(1, (g.flashUntil - now) / 300)); ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    if (g.gameOver) drawCenterBanner(ctx, "GAME OVER", [255, 70, 70]);
    if (g.stageMessage) drawCenterBanner(ctx, g.stageMessage, [255, 220, 70]);
}
// 화면 위쪽 알림 (커졌다가 자리 잡는 글씨)
function drawTopBanner(ctx, b, now) {
    const t = (now - b.t0) / 1000, k = Math.min(1, t / 0.14), fade = Math.min(1, (b.until - now) / 300);
    ctx.save(); ctx.globalAlpha = fade;
    ctx.translate(SCREEN_W / 2, 150); ctx.scale(1.35 - 0.35 * k, 1.35 - 0.35 * k);
    const w = Math.max(R.textWidth(ctx, b.text, 28, true), b.sub ? R.textWidth(ctx, b.sub, 16) : 0) + 40;
    R.rect(ctx, -w / 2, -26, w, b.sub ? 66 : 44, "rgba(10,10,18,0.72)", 0, 10);
    R.text(ctx, b.text, 0, -22, 28, b.color, { align: "center", bold: true, shadow: true });
    if (b.sub) R.text(ctx, b.sub, 0, 12, 16, [235, 235, 245], { align: "center", shadow: true });
    ctx.restore();
}
// 꿈가루 / 골드
function drawDrop(ctx, d, now) {
    const bob = Math.sin(now / 120 + d.x) * 1.5;
    if (d.kind === "dust") {
        drawGlow(ctx, d.x, d.y, 16, [200, 160, 255], 0.7);
        drawKp(ctx, "star_07", d.x, d.y + bob, 16, [225, 200, 255], 1, now / 200, true);
    } else {
        R.circle(ctx, d.x, d.y + bob, 5.5, [255, 205, 70]); R.circle(ctx, d.x, d.y + bob, 5.5, [150, 100, 20], 1.5);
        R.rect(ctx, d.x - 1, d.y + bob - 3, 2, 6, [255, 245, 190]);
    }
}
// 특수 방 가운데 물건
function drawSpecialRoom(ctx, room, now, p) {
    const x = SPECIAL_X, y = SPECIAL_Y, sp = room.special || {}, bob = Math.sin(now / 260) * 3;
    drawBlobShadow(ctx, x, y + 26, 40, 11, 0.4);
    if (room.type === "treasure") {
        if (!sp.opened) drawGlow(ctx, x, y, 80, [255, 210, 90], 0.55 + 0.15 * Math.sin(now / 200));
        const lid = sp.opened ? -14 : bob;
        R.rect(ctx, x - 30, y - 8, 60, 34, [130, 76, 36], 0, 5); R.rect(ctx, x - 30, y - 8, 60, 34, [255, 210, 90], 2, 5);
        R.rect(ctx, x - 32, y - 24 + lid, 64, 18, [170, 100, 45], 0, 6); R.rect(ctx, x - 32, y - 24 + lid, 64, 18, [255, 210, 90], 2, 6);
        R.rect(ctx, x - 6, y - 6, 12, 12, [255, 220, 100], 0, 2);
        R.text(ctx, sp.opened ? "열린 상자" : "보물 상자 (다가가서 열기)", x, y + 36, 14, [255, 225, 140], { align: "center", shadow: true });
    } else if (room.type === "shop") {
        R.rect(ctx, x - 70, y - 4, 140, 30, [80, 56, 40], 0, 6); R.rect(ctx, x - 70, y - 4, 140, 30, [180, 140, 90], 2, 6);
        const items = sp.items || [];
        items.forEach((it, i) => {
            const ix = x - 51 + i * 34, c = it.id === "_heal" ? null : CARD_BY_ID[it.id];
            const col = it.sold ? [80, 80, 90] : c ? CARD_RARITY[c.r][1] : [120, 255, 150];
            if (!it.sold) drawGlow(ctx, ix, y - 18 + bob, 18, col, 0.5);
            R.circle(ctx, ix, y - 18 + (it.sold ? 0 : bob), 11, [22, 22, 32]); R.circle(ctx, ix, y - 18 + (it.sold ? 0 : bob), 11, col, 2);
            R.text(ctx, it.sold ? "×" : c ? c.icon : "✚", ix, y - 27 + (it.sold ? 0 : bob), 13, col, { align: "center", bold: true });
        });
        R.text(ctx, "꿈의 상점 (다가가면 열림)", x, y + 32, 14, [170, 220, 255], { align: "center", shadow: true });
    } else if (room.type === "altar") {
        const left = ALTAR_USES - (sp.uses || 0);
        if (left > 0) drawGlow(ctx, x, y - 10, 70, [190, 110, 255], 0.5 + 0.2 * Math.sin(now / 180));
        R.rect(ctx, x - 34, y - 2, 68, 28, [60, 40, 70], 0, 4); R.rect(ctx, x - 34, y - 2, 68, 28, [190, 130, 255], 2, 4);
        R.rect(ctx, x - 22, y - 24, 44, 24, [80, 50, 95], 0, 4);
        if (left > 0) drawKp(ctx, "flare_01", x, y - 30 + bob, 40, [220, 150, 255], 0.9, now / 400, true);
        R.text(ctx, left > 0 ? `운명의 제단 (남은 기회 ${left})` : "힘이 다한 제단", x, y + 32, 14, [215, 175, 255], { align: "center", shadow: true });
    }
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
        const icon = { treasure: ["$", [255, 210, 80]], shop: ["G", [120, 200, 255]], altar: ["?", [200, 140, 255]] }[r.type];
        if (icon) { R.rect(ctx, px + 1, py + 1, cell - 2, cell - 2, icon[1], 2, 2); R.text(ctx, icon[0], px + cell / 2, py - 1, 11, isCur ? [40, 30, 0] : icon[1], { align: "center", bold: true }); }
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
function drawQuizScreen(ctx, q, now, touchMode, g) {
    ctx.fillStyle = rgb([16, 16, 24]); ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    R.rect(ctx, 70, 60, SCREEN_W - 140, SCREEN_H - 120, [28, 28, 40], 0, 14);
    R.rect(ctx, 71, 61, SCREEN_W - 142, SCREEN_H - 122, [90, 90, 120], 2, 14);
    const cw = SCREEN_W - 200, cx = 100;
    const cont = touchMode ? "화면을 누르면" : "Enter";

    if (q.phase === "summary") {
        R.text(ctx, "문제 풀이 완료!", SCREEN_W / 2, 110, 44, [255, 220, 90], { bold: true, align: "center" });
        const c = q.correct;
        const lines = q.skillOffer
            ? [`${QUESTIONS_PER_ROOM}문제 중 ${c}문제 정답!`, "", "✨ 기억을 얻을 기회!", "이번에는 능력치 성장 대신 기억(스킬)을 하나 고릅니다"]
            : [`${QUESTIONS_PER_ROOM}문제 중 ${c}문제 정답!`, "",
            `체력 +${(c * PLAYER_HP_GROWTH_PER_CORRECT).toFixed(1)}   공격력 +${(c * PLAYER_ATK_GROWTH_PER_CORRECT).toFixed(1)}`,
            `공격속도 +${(c * PLAYER_ATTACK_SPEED_GROWTH_PER_CORRECT).toFixed(2)}/초   이동속도 +${(c * PLAYER_MOVE_SPEED_GROWTH_PER_CORRECT).toFixed(2)}`];
        let y = 230;
        for (const l of lines) { if (l) R.text(ctx, l, SCREEN_W / 2, y, 20, l.startsWith("✨") ? [255, 225, 120] : [230, 230, 235], { align: "center", bold: l.startsWith("✨") }); y += 42; }
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
    const streak = g && g.streak >= 1 ? `🔥 연속 정답 ${g.streak}   ·   ` : "";
    R.text(ctx, `${streak}맞히면 강화 카드 3장 (연속 정답이면 더 좋게)${kind}`, SCREEN_W / 2, 82, 14, [200, 200, 215], { align: "center" });

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
    R.text(ctx, `${cont}  강화 카드 고르기` + (targets.length ? "      " + zoomHint : ""), SCREEN_W / 2, SCREEN_H - 84, 14, [255, 225, 140], { align: "center", bold: true });
}
const QUIZ_EXPLAIN_TOP = 296, QUIZ_EXPLAIN_BOTTOM = SCREEN_H - 94;

// =============================================================
// 새 전투 요소 그리기: 공격 예고 / 충격파 / 지뢰 / 기억 효과 / 소환수 / 깃발
// =============================================================
function _conePath(ctx, x, y, ang, len, half) {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.arc(x, y, Math.max(1, len), ang - half, ang + half);
    ctx.closePath();
}
function _linePoly(x1, y1, x2, y2, w) {
    const [ux, uy] = unitTo(x1, y1, x2, y2), nx = -uy * w / 2, ny = ux * w / 2;
    return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
}
// 벽 뒤 안전 지역(심판자) 계산: 한 번만 계산해서 저장
function _fieldMask(tg, obstacles) {
    if (tg._mask) return tg._mask;
    const cell = 18, cells = [];
    for (let x = PLAY_LEFT; x < PLAY_RIGHT; x += cell) for (let y = PLAY_TOP; y < PLAY_BOTTOM; y += cell) {
        const cx = x + cell / 2, cy = y + cell / 2;
        if (!tg.contains(cx, cy, 0, obstacles)) continue;
        cells.push([x, y, Math.min(cell, PLAY_RIGHT - x), Math.min(cell, PLAY_BOTTOM - y)]);
    }
    tg._mask = cells;
    return cells;
}
function drawTelegraph(ctx, tg, now, obstacles) {
    const prog = tg.progress(now), c = tg.color;
    const warnA = tg.damage > 0 ? 0.13 + 0.2 * prog : 0.10 + 0.1 * prog;
    const blink = tg.fireAt - now < 200 && Math.floor(now / 60) % 2 === 0;
    ctx.save();
    switch (tg.kind) {
        case "circle":
            R.circle(ctx, tg.x, tg.y, tg.r, rgb(c, warnA));
            R.circle(ctx, tg.x, tg.y, tg.r * prog, rgb(c, 0.22));
            R.circle(ctx, tg.x, tg.y, tg.r, blink ? [255, 255, 255] : c, 2);
            break;
        case "line": {
            const poly = _linePoly(tg.x, tg.y, tg.x2, tg.y2, tg.width);
            ctx.beginPath(); poly.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
            ctx.fillStyle = rgb(c, warnA); ctx.fill();
            ctx.strokeStyle = rgb(blink ? [255, 255, 255] : c, 0.9); ctx.lineWidth = tg.damage > 0 || tg.width > 14 ? 2 : 1.5; ctx.stroke();
            if (tg.width <= 14) R.line(ctx, tg.x, tg.y, tg.x2, tg.y2, rgb(c, 0.35 + 0.5 * prog), Math.max(2, tg.width * prog));
            else {
                const ex = tg.x + (tg.x2 - tg.x) * prog, ey = tg.y + (tg.y2 - tg.y) * prog;
                const p2 = _linePoly(tg.x, tg.y, ex, ey, tg.width);
                ctx.beginPath(); p2.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
                ctx.fillStyle = rgb(c, 0.18); ctx.fill();
            }
            break;
        }
        case "cone":
            _conePath(ctx, tg.x, tg.y, tg.angle, tg.len, tg.half);
            ctx.fillStyle = rgb(c, warnA); ctx.fill();
            ctx.strokeStyle = rgb(blink ? [255, 255, 255] : c); ctx.lineWidth = 2; ctx.stroke();
            _conePath(ctx, tg.x, tg.y, tg.angle, tg.len * prog, tg.half);
            ctx.fillStyle = rgb(c, 0.22); ctx.fill();
            break;
        case "field": {
            if (tg.losBlock) {
                ctx.fillStyle = rgb(c, 0.12 + 0.22 * prog);
                for (const [x, y, w, h] of _fieldMask(tg, obstacles)) ctx.fillRect(x, y, w, h);
            } else {
                ctx.beginPath();
                ctx.rect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
                for (const [sx, sy, sr] of tg.safes) { ctx.moveTo(sx + sr, sy); ctx.arc(sx, sy, sr, 0, Math.PI * 2, true); }
                ctx.fillStyle = rgb(c, 0.12 + 0.22 * prog); ctx.fill("evenodd");
                for (const [sx, sy, sr] of tg.safes) {
                    R.circle(ctx, sx, sy, sr, [120, 255, 150], 3);
                    R.text(ctx, "안전", sx, sy - 9, 16, [170, 255, 190], { align: "center", bold: true, shadow: true });
                }
            }
            break;
        }
    }
    ctx.restore();
}
function drawShockwave(ctx, w) {
    const steps = 90;
    ctx.save();
    ctx.beginPath(); ctx.rect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP); ctx.clip();   // 방 밖으로 안 그림
    ctx.lineWidth = SHOCKWAVE_THICKNESS; ctx.lineCap = "butt";
    ctx.strokeStyle = rgb(w.color, 0.75);
    let drawing = false;
    ctx.beginPath();
    if (w.seg) {
        // 지그재그 고리: 벽 조각만 호로 그린다
        const sw = w.seg.width, n = Math.round(Math.PI / sw);
        for (let k = 0; k < n; k++) {
            const a0 = w.seg.phase + k * 2 * sw;
            ctx.moveTo(w.x + Math.cos(a0) * w.r, w.y + Math.sin(a0) * w.r);
            ctx.arc(w.x, w.y, w.r, a0, a0 + sw);
        }
        ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
        ctx.restore();
        return;
    }
    for (let i = 0; i <= steps; i++) {
        const a = i / steps * Math.PI * 2, gap = w.inGap(a);
        const x = w.x + Math.cos(a) * w.r, y = w.y + Math.sin(a) * w.r;
        if (gap) { drawing = false; continue; }
        if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
    ctx.restore();
}
function drawMine(ctx, mi, now) {
    const armed = now >= mi.armAt;
    R.circle(ctx, mi.x, mi.y, 11, [50, 45, 30]);
    R.circle(ctx, mi.x, mi.y, 11, TRAPPER_COLOR, 2);
    const on = mi.triggered ? Math.floor(now / 70) % 2 === 0 : armed && Math.floor(now / 400) % 2 === 0;
    R.circle(ctx, mi.x, mi.y, 4, on ? [255, 60, 40] : [120, 60, 40]);
    if (armed) R.circle(ctx, mi.x, mi.y, 24, rgb([255, 80, 60], 0.25), 1);
}
function drawFx(ctx, f, now, p) {
    const t = clamp((now - f.t0) / f.dur, 0, 1), a = 1 - t, c = f.color;
    let x = f.x, y = f.y;
    if (f.follow === "player") { x = p.x; y = p.y; }
    if (f.followM && f.followM.hp > 0) { x = f.followM.x; y = f.followM.y; }
    switch (f.kind) {
        case "spawnmark": {  // 2웨이브 등장 자리
            R.circle(ctx, x, y, f.r * (0.4 + 0.6 * t), rgb(c, 0.25 + 0.25 * t));
            R.circle(ctx, x, y, f.r, rgb(c, 0.8), 2);
            if (Math.floor(now / 90) % 2) R.text(ctx, "!", x, y - 12, 20, [255, 230, 200], { align: "center", bold: true });
            break;
        }
        case "sweep": {      // 광선이 쓸고 지나갈 부채꼴 + 방향 화살표
            const warnK = clamp((now - f.t0) / f.warn, 0, 1), inWarn = now - f.t0 < f.warn;
            const a0 = f.start, a1 = f.start + f.span, lo = Math.min(a0, a1), hi = Math.max(a0, a1);
            ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.len, lo, hi); ctx.closePath();
            ctx.fillStyle = rgb([255, 60, 60], inWarn ? 0.08 + 0.10 * warnK : 0.06); ctx.fill();
            ctx.strokeStyle = rgb([255, 90, 80], inWarn ? 0.7 : 0.35); ctx.lineWidth = 2; ctx.stroke();
            // 시작 쪽 모서리는 굵게
            R.line(ctx, f.x, f.y, f.x + Math.cos(a0) * f.len, f.y + Math.sin(a0) * f.len, rgb([255, 220, 120], inWarn ? 0.9 : 0.3), 3);
            if (inWarn) {
                const rr = f.len * 0.82, sgn = Math.sign(f.span);
                ctx.beginPath(); ctx.arc(f.x, f.y, rr, lo + 0.08, hi - 0.08);
                ctx.strokeStyle = rgb([255, 220, 120], 0.8); ctx.lineWidth = 3; ctx.stroke();
                const ae = a1 - sgn * 0.08, hx = f.x + Math.cos(ae) * rr, hy = f.y + Math.sin(ae) * rr;
                const tx = -Math.sin(ae) * sgn, ty = Math.cos(ae) * sgn;      // 도는 방향
                const nx = Math.cos(ae), ny = Math.sin(ae);
                R.poly(ctx, [[hx + tx * 14, hy + ty * 14], [hx - tx * 4 + nx * 9, hy - ty * 4 + ny * 9], [hx - tx * 4 - nx * 9, hy - ty * 4 - ny * 9]], [255, 220, 120]);
            }
            break;
        }
        case "anim": drawSheet(ctx, f.sheet, t, x, y, f.scale || 2, f.rot || 0, f.alpha === undefined ? 1 : f.alpha, f.tint); break;
        case "kp": drawKp(ctx, f.img, x, y, f.size * (1 + (f.grow || 0) * t), f.color, (f.alpha || 1) * a, f.rot || 0, f.add !== false); break;
        case "circle": {
            const el = f.el || guessElement(c);
            R.circle(ctx, x, y, f.r * (0.7 + 0.3 * t), rgb(c, (GFX.ready ? 0.25 : 0.45) * a)); R.circle(ctx, x, y, f.r, rgb(c, 0.8 * a), 2);
            if (GFX.ready) {
                const sc = f.r / 16;
                if (el === "fire") drawSheet(ctx, "explosion", t, x, y, f.r / 18);
                else if (el === "ice") drawSheet(ctx, "ice", t, x, y, sc);
                else if (el === "light") { drawSheet(ctx, "circle", t, x, y, sc, 0, 1, [255, 240, 160]); drawKp(ctx, "star_06", x, y, f.r * 1.6, [255, 245, 190], a, t * 2, true); }
                else if (el === "dark") { drawSheet(ctx, "circle", t, x, y, sc, 0, 1, [190, 110, 255]); drawKp(ctx, "smoke_07", x, y, f.r * 2, [120, 60, 180], 0.6 * a, t, false); }
                else drawSheet(ctx, "circle", t, x, y, sc);
            }
            break;
        }
        case "ring": R.circle(ctx, x, y, f.r * (0.4 + 0.6 * t), rgb(c, a), 3); break;
        case "puff": for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; R.circle(ctx, x + Math.cos(an) * f.r * t, y + Math.sin(an) * f.r * t, 4 * a + 1, rgb(c, a)); } break;
        case "cone": {
            _conePath(ctx, x, y, f.angle, f.len, f.half); ctx.fillStyle = rgb(c, (GFX.ready ? 0.22 : 0.45) * a); ctx.fill();
            if (GFX.ready) {
                const el = guessElement(c), mx = x + Math.cos(f.angle) * f.len * 0.55, my = y + Math.sin(f.angle) * f.len * 0.55;
                if (el === "fire") drawSheet(ctx, "flam", t, mx, my, f.len / 26, f.angle + Math.PI / 2);
                else if (el === "ice") drawSheet(ctx, "claw", t, mx, my, f.len / 26, f.angle, 1, [170, 230, 255]);
                else drawSheet(ctx, "curved", t, mx, my, f.len / 24, f.angle, 1, el === "dark" ? [190, 110, 255] : null);
            }
            break;
        }
        case "line": R.line(ctx, x, y, f.x2, f.y2, rgb(c, 0.7 * a), f.r * (0.6 + 0.4 * a)); break;
        case "beam": R.line(ctx, x, y, f.x2, f.y2, rgb(c, a), 3); break;
        case "warn": {
            R.circle(ctx, x, y, f.r, rgb(c, 0.10 + 0.15 * t)); R.circle(ctx, x, y, f.r * t, rgb(c, 0.2));
            R.circle(ctx, x, y, f.r, rgb(c, 0.8), 2); break;
        }
        case "meteor": {
            const h = 220 * (1 - t);
            R.circle(ctx, x, y, f.r, rgb(c, 0.12 + 0.12 * t), 0); R.circle(ctx, x, y, f.r, rgb(c, 0.6), 1);
            R.line(ctx, x + h * 0.5 + 18, y - h - 18, x + h * 0.5, y - h, rgb(c, 0.6), 4);
            R.circle(ctx, x + h * 0.5, y - h, 8, [255, 250, 220]); break;
        }
        case "bolt": {
            const pts = [[x, y - 260]];
            for (let k = 1; k < 7; k++) pts.push([x + uniform(-12, 12), y - 260 + k * 260 / 7]);
            pts.push([x, y]);
            R.lines(ctx, pts, [255, 240, 120], 7 * a + 1); R.lines(ctx, pts, [255, 255, 255], 2);
            R.circle(ctx, x, y, f.r, rgb(c, 0.4 * a));
            if (GFX.ready) drawSheet(ctx, "thunder", t, x, y - 10, 3);
            break;
        }
        case "charge": R.circle(ctx, x, y, f.r * (1 - t) + 10, rgb(c, 0.9), 3); R.circle(ctx, x, y, f.r, rgb(c, 0.12)); break;
        case "throw": {
            const px = f.x + (f.x2 - f.x) * t, py = f.y + (f.y2 - f.y) * t - Math.sin(t * Math.PI) * 80;
            R.circle(ctx, f.x2, f.y2, 80, rgb(c, 0.15)); R.circle(ctx, f.x2, f.y2, 80, rgb(c, 0.6), 1);
            R.circle(ctx, px, py, f.r, c); R.circle(ctx, px, py, f.r, [220, 180, 255], 2); break;
        }
        case "flash": {
            const tg = f.tg;
            ctx.save(); ctx.globalAlpha = 0.6 * a;
            const fc = shadeColor(c, 60);
            if (tg.kind === "circle") R.circle(ctx, tg.x, tg.y, tg.r, fc);
            else if (tg.kind === "line") { const poly = _linePoly(tg.x, tg.y, tg.x2, tg.y2, tg.width); R.poly(ctx, poly, fc); }
            else if (tg.kind === "cone") { _conePath(ctx, tg.x, tg.y, tg.angle, tg.len, tg.half); ctx.fillStyle = rgb(fc); ctx.fill(); }
            else if (tg.kind === "field") {
                if (tg._mask) { ctx.fillStyle = rgb(fc); for (const [mx, my, mw, mh] of tg._mask) ctx.fillRect(mx, my, mw, mh); }
                else {
                    ctx.beginPath(); ctx.rect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
                    for (const [sx, sy, sr] of tg.safes) { ctx.moveTo(sx + sr, sy); ctx.arc(sx, sy, sr, 0, Math.PI * 2, true); }
                    ctx.fillStyle = rgb(fc); ctx.fill("evenodd");
                }
            }
            ctx.restore(); break;
        }
    }
}
function drawZone(ctx, z, now) {
    const c = z.color, life = clamp((z.until - now) / 400, 0, 1);
    switch (z.kind) {
        case "whirl":
            R.circle(ctx, z.x, z.y, z.r, rgb(c, 0.10 * life));
            for (let k = 0; k < 3; k++) {
                const a = now / 90 + k * Math.PI * 2 / 3;
                ctx.beginPath(); ctx.arc(z.x, z.y, z.r - 6, a, a + 0.9); ctx.strokeStyle = rgb(c, 0.8 * life); ctx.lineWidth = 5; ctx.stroke();
            }
            break;
        case "blades":
            R.circle(ctx, z.x, z.y, z.r, rgb(c, 0.12 * life)); R.circle(ctx, z.x, z.y, z.r, rgb(c, 0.5 * life), 1);
            for (let k = 0; k < 5; k++) {
                const a = now / 70 + k * Math.PI * 2 / 5, rr = z.r * (0.35 + 0.5 * ((k % 2) ? 1 : 0.6));
                const bx = z.x + Math.cos(a) * rr, by = z.y + Math.sin(a) * rr;
                R.line(ctx, bx - Math.cos(a + 1.6) * 8, by - Math.sin(a + 1.6) * 8, bx + Math.cos(a + 1.6) * 8, by + Math.sin(a + 1.6) * 8, rgb([240, 240, 255], life), 3);
            }
            break;
        case "breath":
            if (z.angle !== null && z.angle !== undefined) {
                _conePath(ctx, z.x, z.y, z.angle, 230, radians(16));
                const gr = ctx.createRadialGradient(z.x, z.y, 10, z.x, z.y, 230);
                gr.addColorStop(0, "rgba(255,240,150,0.75)"); gr.addColorStop(1, "rgba(255,90,30,0.15)");
                ctx.fillStyle = gr; ctx.fill();
            }
            break;
        default: {   // fire / poison / snow
            R.circle(ctx, z.x, z.y, z.r, rgb(c, (z.kind === "snow" ? 0.18 : 0.22) * life));
            R.circle(ctx, z.x, z.y, z.r, rgb(c, 0.6 * life), 2);
            for (let k = 0; k < 6; k++) {
                const a = now / 400 + k * 1.05, rr = z.r * (0.25 + 0.6 * ((k * 37) % 10) / 10);
                const px = z.x + Math.cos(a) * rr, py = z.y + Math.sin(a) * rr - (z.kind === "fire" ? (now / 8 + k * 13) % 10 : 0);
                R.circle(ctx, px, py, 3, rgb(shadeColor(c, 50), 0.8 * life));
            }
        }
    }
}
function drawPet(ctx, pt, now) {
    const dirs = GFX.mon[pt.kind === "dragon" ? "pet_dragon" : "pet_spirit"];
    if (dirs) {
        drawGlow(ctx, pt.x, pt.y, 26, pt.kind === "dragon" ? [255, 140, 60] : [255, 245, 180], 0.5);
        const fr = dirs[0][Math.floor(now / 140) % 4];
        drawPixel(ctx, fr, pt.x, pt.y + Math.sin(now / 160) * 2, pt.kind === "dragon" ? 30 : 24, pt.kind === "dragon" ? 30 : 24);
        return;
    }
    if (pt.kind === "dragon") {
        const flap = Math.sin(now / 80) * 5;
        R.poly(ctx, [[pt.x - 4, pt.y], [pt.x - 18, pt.y - 8 - flap], [pt.x - 10, pt.y + 4]], [230, 90, 40]);
        R.poly(ctx, [[pt.x + 4, pt.y], [pt.x + 18, pt.y - 8 - flap], [pt.x + 10, pt.y + 4]], [230, 90, 40]);
        R.circle(ctx, pt.x, pt.y, 9, [255, 130, 50]); R.circle(ctx, pt.x + 3, pt.y - 3, 2, [40, 20, 10]);
    } else {
        R.circle(ctx, pt.x, pt.y, 9 + Math.sin(now / 120) * 2, rgb([255, 245, 180], 0.35));
        R.circle(ctx, pt.x, pt.y, 5, [255, 250, 210]);
    }
}
function drawDecoy(ctx, d, now) {
    R.circle(ctx, d.x, d.y, 380, rgb([255, 200, 90], 0.05));
    R.circle(ctx, d.x, d.y, 18 + 4 * Math.sin(now / 100), [255, 200, 90], 2);
    R.line(ctx, d.x, d.y + 14, d.x, d.y - 26, [120, 90, 60], 3);
    const wave = Math.sin(now / 90) * 3;
    R.poly(ctx, [[d.x, d.y - 26], [d.x + 22, d.y - 20 + wave], [d.x, d.y - 12]], [255, 90, 70]);
}
function drawSkillBullet(ctx, b, now) {
    const c = b.color || [255, 255, 255], r = b.radius;
    const rot = pts => R.rotatePoints(pts, b.x, b.y, b.dirX, b.dirY);
    switch (b.kind) {
        case "dagger": R.poly(ctx, rot([[r * 2.4, 0], [-r, -r * 0.7], [-r * 0.4, 0], [-r, r * 0.7]]), [230, 230, 245]); break;
        case "bolt": case "darkbolt":
            R.line(ctx, b.x - b.dirX * r * 3, b.y - b.dirY * r * 3, b.x + b.dirX * r, b.y + b.dirY * r, c, 5);
            R.circle(ctx, b.x, b.y, r * 0.6, [240, 220, 255]); break;
        case "orb":
            if (GFX.fx.energy) { drawSheet(ctx, "energy", (now / 400) % 1, b.x, b.y, r / 4, 0, 1, [255, 245, 190]); break; }
            R.circle(ctx, b.x, b.y, r + 4 + Math.sin(now / 80) * 2, rgb(c, 0.35)); R.circle(ctx, b.x, b.y, r, [255, 250, 220]); break;
        case "fireball": case "fireball_s":
            if (GFX.fx.fireball) { drawSheet(ctx, "fireball", (now / 400) % 1, b.x, b.y, r / 4.5, Math.atan2(b.dirY, b.dirX)); break; }
            R.circle(ctx, b.x - b.dirX * r, b.y - b.dirY * r, r * 0.9, [220, 60, 20]);
            R.circle(ctx, b.x, b.y, r + 2, [255, 120, 40]); R.circle(ctx, b.x, b.y, r * 0.5, [255, 230, 140]); break;
        case "phantom": R.circle(ctx, b.x, b.y, r + 4, rgb([200, 220, 255], 0.35)); R.circle(ctx, b.x, b.y, r, [230, 240, 255]); break;
        case "missile": R.circle(ctx, b.x, b.y, r + 2, c); R.circle(ctx, b.x, b.y, r - 2, [40, 10, 60]); break;
        default: R.circle(ctx, b.x, b.y, r + 2, c); R.circle(ctx, b.x, b.y, Math.max(1, r - 2), [255, 255, 255]);
    }
}
// 새 몬스터 표시 (그림 위에 덧그림)
function drawMonsterAccent(ctx, m, now) {
    const cx = m.x, cy = m.y, r = m.radius;
    switch (m.subtype) {
        case "kamikaze": {
            const fuse = m.aiState === "fuse";
            R.circle(ctx, cx, cy - r - 4, 4, fuse && Math.floor(now / 70) % 2 ? [255, 255, 255] : [255, 80, 40]);
            R.line(ctx, cx, cy - r, cx + 4, cy - r - 4, [90, 70, 50], 2); break;
        }
        case "turret": R.rect(ctx, cx - r * 0.5, cy - r * 0.5, r, r, [90, 90, 105], 2, 3);
            R.line(ctx, cx, cy, cx + Math.cos(m.aiAngle) * (r + 8), cy + Math.sin(m.aiAngle) * (r + 8), [200, 200, 215], 4); break;
        case "sniper": R.circle(ctx, cx, cy, r + 4, [120, 170, 255], 1); R.line(ctx, cx - r - 6, cy, cx + r + 6, cy, [150, 190, 255], 1); R.line(ctx, cx, cy - r - 6, cx, cy + r + 6, [150, 190, 255], 1); break;
        case "trapper": R.circle(ctx, cx + r * 0.6, cy + r * 0.5, 4, [255, 80, 50]); break;
        case "shaman": for (let k = 0; k < 3; k++) { const a = now / 300 + k * 2.1; R.circle(ctx, cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7), 3, SHAMAN_COLOR); } break;
        case "hexer": R.circle(ctx, cx, cy, r + 5 + Math.sin(now / 150) * 2, rgb(HEXER_COLOR, 0.6), 2); break;
        case "leaper": if (m.aiState !== "air") R.line(ctx, cx - r, cy + r, cx + r, cy + r, [120, 90, 50], 3); break;
        case "egg": {
            const left = Math.max(0, (m.hatchAt || 0) - now);
            if (left < 1500) R.circle(ctx, cx, cy, r + 3, Math.floor(now / 120) % 2 ? [255, 120, 80] : [255, 230, 160], 2);
            break;
        }
    }
    if (m.shield > 0 && now < m.shieldUntil) R.circle(ctx, cx, cy, r + 8, rgb([150, 210, 255], 0.55), 3);
    if (m.affixes.length) {
        const label = m.affixes.map(affixName).join("·");
        R.text(ctx, label, cx, cy - r - 30, 12, affixColor(m.affixes[0]), { align: "center", shadow: true, bold: true });
    }
}
function drawBossBar(ctx, m, now) {
    const w = 420, x = SCREEN_W / 2 - w / 2, y = PLAY_BOTTOM - 40;   // 보스가 위쪽에 있을 때 가리지 않게 아래에
    R.rect(ctx, x - 2, y - 2, w + 4, 16, [20, 10, 14], 0, 4);
    R.rect(ctx, x, y, w * Math.max(0, m.hp / m.maxHp), 12, m.enraged ? [255, 80, 50] : [230, 70, 90], 0, 3);
    for (const ratio of [BOSS_PHASE2_RATIO, BOSS_PHASE3_RATIO]) R.line(ctx, x + w * ratio, y - 2, x + w * ratio, y + 14, [255, 255, 255], 2);
    const st = m.bstate === "rest" ? "  ·  지침! (받는 피해 증가)" : "";
    R.text(ctx, `${m.bossName}  ·  ${m.phase}페이즈${st}`, SCREEN_W / 2, y + 16, 14, m.bstate === "rest" ? [140, 255, 170] : [255, 220, 200], { align: "center", shadow: true });
}
// HUD의 기억 칸
const SKILL_HUD_X = 380, SKILL_HUD_Y = 46, SKILL_HUD_SIZE = 42, SKILL_HUD_GAP = 8;
function drawSkillHud(ctx, p, now) {
    for (let i = 0; i < SKILL_SLOTS; i++) {
        const x = SKILL_HUD_X + i * (SKILL_HUD_SIZE + SKILL_HUD_GAP), y = SKILL_HUD_Y, S = SKILL_HUD_SIZE;
        const s = p.skills[i];
        R.rect(ctx, x, y, S, S, [16, 16, 24], 0, 8);
        if (!s) { R.rect(ctx, x + 0.5, y + 0.5, S - 1, S - 1, [55, 55, 72], 1, 8); continue; }
        const def = SKILL_BY_ID[s.id], col = skillElementColor(def.el);
        R.rect(ctx, x, y, S, S, shadeColor(col, -120), 0, 8);
        R.text(ctx, def.name.replace(/ /g, "").slice(0, 2), x + S / 2, y + 11, 15, col, { align: "center", bold: true });
        const left = Math.max(0, s.readyAt - now), total = skillCooldownMs(def, s.level);
        if (left > 0) {
            ctx.save(); ctx.beginPath(); ctx.moveTo(x + S / 2, y + S / 2);
            ctx.arc(x + S / 2, y + S / 2, S * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / total));
            ctx.closePath(); ctx.clip();
            R.rect(ctx, x, y, S, S, "rgba(0,0,0,0.6)", 0, 8); ctx.restore();
        }
        const flash = s.castAt && now - s.castAt < 200;
        R.rect(ctx, x + 1, y + 1, S - 2, S - 2, flash ? [255, 255, 255] : col, 2, 8);
        if (s.level > 0) R.text(ctx, `+${s.level}`, x + S - 3, y + S - 15, 12, [255, 230, 120], { align: "right", shadow: true, bold: true });
        if (skillHasSynergy(def, p.gun)) R.circle(ctx, x + 6, y + 6, 3, [255, 230, 120]);
    }
}

// ---------------- 기억 고르기 화면 ----------------
const SKILL_CARD_W = 236, SKILL_CARD_H = 236, SKILL_CARD_GAP = 18, SKILL_CARD_Y = 140;
function skillPickRects(sp, p) {
    const n = sp.phase === "choose" ? sp.options.length : p.skills.length;
    const total = n * SKILL_CARD_W + (n - 1) * SKILL_CARD_GAP, x0 = SCREEN_W / 2 - total / 2;
    const cards = [];
    for (let i = 0; i < n; i++) cards.push([x0 + i * (SKILL_CARD_W + SKILL_CARD_GAP), SKILL_CARD_Y, SKILL_CARD_W, SKILL_CARD_H]);
    if (sp.phase === "replace") cards.push([SCREEN_W / 2 - 130, SKILL_CARD_Y + SKILL_CARD_H + 16, 260, 40]);    // 새 기억 포기
    const confirm = [SCREEN_W / 2 - 100, sp.phase === "replace" ? 470 : 440, 200, 52];
    return { cards, confirm };
}
function drawSkillCard(ctx, rect, def, level, owned, selected, p, now, headline) {
    const [x, y, w, h] = rect, col = skillElementColor(def.el);
    R.rect(ctx, x, y, w, h, selected ? [44, 44, 64] : [30, 30, 44], 0, 12);
    R.rect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, selected ? [255, 220, 90] : shadeColor(col, -60), selected ? 4 : 2, 12);
    R.rect(ctx, x + 12, y + 12, 70, 22, shadeColor(col, -110), 0, 6);
    R.text(ctx, SKILL_ELEMENT_INFO[def.el][0], x + 47, y + 15, 13, col, { align: "center", bold: true });
    R.text(ctx, headline, x + w - 12, y + 15, 13, owned ? [255, 220, 120] : [140, 230, 160], { align: "right", bold: true });
    R.text(ctx, def.name, x + w / 2, y + 46, 22, [245, 245, 250], { align: "center", bold: true });
    const cd = skillCooldownMs(def, level) / 1000;
    R.text(ctx, `쿨타임 ${cd.toFixed(1)}초  ·  사거리 ${def.range}`, x + w / 2, y + 80, 13, [175, 180, 200], { align: "center" });
    let yy = y + 106;
    for (const line of wrapTextLines(ctx, def.desc, w - 28, 15).slice(0, 4)) { R.text(ctx, line, x + 14, yy, 15, [225, 225, 235]); yy += 22; }
    if (skillHasSynergy(def, p.gun)) R.text(ctx, `★ 지금 총과 시너지 (피해 x${SKILL_SYNERGY_MULT})`, x + w / 2, y + h - 28, 13, [255, 225, 120], { align: "center" });
}
function drawSkillPick(ctx, sp, p, now, touchMode) {
    ctx.fillStyle = rgb([16, 16, 24]); ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    R.rect(ctx, 40, 50, SCREEN_W - 80, SCREEN_H - 100, [26, 26, 38], 0, 14);
    R.rect(ctx, 41, 51, SCREEN_W - 82, SCREEN_H - 102, [120, 110, 170], 2, 14);
    const rects = skillPickRects(sp, p);
    if (sp.phase === "choose") {
        R.text(ctx, "✨ 기억을 하나 고르세요", SCREEN_W / 2, 74, 28, [255, 225, 120], { align: "center", bold: true });
        R.text(ctx, "같은 기억을 고르면 +1 강화  ·  총과 같은 속성이면 시너지", SCREEN_W / 2, 112, 14, [185, 185, 205], { align: "center" });
        sp.options.forEach((id, i) => {
            const def = SKILL_BY_ID[id], owned = p.skills.find(s => s.id === id);
            const lvl = owned ? Math.min(SKILL_MAX_LEVEL, owned.level + 1) : 0;
            const head = owned ? `+${owned.level} → +${lvl}` : (p.skills.length >= SKILL_SLOTS ? "NEW (교체)" : "NEW");
            drawSkillCard(ctx, rects.cards[i], def, lvl, !!owned, sp.sel === i, p, now, head);
        });
    } else {
        const nd = SKILL_BY_ID[sp.pending];
        R.text(ctx, `기억 칸이 꽉 찼어요. '${nd.name}' 대신 버릴 기억을 고르세요`, SCREEN_W / 2, 78, 22, [255, 225, 120], { align: "center", bold: true });
        R.text(ctx, "버린 기억은 사라집니다 (강화 수치도 함께)", SCREEN_W / 2, 112, 14, [185, 185, 205], { align: "center" });
        p.skills.forEach((s, i) => drawSkillCard(ctx, rects.cards[i], SKILL_BY_ID[s.id], s.level, true, sp.sel === i, p, now, `보유 +${s.level}`));
        const gi = p.skills.length, [gx, gy, gw, gh] = rects.cards[gi];
        R.rect(ctx, gx, gy, gw, gh, sp.sel === gi ? [70, 50, 50] : [40, 34, 40], 0, 10);
        R.rect(ctx, gx + 1, gy + 1, gw - 2, gh - 2, sp.sel === gi ? [255, 220, 90] : [120, 90, 100], 2, 10);
        R.text(ctx, `'${nd.name}' 받지 않기`, gx + gw / 2, gy + 11, 16, [235, 210, 210], { align: "center" });
    }
    const [bx, by, bw, bh] = rects.confirm, on = sp.sel !== null;
    R.rect(ctx, bx, by, bw, bh, on ? [47, 125, 79] : [52, 52, 66], 0, 10);
    R.rect(ctx, bx + 1, by + 1, bw - 2, bh - 2, on ? [140, 230, 160] : [80, 80, 100], 2, 10);
    const label = sp.phase === "choose" ? "선택" : (sp.sel === p.skills.length ? "받지 않기" : "버리고 교체");
    R.text(ctx, label, bx + bw / 2, by + 13, 22, on ? [255, 255, 255] : [130, 130, 150], { align: "center", bold: true });
    R.text(ctx, touchMode ? "카드를 누른 뒤 아래 버튼" : "←/→ 또는 1~4로 고르고 Enter  (마우스로 눌러도 됨)", SCREEN_W / 2, SCREEN_H - 84, 14, [180, 200, 220], { align: "center" });
}

// =============================================================
// 강화 카드 / 상점 / 운명의 제단 화면 (게임 화면 위에 덮어서)
// =============================================================
const CARD_W = 200, CARD_H = 250, CARD_GAP = 14, CARD_Y = 170;
function cardPickRects(cp) {
    let n;
    if (cp.mode === "pick") n = cp.options.length;
    else if (cp.mode === "shop") n = cp.room.special.items.length;
    else n = 2;
    const w = cp.mode === "altar" ? 250 : n >= 5 ? 160 : n >= 4 ? 186 : CARD_W;
    const h = cp.mode === "altar" ? 120 : CARD_H;
    const total = n * w + (n - 1) * CARD_GAP, x0 = SCREEN_W / 2 - total / 2;
    const cards = Array.from({ length: n }, (_, i) => [x0 + i * (w + CARD_GAP), cp.mode === "altar" ? 300 : CARD_Y, w, h]);
    const close = cp.mode === "shop" ? [SCREEN_W / 2 - 90, CARD_Y + CARD_H + 26, 180, 46] : null;
    return { cards, close };
}
function drawCardFace(ctx, rect, c, g, now, k, extra) {
    const [x, y, w, h] = rect, rc = CARD_RARITY[c.r], col = rc[1];
    ctx.save(); ctx.globalAlpha *= k;
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-(x + w / 2), -(y + h / 2));
    if (c.r !== "common") drawGlow(ctx, x + w / 2, y + h / 2, w * 0.75, col, c.r === "legend" ? 0.55 + 0.2 * Math.sin(now / 140) : 0.35);
    R.rect(ctx, x, y, w, h, [26, 26, 40], 0, 14);
    R.rect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, col, c.r === "legend" ? 4 : c.r === "rare" ? 3 : 2, 14);
    R.rect(ctx, x + w / 2 - 34, y + 12, 68, 22, shadeColor(col, -120), 0, 6);
    R.text(ctx, rc[0], x + w / 2, y + 15, 13, col, { align: "center", bold: true });
    R.circle(ctx, x + w / 2, y + 80, 34, rgb(c.color, 0.16)); R.circle(ctx, x + w / 2, y + 80, 34, c.color, 2);
    R.text(ctx, c.icon, x + w / 2, y + 62, 32, c.color, { align: "center", bold: true });
    R.text(ctx, c.name, x + w / 2, y + 126, 19, [255, 255, 255], { align: "center", bold: true });
    const lines = wrapTextLines(ctx, cardDesc(g, c), w - 24, 14);
    lines.slice(0, 4).forEach((l, i) => R.text(ctx, l, x + w / 2, y + 158 + i * 21, 14, [220, 220, 232], { align: "center" }));
    if (extra) extra(x, y, w, h);
    ctx.restore();
}
function drawCardPick(ctx, g, cp, now, touch) {
    ctx.fillStyle = "rgba(8,8,16,0.8)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const age = now - cp.openedAt;
    R.text(ctx, cp.title, SCREEN_W / 2, 74, 30, cp.color, { align: "center", bold: true, shadow: true });
    if (cp.sub) R.text(ctx, cp.sub, SCREEN_W / 2, 118, 16, [225, 225, 235], { align: "center" });
    const rects = cardPickRects(cp);
    if (cp.mode === "pick") {
        cp.options.forEach((c, i) => {
            const k = clamp((age - i * 70) / 160, 0, 1);
            if (k > 0) drawCardFace(ctx, rects.cards[i], c, g, now, k, (x, y, w, h) =>
                R.text(ctx, touch ? "누르면 선택" : `${i + 1}번 키 / 클릭`, x + w / 2, y + h - 26, 12, [140, 140, 165], { align: "center" }));
        });
    } else if (cp.mode === "shop") {
        R.text(ctx, `💰 ${g.gold} 골드`, SCREEN_W / 2, 140, 18, [255, 225, 130], { align: "center", bold: true });
        cp.room.special.items.forEach((it, i) => {
            const r = rects.cards[i];
            const priceLine = (x, y, w, h) => {
                const can = !it.sold && g.gold >= it.price;
                R.rect(ctx, x + 16, y + h - 40, w - 32, 28, it.sold ? [50, 50, 60] : can ? [47, 125, 79] : [90, 50, 50], 0, 8);
                R.text(ctx, it.sold ? "판매 완료" : `${it.price} 골드`, x + w / 2, y + h - 35, 15, [255, 255, 255], { align: "center", bold: true });
            };
            if (it.id === "_heal") {
                const fake = { r: "common", name: "회복 물약", icon: "✚", color: [120, 255, 150], desc: `최대 체력의 ${Math.round(SHOP_HEAL_RATIO * 100)}% 회복` };
                drawCardFace(ctx, r, fake, g, now, it.sold ? 0.5 : 1, priceLine);
            } else drawCardFace(ctx, r, CARD_BY_ID[it.id], g, now, it.sold ? 0.5 : 1, priceLine);
        });
    } else {
        const p = g.player, sp = cp.room.special, left = ALTAR_USES - sp.uses;
        const labels = [[`체력 ${fmtNum(altarCost(p))} 바치기`, left > 0 ? `남은 기회 ${left}번 · 희귀/전설 카드 또는 꽝` : "힘이 다했어요", [190, 120, 255]],
                        ["떠나기", "제단을 떠납니다", [150, 150, 170]]];
        labels.forEach(([t1, t2, col], i) => {
            const [x, y, w, h] = rects.cards[i];
            R.rect(ctx, x, y, w, h, [30, 26, 42], 0, 14); R.rect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, col, 3, 14);
            R.text(ctx, t1, x + w / 2, y + 34, 20, [255, 255, 255], { align: "center", bold: true });
            R.text(ctx, t2, x + w / 2, y + 72, 13, [210, 200, 225], { align: "center" });
        });
        drawGlow(ctx, SCREEN_W / 2, 220, 70, [190, 110, 255], 0.5 + 0.2 * Math.sin(now / 160));
        drawKp(ctx, "flare_01", SCREEN_W / 2, 220, 80, [220, 160, 255], 0.9, now / 500, true);
    }
    if (cp.msg && now - cp.msgAt < 1600) R.text(ctx, cp.msg, SCREEN_W / 2, cp.mode === "altar" ? 440 : CARD_Y + CARD_H + 80, 18, [255, 230, 150], { align: "center", bold: true, shadow: true });
    if (rects.close) {
        const [bx, by, bw, bh] = rects.close;
        R.rect(ctx, bx, by, bw, bh, [52, 52, 70], 0, 10); R.rect(ctx, bx + 1, by + 1, bw - 2, bh - 2, [150, 150, 180], 2, 10);
        R.text(ctx, cp.mode === "shop" ? "나가기" : "닫기", bx + bw / 2, by + 11, 20, [255, 255, 255], { align: "center", bold: true });
    }
}
