// =============================================================
// STUDY ROGUELIKE (웹 버전) - 설정값 / 공용 도구
// Python 버전(study_roguelike.py)의 수치를 그대로 옮겼다.
// =============================================================
"use strict";

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/easycu/study-quiz-data/main/";

const SCREEN_W = 900, SCREEN_H = 650;
const FPS = 60;
const FRAME_MS = 1000 / FPS;
const PLAY_LEFT = 30, PLAY_RIGHT = SCREEN_W - 30, PLAY_TOP = 100, PLAY_BOTTOM = SCREEN_H - 40;

const SCORE_PER_KILL = 10, SCORE_PER_ELITE_KILL = 30, SCORE_PER_STAGE_CLEAR = 200;
const MAX_SCORE_ENTRIES = 50;
const QUESTIONS_PER_ROOM = 5;

const MIN_MONSTERS_PER_ROOM = 4, MAX_MONSTERS_PER_ROOM = 8;
const MONSTER_COUNT_STAGE_STEP = 3, MONSTER_COUNT_MIN_CAP = 7, MONSTER_COUNT_MAX_CAP = 12;
const MONSTER_COUNT_MULT = 0.7;
const MONSTER_HP_MULT = 1.1;
const MIN_MONSTER_SPAWN_DIST = 190, MONSTER_SPAWN_MAX_TRIES = 30;

const ELITE_SPAWN_CHANCE = 0.15, ELITE_HP_MULT = 1.8, ELITE_DMG_MULT = 1.4, ELITE_RADIUS_MULT = 1.25, ELITE_KILL_HEAL = 10;

const OBSTACLE_MIN_RADIUS = 16, OBSTACLE_MAX_RADIUS = 34;
const OBSTACLE_COLOR = [90, 85, 80];
const OBSTACLE_GAP = 56, OBSTACLE_PLAYER_CLEAR = 140, OBSTACLE_DOOR_CLEAR = 110;
const MONSTER_WALL_SLIDE = 1.3;
const OBSTACLE_LAYOUT_WEIGHTS = { pillars: 18, crates: 14, walls: 14, corners: 10, symmetric: 12, rubble: 10, cross: 6, mixed: 12, open: 4 };

const HIT_FLASH_MS = 100, KNOCKBACK_MONSTER_DIST = 10, KNOCKBACK_PLAYER_DIST = 14;
const SCREEN_SHAKE_HIT = 4, SCREEN_SHAKE_BOSS_DASH = 7, SCREEN_SHAKE_DURATION_MS = 160;
const DAMAGE_POPUP_LIFETIME_MS = 650, PARTICLE_LIFETIME_MS = 450, DEATH_PARTICLE_COUNT = 10;
const CRIT_CHANCE = 0.12, CRIT_MULTIPLIER = 2.0, COMBO_WINDOW_MS = 1200;

const BOSS_ENRAGE_HP_RATIO = 0.3, BOSS_ENRAGE_SPEED_MULT = 1.25, BOSS_ENRAGE_DASH_SPEED_MULT = 1.3, BOSS_ENRAGE_COOLDOWN_MULT = 0.6;
const BOSS_ENRAGE_COLOR = [255, 60, 30];
const TOUCH_DAMAGE_COOLDOWN = 700, PLAYER_INVULN_MS = 450, ROOM_ENTER_GRACE_MS = 1000;

const PLAYER_HP_GROWTH_PER_CORRECT = 2.19, PLAYER_ATK_GROWTH_PER_CORRECT = 0.276;
const PLAYER_ATTACK_SPEED_GROWTH_PER_CORRECT = 0.0222, PLAYER_MOVE_SPEED_GROWTH_PER_CORRECT = 0.021;
const PLAYER_MOVE_SPEED_CAP = 16.0;
const PERFECT_QUIZ_HEAL_RATIO = 0.10, WRONG_ANSWER_DAMAGE_RATIO = 0.05;

