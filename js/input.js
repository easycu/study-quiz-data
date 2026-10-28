// =============================================================
// 입력: 키보드(방향키/WASD) + 가상 조이패드(마우스 또는 터치로 끌기)
//   - 화면 아무 곳이나 누르고 끌면, 누른 자리에 조이패드가 생긴다.
//   - 컴퓨터에서는 마우스로 누르고 끌어도 똑같이 동작한다.
//   - 키보드를 누르고 있으면 키보드가 우선이다.
//   - 문제 풀이 화면에서는 누른 위치를 "터치(클릭)"로 게임에 전달한다.
// =============================================================
"use strict";

const JOY_RADIUS = 60;         // 조이패드 바깥 원 반지름 (화면 픽셀)
const JOY_DEADZONE = 0.12;     // 이만큼 이하로 살짝 움직이면 무시
const JOY_FULL_AT = 0.7;       // 반지름의 70%만 밀어도 최고 속도

const Input = {
    canvas: null,
    keys: new Set(),
    lastType: ((typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) || "ontouchstart" in window) && matchMedia("(pointer: coarse)").matches ? "touch" : "mouse",
    joy: null,                   // { id, baseX, baseY, x, y } (화면 픽셀)
    view: { scale: 1, offX: 0, offY: 0, dpr: 1 },
    handler: null,               // { wantsTaps(), onTap(x, y), onKey(key, e) }

    init(canvas) {
        this.canvas = canvas;
        canvas.addEventListener("pointerdown", e => this._down(e), { passive: false });
        canvas.addEventListener("pointermove", e => this._move(e), { passive: false });
        canvas.addEventListener("pointerup", e => this._up(e));
        canvas.addEventListener("pointercancel", e => this._up(e));
        canvas.addEventListener("lostpointercapture", e => this._up(e));
        canvas.addEventListener("contextmenu", e => e.preventDefault());
        // iOS: 두 번 톡 확대 / 길게 눌러 돋보기 / 화면 끌림 방지
        canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
        canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
        canvas.addEventListener("touchend", e => e.preventDefault(), { passive: false });

        window.addEventListener("keydown", e => this._keyDown(e));
        window.addEventListener("keyup", e => this.keys.delete(e.code));
        window.addEventListener("blur", () => { this.keys.clear(); this.joy = null; });
    },

    // 화면 픽셀 -> 게임 좌표(900x650)
    toGame(clientX, clientY) {
        const r = this.canvas.getBoundingClientRect();
        const v = this.view;
        return [(clientX - r.left - v.offX) / v.scale, (clientY - r.top - v.offY) / v.scale];
    },
    _client(e) {
        const r = this.canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    },

    _down(e) {
        e.preventDefault();
        this.lastType = e.pointerType === "touch" || e.pointerType === "pen" ? "touch" : "mouse";
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const h = this.handler;
        if (h && h.wantsTaps()) {
            const [gx, gy] = this.toGame(e.clientX, e.clientY);
            h.onTap(gx, gy, this.lastType);
            return;
        }
        // 대시 버튼 (조이패드를 쓰는 중에도 다른 손가락으로 누를 수 있음)
        if (h && h.dashHit) {
            const [gx, gy] = this.toGame(e.clientX, e.clientY);
            if (h.dashHit(gx, gy)) { h.onDash(); return; }
        }
        if (this.joy) return;     // 이미 다른 손가락이 조이패드를 쓰는 중
        const [cx, cy] = this._client(e);
        this.joy = { id: e.pointerId, baseX: cx, baseY: cy, x: cx, y: cy };
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    },
    _move(e) {
        if (!this.joy || e.pointerId !== this.joy.id) return;
        e.preventDefault();
        const [cx, cy] = this._client(e);
        this.joy.x = cx; this.joy.y = cy;
    },
    _up(e) {
        if (this.joy && e.pointerId === this.joy.id) this.joy = null;
    },
    releaseJoystick() { this.joy = null; },

    _keyDown(e) {
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;   // 이름 입력칸 등에서는 게임 키로 쓰지 않음
        const gameKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "NumpadEnter", "ShiftLeft", "ShiftRight"];
        if (gameKeys.includes(e.code)) e.preventDefault();   // 화면 스크롤 방지
        this.lastType = "keyboard";
        this.keys.add(e.code);
        if (this.handler && !e.repeat) this.handler.onKey(e.code, e);
    },

    // 이번 프레임 이동 방향: [dx, dy] (길이 0~1)
    moveVector() {
        const k = this.keys;
        let dx = 0, dy = 0;
        if (k.has("KeyW") || k.has("ArrowUp")) dy -= 1;
        if (k.has("KeyS") || k.has("ArrowDown")) dy += 1;
        if (k.has("KeyA") || k.has("ArrowLeft")) dx -= 1;
        if (k.has("KeyD") || k.has("ArrowRight")) dx += 1;
        if (dx || dy) { const l = hypot(dx, dy); return [dx / l, dy / l]; }
        const j = this.joy;
        if (!j) return [0, 0];
        const ox = j.x - j.baseX, oy = j.y - j.baseY, d = hypot(ox, oy);
        const norm = d / JOY_RADIUS;
        if (norm < JOY_DEADZONE) return [0, 0];
        const mag = Math.min(1, (norm - JOY_DEADZONE) / (JOY_FULL_AT - JOY_DEADZONE));
        return [ox / d * mag, oy / d * mag];
    },

    // 조이패드 그리기 (화면 픽셀 좌표, ctx는 dpr만 적용된 상태)
    drawJoystick(ctx) {
        const j = this.joy;
        if (!j) return;
        const ox = j.x - j.baseX, oy = j.y - j.baseY, d = hypot(ox, oy);
        const k = d > JOY_RADIUS ? JOY_RADIUS / d : 1;
        ctx.save();
        ctx.beginPath(); ctx.arc(j.baseX, j.baseY, JOY_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.stroke();
        ctx.beginPath(); ctx.arc(j.baseX + ox * k, j.baseY + oy * k, JOY_RADIUS * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fill();
        ctx.restore();
    },
};
