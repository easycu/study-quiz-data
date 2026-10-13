// =============================================================
// 소리: 효과음(Web Audio) + 배경음악(audio 태그)
//   - 휴대폰 브라우저는 화면을 한 번 눌러야 소리를 낼 수 있어서, 첫 터치/키 입력 때 켠다
//   - 같은 소리가 너무 자주 겹치지 않게 최소 간격(gap)을 둔다
// =============================================================
"use strict";

const Sound = {
    ctx: null, master: null, buffers: {}, last: {}, unlocked: false, loading: false,
    music: null, musicName: null, musicEls: {}, duck: 1,

    init() {
        const unlock = () => {
            if (this.unlocked) return;
            this.unlocked = true;
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) {
                    this.ctx = new AC();
                    this.master = this.ctx.createGain();
                    this.master.connect(this.ctx.destination);
                    this.applyVolume();
                    if (this.ctx.state === "suspended") this.ctx.resume();
                    this.loadAll();
                }
            } catch (e) { this.ctx = null; }
            if (this.wantMusic) this.playMusic(this.wantMusic, true);
        };
        for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, unlock, { capture: true });
        // 다른 앱으로 갔다 오면 다시 깨우기
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) { if (this.music) this.music.pause(); }
            else {
                if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
                if (this.music && Opts.data.music) this.music.play().catch(() => {});
            }
        });
    },
    async loadAll() {
        if (this.loading || !this.ctx) return;
        this.loading = true;
        await Promise.all(ASSET_META.sfx.map(async name => {
            try {
                const res = await fetch(`assets/sfx/${name}.mp3`);
                const data = await res.arrayBuffer();
                this.buffers[name] = await new Promise((ok, bad) => this.ctx.decodeAudioData(data, ok, bad));
            } catch (e) { /* 소리 하나 없어도 게임은 계속 */ }
        }));
    },
    applyVolume() {
        if (this.master) this.master.gain.value = Opts.data.sfx ? Opts.data.sfxVol : 0;
        for (const el of Object.values(this.musicEls)) if (el === this.music) this._setVol(el, Opts.data.music ? Opts.data.musicVol * this.duck : 0);
    },
    // name: 효과음 이름 / o.vol 크기, o.gap 같은 소리 최소 간격(ms), o.rate 재생 속도, o.jitter 속도 흔들기
    play(name, o) {
        if (!this.ctx || !Opts.data.sfx) return;
        const buf = this.buffers[name];
        if (!buf) return;
        o = o || {};
        const t = performance.now(), gap = o.gap === undefined ? 45 : o.gap;
        if (t - (this.last[name] || 0) < gap) return;
        this.last[name] = t;
        try {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = (o.rate || 1) * (1 + uniform(-1, 1) * (o.jitter === undefined ? 0.06 : o.jitter));
            const g = this.ctx.createGain();
            g.gain.value = o.vol === undefined ? 0.6 : o.vol;
            src.connect(g); g.connect(this.master);
            src.start();
        } catch (e) { /* 무시 */ }
    },
    // 배경음악: "menu" / "battle" / "boss" / null(끄기)
    playMusic(name, force) {
        this.wantMusic = name;
        if (!this.unlocked) return;
        if (this.musicName === name && !force) return;
        const prev = this.music;
        this.musicName = name;
        if (prev) { const p = prev; this._fade(p, 0, 400, () => p.pause()); }
        if (!name) { this.music = null; return; }
        let el = this.musicEls[name];
        if (!el) {
            el = new Audio(`assets/music/${name}.mp3`);
            el.loop = true; el.preload = "auto";
            // 아이폰은 audio 태그 볼륨을 못 바꿔서, Web Audio를 거쳐 크기를 조절한다
            if (this.ctx) {
                try {
                    el._gain = this.ctx.createGain(); el._gain.gain.value = 0;
                    this.ctx.createMediaElementSource(el).connect(el._gain);
                    el._gain.connect(this.ctx.destination);
                } catch (e) { el._gain = null; }
            }
            this.musicEls[name] = el;
        }
        this.music = el;
        this._setVol(el, 0);
        if (Opts.data.music) {
            el.currentTime = 0;
            el.play().catch(() => {});
            this._fade(el, Opts.data.musicVol * this.duck, 600);
        }
    },
    setDuck(k) {       // 문제 풀 때는 음악을 작게
        if (Math.abs(this.duck - k) < 0.01) return;
        this.duck = k;
        if (this.music && Opts.data.music) this._fade(this.music, Opts.data.musicVol * k, 300);
    },
    musicToggled() {
        if (!this.music) { if (Opts.data.music && this.wantMusic) this.playMusic(this.wantMusic, true); return; }
        if (Opts.data.music) { this.music.play().catch(() => {}); this._fade(this.music, Opts.data.musicVol * this.duck, 300); }
        else this._fade(this.music, 0, 200, () => this.music && this.music.pause());
    },
    _getVol(el) { return el._gain ? el._gain.gain.value : el.volume; },
    _setVol(el, v) {
        v = clamp(v, 0, 1);
        if (el._gain) { el._gain.gain.value = v; el.volume = 1; }
        else { try { el.volume = v; } catch (e) { /* 무시 */ } }
    },
    _fade(el, to, ms, done) {
        const from = this._getVol(el), start = performance.now();
        clearInterval(el._fadeT);
        el._fadeT = setInterval(() => {
            const k = Math.min(1, (performance.now() - start) / ms);
            this._setVol(el, from + (to - from) * k);
            if (k >= 1) { clearInterval(el._fadeT); if (done) done(); }
        }, 30);
    },
};
