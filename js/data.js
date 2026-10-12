// =============================================================
// 데이터: 깃허브 문제 불러오기 / 복습 기록(SM-2) / 오답·랭킹·총 설정 저장
//   - 문제 내용은 깃허브(같은 사이트 또는 raw 주소)에서 받는다.
//   - 받은 문제는 브라우저(IndexedDB)에 저장해둬서, 인터넷이 안 될 때도 플레이할 수 있다.
//   - 복습 기록/오답 노트/랭킹/총 설정은 이 기기 브라우저(localStorage)에 저장한다.
// =============================================================
"use strict";

// ---------- localStorage (사생활 보호 모드 등에서 실패해도 게임은 계속) ----------
const Store = {
    get(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
    },
    set(key, value) {
        try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { return false; }
    },
};
const KEY_REVIEWS = "sr_review_state", KEY_WRONG = "sr_wrong_answers", KEY_SCORES = "sr_scores", KEY_GUNS = "sr_gun_settings";

// ---------- IndexedDB: 받아둔 문제 파일 보관 (용량이 커서 localStorage 대신) ----------
const ProblemCache = {
    _db: null,
    open() {
        if (this._db) return Promise.resolve(this._db);
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open("study_roguelike", 1);
                req.onupgradeneeded = () => req.result.createObjectStore("kv");
                req.onsuccess = () => { this._db = req.result; resolve(this._db); };
                req.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    },
    async get(key) {
        const db = await this.open();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const req = db.transaction("kv").objectStore("kv").get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    },
    async set(key, value) {
        const db = await this.open();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction("kv", "readwrite");
                tx.objectStore("kv").put(value, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (e) { resolve(false); }
        });
    },
};

// ---------- 문제 ----------
function defaultProblems() {
    return [
        ["피터스의 거버넌스모형에는 시장모형, 신축모형, 참여모형, 탈규제모형이 있다.", "O", "피터스는 전통적 정부모형에 대한 대안으로 시장모형, 참여모형, 신축모형, 탈규제모형 4가지를 제시했다."],
        ["행정학에서 관료제의 대표적인 특징 중 하나는 계층제(hierarchy)이다.", "O", "베버의 관료제는 계층제, 문서주의, 전문화 등을 특징으로 한다."],
        ["민주주의의 꽃이라고 불리는 제도는 국민투표(referendum)이다.", "X", "흔히 '민주주의의 꽃'은 선거라고 부른다."],
    ].map((p, i) => ({ id: "sample_" + i, question: p[0], correct: p[1], explanation: p[2] }));
}

function validProblemFile(data) {
    return data && typeof data === "object" && Array.isArray(data.problems) &&
        (data.images === undefined || (data.images && typeof data.images === "object"));
}
function safeProblemFileName(name) {
    return (typeof name === "string" && /^problems_\d+\.json$/.test(name)) ? name : null;
}

// 받아온 파일들 -> 게임에서 쓰는 문제 목록 (이미지 id를 실제 이미지 데이터로 연결)
function buildProblems(files, order) {
    const out = [];
    for (const name of order) {
        const data = files[name];
        if (!validProblemFile(data)) continue;
        const images = data.images || {};
        for (const p of data.problems) {
            if (!p || typeof p !== "object" || (p.correct !== "O" && p.correct !== "X") || !p.id) continue;
            const item = { id: p.id, question: p.question || "", correct: p.correct, explanation: p.explanation || "" };
            if (p.question_image && images[p.question_image]) item._qimg = images[p.question_image];
            if (p.explanation_image && images[p.explanation_image]) item._eimg = images[p.explanation_image];
            out.push(item);
        }
    }
    return out;
}