// ---- 몬스터 ----
const MELEE_BASE_HP = 20, MELEE_DASH_BASE_HP = 17, RANGED_BASE_HP = 14, BOSS_BASE_HP = 242;
const MELEE_BASE_TOUCH_DMG = 10, MELEE_DASH_TOUCH_DMG = 17, RANGED_BASE_TOUCH_DMG = 8;
const RANGED_SINGLE_BULLET_DMG = 11, RANGED_SPREAD_BULLET_DMG = 8, RANGED_DOUBLE_BULLET_DMG = 9;
const BOSS_BASE_TOUCH_DMG = 22, BOSS_BASE_BULLET_DMG = 14;
const STAGE_HP_GROWTH_LINEAR = 0.95, STAGE_HP_GROWTH_QUAD = 0.0625;
const STAGE_DMG_GROWTH_LINEAR = 0.135, STAGE_DMG_GROWTH_QUAD = 0.009;
const STAGE_MONSTER_SPEED_GROWTH = 0.01, STAGE_MONSTER_SPEED_CAP = 1.5;
const STAGE_MONSTER_FIRE_RATE_GROWTH = 0.01, STAGE_MONSTER_FIRE_RATE_FLOOR = 0.6;
const RANGED_BULLET_SPEED = 5.5;
const MELEE_DASH_TRIGGER_RANGE = 260, MELEE_DASH_TELEGRAPH_MS = 550, MELEE_DASH_DURATION_MS = 300;
const MELEE_DASH_SPEED = 9.0, MELEE_DASH_COOLDOWN_MS = 2400;
const RANGED_SPREAD_ANGLE = 18, RANGED_DOUBLE_BURST_DELAY_MS = 150;
const BOSS_RADIUS = 34, BOSS_DASH_TRIGGER_RANGE = 300, BOSS_DASH_TELEGRAPH_MS = 700, BOSS_DASH_DURATION_MS = 380;
const BOSS_DASH_SPEED = 8.0, BOSS_DASH_COOLDOWN_MS = 3600, BOSS_SHOOT_COOLDOWN_MS = 1500;
const BOSS_SPREAD_COUNT = 3, BOSS_SPREAD_ANGLE = 20;
const EXPLODER_BASE_HP = 12, EXPLODER_TOUCH_DMG = 6, EXPLODER_BLAST_RADIUS = 70, EXPLODER_BLAST_DMG = 22;
const EXPLODER_COLOR = [255, 140, 40];
const HOMING_BASE_HP = 12, HOMING_TOUCH_DMG = 6, HOMING_BULLET_DMG = 9, HOMING_SHOOT_COOLDOWN_MS = 2100;
const HOMING_TURN_RATE = 0.05, HOMING_LIFETIME_MS = 3000, HOMING_COLOR = [90, 200, 215];
const SUMMONER_BASE_HP = 20, SUMMONER_TOUCH_DMG = 4, SUMMONER_COLOR = [90, 220, 130];
const SUMMONER_SUMMON_COOLDOWN_MS = 4200, SUMMONER_MAX_SUMMONS = 3, SUMMONER_MINION_HP_MULT = 0.5, SUMMONER_MINION_DMG_MULT = 0.6;
const BRUTE_BASE_HP = 34, BRUTE_TOUCH_DMG = 13, BRUTE_COLOR = [150, 95, 60];
const SPLITTER_BASE_HP = 16, SPLITTER_TOUCH_DMG = 7, SPLITTER_COLOR = [90, 150, 220];
const SPLITTER_CHILD_HP_MULT = 0.35, SPLITTER_CHILD_DMG_MULT = 0.6;
const BURST3_BASE_HP = 12, BURST3_BULLET_DMG = 7, BURST3_SHOOT_COOLDOWN_MS = 2500, BURST3_INTERNAL_DELAY_MS = 160;
const BURST3_COLOR = [230, 150, 60];
const MORTAR_BASE_HP = 15, MORTAR_BULLET_DMG = 16, MORTAR_SHOOT_COOLDOWN_MS = 2700;
const MORTAR_BULLET_SPEED_MULT = 0.5, MORTAR_BULLET_RADIUS = 10, MORTAR_COLOR = [210, 70, 40];
const EXPLODER_UNLOCK_STAGE = 2, HOMING_UNLOCK_STAGE = 3, SUMMONER_UNLOCK_STAGE = 4, BRUTE_UNLOCK_STAGE = 2;
const SPLITTER_UNLOCK_STAGE = 3, BURST3_UNLOCK_STAGE = 4, MORTAR_UNLOCK_STAGE = 5;
const BOSS_SWARM_UNLOCK_STAGE = 3, BOSS_SNIPER_UNLOCK_STAGE = 5, BOSS_ARTILLERY_UNLOCK_STAGE = 7, BOSS_MIRROR_UNLOCK_STAGE = 9;
const BOSS_SWARM_SUMMON_COOLDOWN_MS = 6000, BOSS_SWARM_MAX_SUMMONS = 4;
const BOSS_ARTILLERY_VOLLEY_COOLDOWN_MS = 5200, BOSS_ARTILLERY_VOLLEY_COUNT = 10;
const BOSS_MIRROR_CLONE_COOLDOWN_MS = 7000, BOSS_MIRROR_CLONE_LIFETIME_MS = 6000, BOSS_MIRROR_MAX_CLONES = 1, BOSS_MIRROR_CLONE_HP_MULT = 0.4;

