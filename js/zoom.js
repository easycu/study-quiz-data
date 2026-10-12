// =============================================================
// 이미지 크게 보기 (문제/해설 이미지)
//   - 화면 가득 맞춰서 보여주고, 두 손가락으로 벌리면 더 확대 / 한 손가락으로 끌면 이동
//   - 두 번 톡: 2.5배 확대 <-> 원래대로,  컴퓨터: 마우스 휠로 확대, 끌어서 이동
//   - 닫기: ✕ 버튼, Esc / Enter / Z 키
// =============================================================
"use strict";

const ZoomView = {
    isOpen: false,
    onClose: null,
    _img: null, _stage: null,
    _fit: 1, _z: 1, _x: 0, _y: 0,          // 화면 맞춤 배율, 추가 확대 배율, 이미지 왼쪽 위 위치(px)
    _ptrs: new Map(), _lastTap: null, _moved: 0,

    init() {
        this._view = document.getElementById("zoomView");
        this._stage = document.getElementById("zoomStage");
        this._img = document.getElementById("zoomImg");
        this._img.style.left = "0px"; this._img.style.top = "0px";
        document.getElementById("zoomClose").addEventListener("click", e => { e.stopPropagation(); this.close(); });
        const st = this._stage;
        st.addEventListener("pointerdown", e => this._down(e));
        st.addEventListener("pointermove", e => this._move(e));
        st.addEventListener("pointerup", e => this._up(e));
        st.addEventListener("pointercancel", e => this._up(e));
        st.addEventListener("wheel", e => {
            e.preventDefault();
            this._zoomAt(e.clientX, e.clientY, this._z * Math.exp(-e.deltaY * 0.0015));
        }, { passive: false });
        ["touchstart", "touchmove", "touchend"].forEach(t =>
            st.addEventListener(t, e => e.preventDefault(), { passive: false }));
        // 열려 있는 동안 키보드는 게임에 넘기지 않는다
        window.addEventListener("keydown", e => {
            if (!this.isOpen) return;
            e.preventDefault(); e.stopImmediatePropagation();
            if (["Escape", "Enter", "NumpadEnter", "Space", "KeyZ"].includes(e.code)) this.close();
        }, true);
        window.addEventListener("resize", () => { if (this.isOpen) this._reset(); });
    },

    open(src, onClose) {
        if (!src) return;
        if (!this._img) this.init();
        this.onClose = onClose || null;
        this.isOpen = true;
        this._view.classList.remove("hidden");
        this._ptrs.clear();
        const img = this._img;
        img.onload = () => this._reset();
        img.src = src;
        if (img.complete && img.naturalWidth) this._reset();
    },
    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this._view.classList.add("hidden");
        this._ptrs.clear();
        const cb = this.onClose; this.onClose = null;
        if (cb) cb();
    },

    _reset() {
        const img = this._img, vw = this._stage.clientWidth, vh = this._stage.clientHeight;
        if (!img.naturalWidth) return;
        img.style.width = img.naturalWidth + "px"; img.style.height = img.naturalHeight + "px";
        // 화면에 꽉 차게 (작은 이미지는 최대 4배까지 키움)
        this._fit = Math.min((vw * 0.96) / img.naturalWidth, (vh * 0.86) / img.naturalHeight, 4);
        this._z = 1;
        this._x = (vw - img.naturalWidth * this._fit) / 2;
        this._y = (vh - img.naturalHeight * this._fit) / 2;
        this._apply();
    },
    _apply() {
        const img = this._img, vw = this._stage.clientWidth, vh = this._stage.clientHeight;
        const s = this._fit * this._z, w = img.naturalWidth * s, h = img.naturalHeight * s;
        // 화면보다 작으면 가운데, 크면 빈 곳이 안 생기게 이동 범위 제한
        this._x = w <= vw ? (vw - w) / 2 : clamp(this._x, vw - w, 0);
        this._y = h <= vh ? (vh - h) / 2 : clamp(this._y, vh - h, 0);
        img.style.transform = `translate(${this._x}px, ${this._y}px) scale(${s})`;
    },
    _local(cx, cy) { const r = this._stage.getBoundingClientRect(); return [cx - r.left, cy - r.top]; },
    _zoomAt(cx, cy, newZ) {
        newZ = clamp(newZ, 1, 6);
        const [px, py] = this._local(cx, cy), k = newZ / this._z;
        this._x = px - (px - this._x) * k;
        this._y = py - (py - this._y) * k;
        this._z = newZ;
        this._apply();
    },

    _down(e) {
        e.preventDefault();
        try { this._stage.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
        this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._ptrs.size === 1) this._moved = 0;
    },
    _move(e) {
        const p = this._ptrs.get(e.pointerId);
        if (!p) return;
        e.preventDefault();
        if (this._ptrs.size === 1) {
            this._x += e.clientX - p.x; this._y += e.clientY - p.y;
            this._moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
            p.x = e.clientX; p.y = e.clientY;
            this._apply();
            return;
        }
        // 두 손가락: 벌린 만큼 확대 + 가운데가 움직인 만큼 이동
        const [a, b] = [...this._ptrs.values()];
        const oldD = hypot(a.x - b.x, a.y - b.y), oldMx = (a.x + b.x) / 2, oldMy = (a.y + b.y) / 2;
        p.x = e.clientX; p.y = e.clientY;
        const [a2, b2] = [...this._ptrs.values()];
        const newD = hypot(a2.x - b2.x, a2.y - b2.y), mx = (a2.x + b2.x) / 2, my = (a2.y + b2.y) / 2;
        this._moved += 100;
        this._x += mx - oldMx; this._y += my - oldMy;
        if (oldD > 0) this._zoomAt(mx, my, this._z * newD / oldD); else this._apply();
    },
    _up(e) {
        if (!this._ptrs.has(e.pointerId)) return;
        this._ptrs.delete(e.pointerId);
        if (this._ptrs.size > 0 || this._moved > 10) return;
        // 두 번 톡: 확대 <-> 원래대로
        const now = performance.now(), last = this._lastTap;
        if (last && now - last.t < 350 && hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
            this._lastTap = null;
            if (this._z > 1.05) { this._z = 1; this._apply(); }
            else this._zoomAt(e.clientX, e.clientY, 2.5);
        } else {
            this._lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
    },
};