function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    // no-cache: 브라우저가 가진 사본이 최신인지 매번 서버에 확인 (바뀐 게 없으면 다시 받지 않음)
    return fetch(url, { cache: "no-cache", signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// 문제를 받아올 주소 후보: 깃허브 Pages로 열었으면 같은 사이트, 아니면 raw 주소
function problemBaseUrls() {
    const bases = [];
    if (location.protocol === "http:" || location.protocol === "https:") bases.push(new URL("./", location.href).href);
    bases.push(GITHUB_RAW_BASE);
    return bases;
}

const Problems = {
    list: null,        // 현재 쓰는 문제 목록
    source: "",        // 어디서 왔는지 설명

    // 깃허브에서 최신 문제를 받는다. 실패하면 브라우저에 저장된 문제 -> 기본 예시 순으로 쓴다.
    async sync(onProgress) {
        let lastError = "";
        for (const base of problemBaseUrls()) {
            try {
                onProgress && onProgress("문제 목록 확인 중...");
                const res = await fetchWithTimeout(base + "index.json", 10000);
                if (!res.ok) throw new Error("index.json " + res.status);
                const index = await res.json();
                const names = (index.files || []).map(e => safeProblemFileName(e && e.name));
                if (!names.length || names.includes(null)) throw new Error("index.json 형식 오류");
                const files = {};
                for (let i = 0; i < names.length; i++) {
                    onProgress && onProgress(`문제 받는 중... (${i + 1}/${names.length})`);
                    const r = await fetchWithTimeout(base + names[i], 120000);
                    if (!r.ok) throw new Error(names[i] + " " + r.status);
                    const data = await r.json();
                    if (!validProblemFile(data)) throw new Error(names[i] + " 형식 오류");
                    files[names[i]] = data;
                }
                const list = buildProblems(files, names);
                if (!list.length) throw new Error("문제가 0개");
                this.list = list;
                this.source = "github";
                await ProblemCache.set("problems", { index, names, files, savedAt: Date.now() });
                const gunNote = await syncGunSettings(base);
                return { ok: true, message: `깃허브에서 최신 문제를 받았습니다 (문제 ${list.length}개)${gunNote}` };
            } catch (e) {
                lastError = (e && e.name === "AbortError") ? "시간 초과" : String(e && e.message || e);
            }
        }
        // 실패: 저장본 사용
        const cached = await ProblemCache.get("problems");
        if (cached && cached.files) {
            this.list = buildProblems(cached.files, cached.names || Object.keys(cached.files));
            this.source = "cache";
            if (this.list.length) {
                return { ok: false, message: `깃허브에 연결하지 못해 저장된 문제 ${this.list.length}개로 플레이합니다 (${lastError})` };
            }
        }
        this.list = defaultProblems();
        this.source = "default";
        return { ok: false, message: `깃허브에 연결하지 못했습니다 (${lastError}) - 기본 예시 문제로 플레이합니다` };
    },

    // 게임에서 쓸 문제 목록 + 각 문제의 내 복습 기록
    loadWithReviews() {
        const list = this.list || defaultProblems();
        const reviews = Store.get(KEY_REVIEWS, {}) || {};
        let repaired = false;
        for (const p of list) {
            const r = reviews[p.id];
            if (r && typeof r === "object") {
                const [fixedState, fixed] = sanitizeReviewState(r);
                p.review = fixedState;
                repaired = repaired || fixed;
            } else {
                p.review = defaultReviewState();
            }
        }
        if (repaired) saveReviewState(list);
        return list;
    },

    summary() {
        const n = (this.list || []).length;
        if (this.source === "github") return `깃허브 문제 ${n}개`;
        if (this.source === "cache") return `저장된 문제 ${n}개`;
        return "기본 예시 문제 사용 중";
    },
};

function saveReviewState(problems) {
    const reviews = Store.get(KEY_REVIEWS, {}) || {};
    for (const p of problems) {
        if (p && p.id && p.review) reviews[p.id] = p.review;
    }
    Store.set(KEY_REVIEWS, reviews);
}

function saveWrongAnswer(problem) {
    const list = Store.get(KEY_WRONG, []) || [];
    list.push({ id: problem.id, question: problem.question, correct: problem.correct,
                explanation: problem.explanation, date: todayISO() });
    while (list.length > 1000) list.shift();
    Store.set(KEY_WRONG, list);
}

function loadScores() {
    const s = Store.get(KEY_SCORES, []);
    return Array.isArray(s) ? s : [];
}
function saveScoreEntry(name, score, stage, kills) {
    const scores = loadScores();
    scores.push({ name: ((name || "Player").trim().slice(0, 12)) || "Player", score, stage, kills, date: todayISO() });
    scores.sort((a, b) => (b.score || 0) - (a.score || 0));
    const top = scores.slice(0, MAX_SCORE_ENTRIES);
    Store.set(KEY_SCORES, top);
    return top;
}

// =============================================================
// SM-2 간격반복 (Python 버전과 같은 공식/규칙)
// =============================================================
function classifyAnswerSpeed(sec) {
    if (sec < ANSWER_TIME_EASY_MAX_SEC) return "easy";
    if (sec < ANSWER_TIME_NORMAL_MAX_SEC) return "normal";
    return "hard";
}
const SM2_QUALITY = { "true_easy": 5, "true_normal": 4, "true_hard": 3, "false_hard": 2, "false_normal": 1, "false_easy": 0 };
function computeSm2Quality(isCorrect, sec) {
    const tier = classifyAnswerSpeed(sec);
    return [SM2_QUALITY[`${!!isCorrect}_${tier}`], tier];
}
function parseDate(text) {
    if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [y, m, d] = text.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
}
function addDays(date, days) { const d = new Date(date.getTime()); d.setDate(d.getDate() + days); return d; }
function dayDiff(a, b) {   // a - b (일)
    return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
}
function todayDate() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }

function defaultReviewState(today) {
    today = today || todayDate();
    return { ef: SM2_DEFAULT_EF, interval: 0, repetitions: 0, due: todayISO(today), last_reviewed: null };
}

// 이상한 값(너무 큰 간격 등)을 정상 범위로 고친다 -> [고친 기록, 고쳤는지]
function sanitizeReviewState(r, today) {
    today = today || todayDate();
    if (!r || typeof r !== "object") return [defaultReviewState(today), true];
    let fixed = false;
    function num(key, dflt, lo, hi, isInt) {
        let v = r[key];
        let v2 = Number(v);
        if (v === null || v === undefined || !isFinite(v2)) v2 = dflt;
        if (isInt) v2 = Math.trunc(v2);
        v2 = clamp(v2, lo, hi);
        if (v2 !== v) fixed = true;
        return v2;
    }
    const ef = num("ef", SM2_DEFAULT_EF, SM2_MIN_EF, SM2_MAX_EF, false);
    const interval = num("interval", 0, 0, SM2_MAX_INTERVAL_DAYS, true);
    const reps = num("repetitions", 0, 0, 1e6, true);
    const last = parseDate(r.last_reviewed);
    let due = parseDate(r.due);
    const latestOk = addDays(today, SM2_MAX_INTERVAL_DAYS);
    if (!due || due > latestOk) {
        const base = (last && last <= today) ? last : today;
        due = addDays(base, interval);
        if (due > latestOk) due = latestOk;
        fixed = true;
    }
    return [{ ef: Math.round(ef * 10000) / 10000, interval, repetitions: reps, due: todayISO(due),
              last_reviewed: last ? todayISO(last) : null }, fixed];
}

function applySm2Review(state, quality, today) {
    today = today || todayDate();
    state = sanitizeReviewState(state, today)[0];
    const due = parseDate(state.due);
    if (quality >= 3 && due && today < due && state.repetitions > 0) {
        return Object.assign({}, state, { last_reviewed: todayISO(today), early: true });
    }
    let newEf = state.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEf = clamp(newEf, SM2_MIN_EF, SM2_MAX_EF);
    let reps, interval;
    if (quality < 3) { reps = 0; interval = 1; }
    else {
        reps = state.repetitions + 1;
        if (reps === 1) interval = 1;
        else if (reps === 2) interval = 6;
        else interval = Math.max(1, pyRound(state.interval * newEf));
    }
    interval = Math.min(SM2_MAX_INTERVAL_DAYS, interval);
    return { ef: Math.round(newEf * 10000) / 10000, interval, repetitions: reps,
             due: todayISO(addDays(today, interval)), last_reviewed: todayISO(today) };
}

// 오늘 복습할 문제(기한이 된 문제)를 먼저, 다 떨어지면 전체에서 랜덤("연습" - 복습 일정에 반영 안 함)
function pickQuizQuestions(problems, count, today) {
    if (!problems.length) return [[], []];
    today = today || todayDate();
    const overdue = p => {
        const d = p.review ? parseDate(p.review.due) : null;
        return d ? dayDiff(today, d) : 1e9;     // 기록 없음 = 가장 많이 밀린 것으로
    };
    const due = shuffle(problems.filter(p => overdue(p) >= 0));
    due.sort((a, b) => overdue(b) - overdue(a));
    const picked = due.slice(0, count).map(p => [p, true]);
    if (picked.length < count) {
        const chosen = new Set(picked.map(x => x[0]));
        const pool = problems.filter(p => !chosen.has(p));
        sample(pool, Math.min(count - picked.length, pool.length)).forEach(p => picked.push([p, false]));
        while (picked.length < count) picked.push([choice(problems), false]);
    }
    shuffle(picked);
    return [picked.map(x => x[0]), picked.map(x => x[1])];
}

// =============================================================
// 총 성능 설정 (화면 값: % / 바람은 마릿수)
// =============================================================
function toDisplay(v, isCount) {
    if (isCount) return Math.trunc(v);
    const r = Math.round(v * 10000) / 100;   // 소수 둘째 자리까지 (자연 0.15% 등)
    return r;
}
function currentGunSettings() {
    const effects = {};
    GUN_ELEMENT_ORDER.forEach(el => { effects[el] = GUN_ELEMENTS[el][2].map(x => toDisplay(x, GUN_SETTING_INFO[el][3])); });
    return { effects, atk_bonus: GUN_GRADES.map(g => toDisplay(g[5], false)), nature_basis: "max_hp" };
}
function defaultGunSettings() {
    const effects = {};
    GUN_ELEMENT_ORDER.forEach(el => { effects[el] = DEFAULT_GUN_EFFECTS[el].map(x => toDisplay(x, GUN_SETTING_INFO[el][3])); });
    return { effects, atk_bonus: DEFAULT_GRADE_ATK_BONUS.map(x => toDisplay(x, false)), nature_basis: "max_hp" };
}
function validateGunSettings(data) {
    const errors = [];
    const gradeNames = GUN_GRADES.map(g => g[1]);
    const effects = {};
    const rawEffects = (data && data.effects) || {};
    const dflt = defaultGunSettings();
    function parse(v) {
        const s = String(v).trim().replace(/%$/, "");
        if (s === "") return NaN;
        return Number(s);
    }
    for (const el of GUN_ELEMENT_ORDER) {
        const [, lo, hi, isCount] = GUN_SETTING_INFO[el];
        const name = GUN_ELEMENTS[el][0];
        const values = rawEffects[el] !== undefined ? rawEffects[el] : dflt.effects[el];
        if (!Array.isArray(values) || values.length !== GUN_GRADES.length) { errors.push(`${name}: 값이 5개 필요합니다`); continue; }
        const out = [];
        values.forEach((v, i) => {
            const num = parse(v);
            if (!isFinite(num)) { errors.push(`${name} ${gradeNames[i]}: '${v}'는 숫자가 아닙니다`); return; }
            if (num < lo || num > hi) { errors.push(`${name} ${gradeNames[i]}: ${lo}~${hi} 사이로 입력하세요`); return; }
            if (isCount && num !== Math.trunc(num)) { errors.push(`${name} ${gradeNames[i]}: 마릿수는 정수로 입력하세요`); return; }
            out.push(isCount ? Math.trunc(num) : num / 100);
        });
        effects[el] = out;
    }
    const rawAtk = (data && data.atk_bonus) || dflt.atk_bonus;
    const atk = [];
    if (!Array.isArray(rawAtk) || rawAtk.length !== GUN_GRADES.length) errors.push("등급별 공격력 보너스: 값이 5개 필요합니다");
    else rawAtk.forEach((v, i) => {
        const num = parse(v);
        if (!isFinite(num)) { errors.push(`공격력 보너스 ${gradeNames[i]}: '${v}'는 숫자가 아닙니다`); return; }
        if (num < GRADE_ATK_LIMITS[0] || num > GRADE_ATK_LIMITS[1]) { errors.push(`공격력 보너스 ${gradeNames[i]}: 0~500 사이로 입력하세요`); return; }
        atk.push(num / 100);
    });
    if (errors.length) return [null, errors];
    return [{ effects, atk_bonus: atk }, []];
}
function applyGunSettings(internal) {
    for (const el of Object.keys(internal.effects)) GUN_ELEMENTS[el][2] = internal.effects[el].slice();
    internal.atk_bonus.forEach((b, i) => { GUN_GRADES[i][5] = b; });
}
function saveGunSettings(display) {
    const [internal, errors] = validateGunSettings(display);
    if (errors.length) return [false, errors];
    applyGunSettings(internal);
    if (!Store.set(KEY_GUNS, currentGunSettings())) return [false, ["브라우저에 저장하지 못했습니다 (이번 실행 동안만 적용됨)"]];
    return [true, []];
}
// 문제 편집기에서 올린 총 설정(gun_settings.json)을 받아 적용하고, 이 기기에 저장해둔다.
// 깃허브에 아직 설정 파일이 없으면 이 기기에 있던 설정을 그대로 쓴다.
const GunSource = { from: "default" };     // "github" / "local" / "default"
async function syncGunSettings(base) {
    let data;
    try {
        const res = await fetchWithTimeout(base + "gun_settings.json", 10000);
        if (res.status === 404) return "";
        if (!res.ok) return " · 총 설정은 저장된 값 사용";
        data = await res.json();
    } catch (e) { return " · 총 설정은 저장된 값 사용"; }
    if (!data || typeof data !== "object") return " · 총 설정 파일 오류(저장된 값 사용)";
    if (data.nature_basis !== "max_hp") { data.effects = data.effects || {}; data.effects.nature = defaultGunSettings().effects.nature; }
    const [internal, errors] = validateGunSettings(data);
    if (errors.length) return " · 총 설정 파일 오류(저장된 값 사용)";
    applyGunSettings(internal);
    Store.set(KEY_GUNS, Object.assign(currentGunSettings(), { from_github: true }));
    GunSource.from = "github";
    return " · 총 설정 적용";
}

function loadGunSettings() {
    const data = Store.get(KEY_GUNS, null);
    if (!data) return false;
    // 예전 설정의 자연 값(가한 피해의 %)은 의미가 달라졌으므로 새 기본값으로 바꾼다
    let migrated = false;
    if (typeof data === "object" && data.nature_basis !== "max_hp") {
        data.effects = data.effects || {};
        data.effects.nature = defaultGunSettings().effects.nature;
        migrated = true;
    }
    const [internal, errors] = validateGunSettings(data);
    if (errors.length) return false;
    applyGunSettings(internal);
    GunSource.from = data.from_github ? "github" : "local";
    if (migrated) Store.set(KEY_GUNS, Object.assign(currentGunSettings(), { from_github: !!data.from_github }));
    return true;
}