// ---- 예측 이동 / 엔레이지 / 장판 / 레이저 ----
const PREDICT_MELEE_FACTOR = 0.85, PREDICT_MELEE_MAX_FRAMES = 44;
const PREDICT_DASH_FACTOR = 0.95, PREDICT_DASH_MAX_FRAMES = 34;
const PREDICT_BULLET_FACTOR = 0.9, PREDICT_BULLET_MAX_FRAMES = 75;
const PREDICT_BOSS_FACTOR = 0.95;
const PREDICT_STAGE_FULL = 4, PREDICT_EARLY_SCALE = 0.45;
const RAGE_FIRST_DELAY_MS = 11000, RAGE_STEP_MS = 5000, RAGE_MAX_STACKS = 3;
const RAGE_SPEED_PER_STACK = 0.26, RAGE_DAMAGE_PER_STACK = 0.24, RAGE_COLOR = [255, 80, 60];
const HAZARD_WARN_MS = 850, HAZARD_ACTIVE_MS = 4600, HAZARD_TICK_MS = 600, HAZARD_AIM_LEAD_MS = 420;
const HAZARD_RADIUS = 56, HAZARD_DAMAGE = 12, HAZARD_COLOR = [120, 215, 90], MAX_HAZARDS = 18;
const SPITTER_BASE_HP = 16, SPITTER_TOUCH_DMG = 6, SPITTER_SHOOT_COOLDOWN_MS = 2000, SPITTER_COLOR = [110, 195, 80];
const SPITTER_UNLOCK_STAGE = 2;
const EXPLODER_HAZARD_RADIUS = 62;
const LASER_WARN_MS = 1100, LASER_ACTIVE_MS = 2200, LASER_REST_MS = 1500, LASER_TICK_MS = 500;
const LASER_WIDTH = 18, LASER_DAMAGE = 20, LASER_ANGULAR_SPEED = 0.015, LASER_COLOR = [255, 90, 90];
const BOSS_VENOM_UNLOCK_STAGE = 4, BOSS_LASER_UNLOCK_STAGE = 6;
const BOSS_VENOM_POOL_COOLDOWN_MS = 2600, BOSS_VENOM_TRAIL_COOLDOWN_MS = 1500, BOSS_LASER_BEAM_COUNT = 2;

const MELEE_SUBTYPE_POOL = ["chase", "chase", "chase", "dash"];
const RANGED_SUBTYPE_POOL = ["single", "single", "spread", "double"];

// ---- 공격 예고 (빨간 원/선/부채꼴) ----
const TELEGRAPH_COLOR = [255, 70, 50];
const MIN_TELEGRAPH_MS = 600;            // 걸어서 피할 수 있게 최소 이만큼 미리 보여준다

// ---- 새 일반 몬스터 ----
// 자폭병: 다가와서 멈추고 깜빡이다 폭발 (깜빡일 때 죽이면 폭발 안 함)
const KAMIKAZE_BASE_HP = 12, KAMIKAZE_TOUCH_DMG = 6, KAMIKAZE_BLAST_DMG = 24, KAMIKAZE_BLAST_RADIUS = 80;
const KAMIKAZE_TRIGGER_RANGE = 75, KAMIKAZE_FUSE_MS = 750, KAMIKAZE_COLOR = [255, 90, 60], KAMIKAZE_UNLOCK_STAGE = 2;
// 도약병: 플레이어 자리에 착지 원을 보여주고 뛰어올라 내려찍기
const LEAPER_BASE_HP = 22, LEAPER_TOUCH_DMG = 9, LEAPER_SLAM_DMG = 18, LEAPER_SLAM_RADIUS = 62;
const LEAPER_RANGE = 330, LEAPER_AIR_MS = 850, LEAPER_COOLDOWN_MS = 2800, LEAPER_COLOR = [200, 150, 90], LEAPER_UNLOCK_STAGE = 3;
// 암살자: 사라졌다가 등 뒤에 나타나 짧게 예고하고 베기
const ASSASSIN_BASE_HP = 18, ASSASSIN_TOUCH_DMG = 8, ASSASSIN_SLASH_DMG = 18, ASSASSIN_SLASH_LEN = 95;
const ASSASSIN_SLASH_HALF_DEG = 55, ASSASSIN_HIDE_MS = 650, ASSASSIN_WINDUP_MS = 600, ASSASSIN_COOLDOWN_MS = 4300;
const ASSASSIN_COLOR = [110, 90, 140], ASSASSIN_UNLOCK_STAGE = 5;
// 포탑: 제자리에서 돌면서 나선형으로 탄을 뿌림
const TURRET_BASE_HP = 30, TURRET_TOUCH_DMG = 6, TURRET_BULLET_DMG = 8, TURRET_BULLET_SPEED = 3.2;
const TURRET_FIRE_GAP_MS = 150, TURRET_BURST_MS = 2400, TURRET_REST_MS = 2000, TURRET_ARMS = 2;
const TURRET_COLOR = [150, 150, 165], TURRET_UNLOCK_STAGE = 3;
// 저격병: 빨간 조준선 1초 -> 빠른 탄
const SNIPER_BASE_HP = 14, SNIPER_BULLET_DMG = 20, SNIPER_BULLET_SPEED = 13, SNIPER_AIM_MS = 1000;
const SNIPER_LOCK_MS = 350, SNIPER_COOLDOWN_MS = 3200, SNIPER_COLOR = [70, 120, 200], SNIPER_UNLOCK_STAGE = 4;
// 함정꾼: 도망다니며 지뢰를 깔아둠
const TRAPPER_BASE_HP = 16, TRAPPER_MINE_DMG = 16, TRAPPER_MINE_RADIUS = 55, TRAPPER_MINE_ARM_MS = 800;
const TRAPPER_MINE_FUSE_MS = 300, TRAPPER_MINE_LIFE_MS = 12000, TRAPPER_MINE_GAP_MS = 2300, TRAPPER_MAX_MINES = 4;
const TRAPPER_COLOR = [190, 170, 70], TRAPPER_UNLOCK_STAGE = 4;
// 주술사: 주변 몬스터 회복 / 보호막, 죽은 몬스터 1번 부활
const SHAMAN_BASE_HP = 18, SHAMAN_CAST_MS = 3500, SHAMAN_RANGE = 230, SHAMAN_HEAL_RATIO = 0.2;
const SHAMAN_SHIELD_RATIO = 0.25, SHAMAN_SHIELD_MS = 4000, SHAMAN_REVIVE_WINDOW_MS = 6000;
const SHAMAN_COLOR = [100, 230, 190], SHAMAN_UNLOCK_STAGE = 5;
// 저주술사: 맞으면 느려지는 보라색 구슬
const HEXER_BASE_HP = 15, HEXER_BULLET_DMG = 8, HEXER_COOLDOWN_MS = 2600, HEXER_SLOW_PCT = 0.35, HEXER_SLOW_MS = 2000;
const HEXER_COLOR = [170, 80, 200], HEXER_UNLOCK_STAGE = 6;

// ---- 엘리트 접두사 ----
// [키, 이름, 색]
const ELITE_AFFIXES = [
    ["fire", "화염", [255, 120, 40]], ["frost", "냉기", [130, 210, 255]], ["explosive", "폭발", [255, 80, 60]],
    ["arcane", "비전", [200, 110, 255]], ["vampire", "흡혈", [220, 40, 70]], ["swift", "신속", [120, 255, 160]],
    ["shielded", "보호막", [140, 200, 255]], ["splitting", "분열", [255, 220, 90]],
];
const ELITE_CHANCE_PER_STAGE = 0.01, ELITE_CHANCE_MAX = 0.25, ELITE_TWO_AFFIX_STAGE = 6;
const ELITE_FIRE_TRAIL_MS = 450, ELITE_FROST_GAP_MS = 5200, ELITE_FROST_RADIUS = 110, ELITE_FROST_DMG = 10;
const ELITE_EXPLODE_RADIUS = 90, ELITE_EXPLODE_DMG = 20, ELITE_ARCANE_LEN = 140, ELITE_ARCANE_DMG = 12;
const ELITE_VAMPIRE_HEAL_MULT = 1.5, ELITE_SWIFT_SPEED = 1.45, ELITE_SWIFT_COOLDOWN = 0.7;
const ELITE_SHIELD_GAP_MS = 6500, ELITE_SHIELD_RATIO = 0.3, ELITE_SHIELD_MS = 3000;

// ---- 보스 공통 구조 ----
const BOSS_PHASE2_RATIO = 0.70, BOSS_PHASE3_RATIO = 0.35, BOSS_PHASE_CHANGE_MS = 1300;
const BOSS_MOVE_MS = [900, 1500], BOSS_REST_MS = [1000, 1500], BOSS_REST_DAMAGE_MULT = 1.25;
const BOSS_PHASE3_SPEED_MULT = 1.2, BOSS_PHASE3_REST_MULT = 0.65;
const BOSS_GOLEM_UNLOCK_STAGE = 2, BOSS_MAGE_UNLOCK_STAGE = 4, BOSS_BLADE_UNLOCK_STAGE = 5;
const BOSS_QUEEN_UNLOCK_STAGE = 6, BOSS_JUDGE_UNLOCK_STAGE = 8, BOSS_HYBRID_UNLOCK_STAGE = 10, BOSS_HYBRID_CHANCE = 0.4;
const EGG_BASE_HP = 16, EGG_HATCH_MS = 4200, EGG_COLOR = [235, 225, 180];
const SHOCKWAVE_THICKNESS = 16;
// 충격파 고리 빈틈: 개수 / 빈틈 절반 너비(라디안, 0.22 = 약 25도 너비)
//   가장 가까운 빈틈은 플레이어 자리에서 "고리가 닿기 전에 걸어서 갈 수 있는 거리"의 55~85% 만큼 떨어진 곳에 생긴다
//   -> 가만히 있으면 맞고, 바로 움직이면 피할 수 있다
const SHOCKWAVE_GAP_COUNT = 3, SHOCKWAVE_GAP_HALF = 0.22;
const SHOCKWAVE_GAP_REACH_MIN = 0.55, SHOCKWAVE_GAP_REACH_MAX = 0.85, SHOCKWAVE_GAP_REACH_SAFETY = 0.6;
const SHOCKWAVE_DOUBLE_SHIFT = 0.38;        // 연달아 퍼지는 두 번째 고리는 빈틈이 이만큼(라디안) 옆으로 옮겨진다
// 연달아 쓰지 않는 원형 패턴 (한 번 쓰면 다음 패턴은 원형이 아닌 것)
const BOSS_RING_PATTERNS = ["slamRing", "stompRing", "quake", "ringShot"];

// ---- 기억(스킬) ----
const SKILL_SLOTS = 3, SKILL_CAST_GAP_MS = 500, SKILL_OFFER_CHANCE = 0.10, SKILL_OFFER_COUNT = 3;
const SKILL_MAX_LEVEL = 10, SKILL_DMG_PER_LEVEL = 0.2, SKILL_SYNERGY_MULT = 1.3;
// 기억 원소 -> 시너지가 생기는 총 원소
const SKILL_SYNERGY_GUNS = { fire: ["fire"], ice: ["ice"], light: ["light", "lightning"], dark: ["dark"] };
const SKILL_ELEMENT_INFO = {
    none: ["무속성", [200, 200, 210]], fire: ["화염", [255, 120, 50]], ice: ["얼음", [130, 215, 255]],
    light: ["빛", [255, 235, 120]], dark: ["어둠", [170, 90, 230]],
};
// 기억으로 강해진 만큼 몬스터 체력도 조금 올린다 (방에 들어갈 때 갖고 있는 기억 기준)
//   시뮬레이션: 기억 1/2/3개 = 전투방 화력 약 x1.2/x1.4/x1.6, 보스전 약 x1.1/x1.2/x1.3
//   -> 늘어난 화력의 절반쯤만 체력으로 돌려서, 기억을 얻으면 확실히 강해진 느낌은 남긴다
const SKILL_HP_PER_SKILL = 0.10, SKILL_HP_PER_LEVEL = 0.015;            // 일반 몬스터
const SKILL_BOSS_HP_PER_SKILL = 0.03, SKILL_BOSS_HP_PER_LEVEL = 0.005;  // 보스
function skillMonsterHpMult(p, isBoss) {
    if (!p || !p.skills || !p.skills.length) return 1;
    const n = p.skills.length, lv = p.skills.reduce((a, s) => a + s.level, 0);
    return isBoss ? 1 + SKILL_BOSS_HP_PER_SKILL * n + SKILL_BOSS_HP_PER_LEVEL * lv
                  : 1 + SKILL_HP_PER_SKILL * n + SKILL_HP_PER_LEVEL * lv;
}
// 기억의 쿨타임: 원작 공식 17/(17+강화 수)
function skillCooldownMult(level) { return 17 / (17 + level); }

// ---- 총 ----
// [키, 한글 이름, 등장 확률, 테두리 색, 테두리 두께, 공격력 보너스]
const GUN_GRADES = [
    ["common", "일반", 0.55, [175, 175, 185], 2, 0.10],
    ["rare", "레어", 0.30, [70, 150, 255], 3, 0.20],
    ["unique", "유니크", 0.11, [190, 90, 255], 3, 0.35],
    ["legendary", "전설", 0.03, [255, 165, 40], 4, 0.55],
    ["mythic", "신화", 0.01, [255, 60, 90], 4, 0.80],
];
const GUN_GRADE_INDEX = {};
GUN_GRADES.forEach((g, i) => { GUN_GRADE_INDEX[g[0]] = i; });
// 원소: [한글 이름, 색, 등급별 수치 5개]
const GUN_ELEMENTS = {
    fire: ["화염", [255, 110, 40], [0.20, 0.40, 0.60, 0.80, 1.00]],
    ice: ["얼음", [120, 220, 255], [0.20, 0.30, 0.40, 0.50, 0.60]],
    lightning: ["번개", [255, 235, 70], [0.20, 0.30, 0.40, 0.50, 0.60]],
    light: ["빛", [255, 250, 210], [0.02, 0.04, 0.06, 0.08, 0.10]],
    nature: ["자연", [90, 215, 90], [0.001, 0.0015, 0.002, 0.0025, 0.003]],   // 명중 1발당 최대체력의 %
    dark: ["어둠", [150, 70, 220], [0.04, 0.08, 0.12, 0.16, 0.20]],
    earth: ["대지", [176, 124, 66], [0.04, 0.08, 0.12, 0.16, 0.20]],
    wind: ["바람", [130, 235, 205], [1, 1, 2, 2, 3]],
    spread: ["산탄", [235, 90, 140], [0.30, 0.40, 0.50, 0.60, 0.70]],
};
const GUN_ELEMENT_ORDER = ["fire", "ice", "lightning", "light", "nature", "dark", "earth", "wind", "spread"];
const GUN_CHOICE_COUNT = 3, GUN_PICKUP_RADIUS = 30;
const FIRE_BURN_DURATION_MS = 5000, FIRE_BURN_TICK_MS = 1000, ICE_SLOW_DURATION_MS = 2000;
const LIGHTNING_CHAIN_COUNT = 3, LIGHTNING_CHAIN_RANGE = 170, LIGHTNING_ZAP_MS = 180;
const DARK_INVULN_MS = 1000, DARK_COOLDOWN_MS = 1000;
const EARTH_STUN_MS = 1000, EARTH_BOSS_STUN_MS = 500, EARTH_STUN_IMMUNE_MS = 1000;
const WIND_PIERCE_DAMAGE_MULT = 0.8, SPREAD_PELLETS = 3, SPREAD_ANGLE_DEG = 12, LIGHT_MAX_STACKS = 20;
const PORTAL_RADIUS = 30, REWARD_PICKUP_DELAY_MS = 1000, GUN_ROW_SPACING = 170;

// 설정 화면: [설명, 최소, 최대, 정수인지]
const GUN_SETTING_INFO = {
    fire: ["5초간 매초 공격력의 %", 0, 500, false],
    ice: ["이동속도 감소 %", 0, 95, false],
    lightning: ["근처 3명에게 피해의 %", 0, 300, false],
    light: ["표식 1개당 추가 피해 % (최대 20중첩)", 0, 50, false],
    nature: ["명중 1발마다 최대체력의 % 회복", 0, 5, false],
    dark: ["1초 무적 확률 %", 0, 100, false],
    earth: ["기절 확률 %", 0, 100, false],
    wind: ["관통 마릿수", 0, 10, true],
    spread: ["3발 중 1발 피해 %", 0, 300, false],
};
const GRADE_ATK_LIMITS = [0, 500];
const DEFAULT_GUN_EFFECTS = {};
GUN_ELEMENT_ORDER.forEach(el => { DEFAULT_GUN_EFFECTS[el] = GUN_ELEMENTS[el][2].slice(); });
const DEFAULT_GRADE_ATK_BONUS = GUN_GRADES.map(g => g[5]);

// ---- SM-2 ----
const SM2_DEFAULT_EF = 2.5, SM2_MIN_EF = 1.3, SM2_MAX_EF = 5.0, SM2_MAX_INTERVAL_DAYS = 365;
const ANSWER_TIME_EASY_MAX_SEC = 5.0, ANSWER_TIME_NORMAL_MAX_SEC = 10.0;
const ANSWER_TIER_LABEL_KO = { easy: "쉬움", normal: "보통", hard: "어려움" };

const ROOM_TYPE_LABEL = { start: "시작방", battle: "전투방", boss: "보스방" };
const ROOM_BG_COLOR = { start: [40, 42, 56], battle: [38, 34, 48], boss: [55, 28, 32] };

const MONSTER_SKIN_MELEE = "bamboo", MONSTER_SKIN_MELEE_DASH = "squid", MONSTER_SKIN_RANGED = "spirit", MONSTER_SKIN_BOSS = "raccoon";
const ANIM_FRAME_MS = 140;

const FONT_FAMILY = '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", sans-serif';

// =============================================================
// 공용 도구 (Python 내장 함수와 똑같이 동작하도록)
// =============================================================
// Python의 round()는 .5를 짝수 쪽으로 반올림한다 (banker's rounding)
function pyRound(x) {
    const f = Math.floor(x);
    const diff = x - f;
    if (Math.abs(diff - 0.5) < 1e-9) return (f % 2 === 0) ? f : f + 1;
    return Math.round(x);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function hypot(x, y) { return Math.sqrt(x * x + y * y); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }   // a~b 포함
function uniform(a, b) { return a + Math.random() * (b - a); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function sample(arr, k) { return shuffle(arr.slice()).slice(0, k); }
function weightedChoice(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
    }
    return items[items.length - 1];
}
function shadeColor(c, amount) {
    return [clamp(c[0] + amount, 0, 255), clamp(c[1] + amount, 0, 255), clamp(c[2] + amount, 0, 255)];
}
function rgb(c, a) {
    if (a === undefined) return `rgb(${c[0]},${c[1]},${c[2]})`;
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function fmtNum(v) {
    v = Math.round(v * 10) / 10;
    return (v === Math.trunc(v)) ? String(Math.trunc(v)) : v.toFixed(1);
}
function radians(deg) { return deg * Math.PI / 180; }
function rotateDirection(dx, dy, degrees) {
    const r = radians(degrees), c = Math.cos(r), s = Math.sin(r);
    return [dx * c - dy * s, dx * s + dy * c];
}
function todayISO(d) {
    d = d || new Date();
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
