/**
 * @file skill_system.h
 * @brief DB卡牌游戏技能系统 - 纯C实现
 * 
 * 核心设计：触发器 + 动作 + 修正器 = 技能
 * 三层架构：Data层 → Instance层 → Context层
 * 
 * @version 1.0.0
 * @date 2026-03-21
 */

#ifndef SKILL_SYSTEM_H
#define SKILL_SYSTEM_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 版本与常量
 * ============================================================================ */

#define SKILL_VERSION_MAJOR 1
#define SKILL_VERSION_MINOR 0
#define SKILL_VERSION_PATCH 0

#define SKILL_OK            0
#define SKILL_ERR_PARAM    -1
#define SKILL_ERR_MEM      -2
#define SKILL_ERR_NOT_FOUND -3
#define SKILL_ERR_COND_FALSE -4

/* 资源常量 */
#define MAX_SKILL_NAME_LEN    64
#define MAX_SKILL_DESC_LEN   256
#define MAX_ACTIONS_PER_SKILL 8
#define MAX_MODIFIERS_PER_SKILL 8
#define MAX_SKILL_STACK       99

/* ============================================================================
 * 枚举定义
 * ============================================================================ */

/* 触发器类型 */
typedef enum {
    /* 牌库相关 */
    TRIGGER_ON_PLAY,        /* 出牌时 */
    TRIGGER_ON_DRAW,        /* 抽牌时 */
    TRIGGER_ON_DISCARD,     /* 弃牌时 */
    TRIGGER_ON_EXHAUST,     /* 消耗时 */
    TRIGGER_ON_SHUFFLE,     /* 洗牌时 */
    
    /* 战斗相关 */
    TRIGGER_ON_DAMAGE,      /* 造成伤害时 */
    TRIGGER_ON_DAMAGE_TAKEN,/* 受到伤害时 */
    TRIGGER_ON_KILL,        /* 击杀时 */
    TRIGGER_ON_DEATH,       /* 死亡时 */
    TRIGGER_ON_BLOCK,       /* 格挡时 */
    TRIGGER_ON_HEAL,        /* 治疗时 */
    
    /* 回合相关 */
    TRIGGER_ON_TURN_START,  /* 回合开始 */
    TRIGGER_ON_TURN_END,    /* 回合结束 */
    TRIGGER_ON_BATTLE_START,/* 战斗开始 */
    TRIGGER_ON_BATTLE_END,  /* 战斗结束 */
    
    /* 状态相关 */
    TRIGGER_ON_BUFF_APPLY,  /* 施加增益时 */
    TRIGGER_ON_DEBUFF_APPLY,/* 施加减益时 */
    TRIGGER_ON_BUFF_REMOVE, /* 移除增益时 */
    
    /* 特殊 */
    TRIGGER_ON_COMBO,       /* 连击时 */
    TRIGGER_ON_ENERGY_CHANGE, /* 能量变化 */
    TRIGGER_CUSTOM          /* 自定义 */
} TriggerType;

/* 动作类型 */
typedef enum {
    /* 资源类 */
    ACTION_DEAL_DAMAGE,     /* 造成伤害 */
    ACTION_HEAL,            /* 治疗 */
    ACTION_GAIN_BLOCK,      /* 获得格挡 */
    ACTION_GAIN_ENERGY,     /* 获得能量 */
    ACTION_LOSE_HP,         /* 失去生命 */
    ACTION_LOSE_ENERGY,     /* 失去能量 */
    
    /* 牌库类 */
    ACTION_DRAW,            /* 抽牌 */
    ACTION_DISCARD,         /* 弃牌 */
    ACTION_EXHAUST,         /* 消耗 */
    ACTION_CREATE_CARD,     /* 生成卡牌 */
    ACTION_UPGRADE_CARD,    /* 升级卡牌 */
    ACTION_DUPLICATE_CARD,  /* 复制卡牌 */
    ACTION_TRANSFORM_CARD,  /* 转化卡牌 */
    
    /* 状态类 */
    ACTION_APPLY_BUFF,      /* 施加增益 */
    ACTION_APPLY_DEBUFF,    /* 施加减益 */
    ACTION_REMOVE_BUFF,     /* 移除增益 */
    ACTION_DISPEL,          /* 驱散 */
    ACTION_CLEAR_DEBUFFS,   /* 清除减益 */
    
    /* 控制类 */
    ACTION_STUN,            /* 眩晕 */
    ACTION_SILENCE,         /* 沉默 */
    ACTION_TAUNT,           /* 嘲讽 */
    ACTION_STEALTH,         /* 潜行 */
    ACTION_INVULNERABLE,   /* 无敌 */
    
    /* 特殊类 */
    ACTION_TRIGGER_SKILL,   /* 触发技能 */
    ACTION_CHAIN_SKILL,     /* 连锁技能 */
    ACTION_CONDITIONAL,     /* 条件分支 */
    ACTION_RANDOM,          /* 随机 */
    ACTION_REPEAT,          /* 重复 */
    ACTION_DELAY,           /* 延迟 */
    ACTION_SELF_DAMAGE,     /* 自伤 */
    ACTION_GAIN_STRENGTH,  /* 获得力量 */
    ACTION_GAIN_DEXTERITY   /* 获得敏捷 */
} ActionType;

/* 修正器类型 */
typedef enum {
    /* 数值修正 */
    MODIFIER_ADD_VALUE,         /* +N */
    MODIFIER_MULTIPLY_VALUE,   /* ×N */
    MODIFIER_SET_VALUE,         /* =N */
    MODIFIER_PERCENT_VALUE,     /* +N% */
    
    /* 目标修正 */
    MODIFIER_TARGET_ALL,        /* 全体 */
    MODIFIER_TARGET_RANDOM,     /* 随机 */
    MODIFIER_TARGET_SELF,       /* 自己 */
    MODIFIER_TARGET_ADJACENT,   /* 相邻 */
    MODIFIER_TARGET_FILTERED,  /* 过滤 */
    
    /* 条件修正 */
    MODIFIER_IF_CONDITION,      /* 如果满足 */
    MODIFIER_PER_CONDITION,     /* 每满足N次 */
    MODIFIER_WHILE_CONDITION,   /* 当满足时 */
    
    /* 时间修正 */
    MODIFIER_DELAY,             /* 延迟N回合 */
    MODIFIER_REPEAT,            /* 重复N次 */
    MODIFIER_PERMANENT,         /* 永久 */
    
    /* 代价修正 */
    MODIFIER_COST_HEALTH,       /* 消耗生命 */
    MODIFIER_COST_ENERGY,       /* 消耗能量 */
    MODIFIER_COST_CARD          /* 消耗卡牌 */
} ModifierType;

/* 技能标签 */
typedef enum {
    TAG_ATTACK = 1 << 0,       /* 攻击 */
    TAG_SKILL = 1 << 1,        /* 技能 */
    TAG_POWER = 1 << 2,        /* 能力 */
    TAG_STATUS = 1 << 3,       /* 状态 */
    TAG_CURSE = 1 << 4,        /* 诅咒 */
    TAG_DEBUFF = 1 << 5,       /* 减益 */
    TAG_BUFF = 1 << 6,         /* 增益 */
    TAG_FIRE = 1 << 7,         /* 火焰 */
    TAG_ICE = 1 << 8,          /* 冰霜 */
    TAG_LIGHTNING = 1 << 9,    /* 闪电 */
    TAG_DARK = 1 << 10,        /* 暗影 */
    TAG_POISON = 1 << 11,      /* 毒系 */
    TAG_IRON = 1 << 12,        /* 钢铁 */
    TAG_SPIRIT = 1 << 13       /* 精神 */
} SkillTag;

/* 目标类型 */
typedef enum {
    TARGET_SELF,               /* 自己 */
    TARGET_ENEMY,              /* 敌方单体 */
    TARGET_ENEMIES,            /* 敌方全体 */
    TARGET_ALLY,               /* 友方单体 */
    TARGET_ALLIES,             /* 友方全体 */
    TARGET_RANDOM_ENEMY,       /* 随机敌方 */
    TARGET_RANDOM_ALLY,        /* 随机友方 */
    TARGET_LOWEST_HP,          /* 最低生命 */
    TARGET_HIGHEST_HP,        /* 最高生命 */
    TARGET_RANDOM,             /* 随机目标 */
    TARGET_SELECTED            /* 玩家选择 */
} TargetType;

/* 条件类型 */
typedef enum {
    COND_ALWAYS,               /* 总是 */
    COND_NEVER,                /* 从不 */
    COND_HAS_BUFF,             /* 有增益 */
    COND_HAS_DEBUFF,           /* 有减益 */
    COND_HP_ABOVE,             /* 生命高于 */
    COND_HP_BELOW,             /* 生命低于 */
    COND_ENERGY_ABOVE,         /* 能量高于 */
    COND_ENERGY_BELOW,         /* 能量低于 */
    COND_CARD_COUNT_ABOVE,     /* 手牌数高于 */
    COND_CARD_COUNT_BELOW,     /* 手牌数低于 */
    COND_IS_POISONED,          /* 中毒 */
    COND_IS_WEAKENED,          /* 虚弱 */
    COND_IS_VULNERABLE,        /* 脆弱 */
    COND_IS_STRENGTHENED,      /* 强化 */
    COND_LAST_CARD_PLAYED,     /* 上张卡牌 */
    COND_COUNT                 /* 数量条件 */
} ConditionType;

/* Buff/Debuff类型 */
typedef enum {
    BUFF_STRENGTH,             /* 力量 */
    BUFF_DEXTERITY,            /* 敏捷 */
    BUFF_CONSTITUTION,         /* 体质 */
    BUFF_INTELLIGENCE,         /* 智力 */
    BUFF_WISDOM,               /* 智慧 */
    BUFF_LUCK,                 /* 幸运 */
    BUFF_REGENERATION,         /* 再生 */
    BUFF_THORNS,              /* 反伤 */
    BUFF_INTANGIBLE,          /* 虚无 */
    BUFF_REGEN,                /* 生命回复 */
    BUFF_BLOCK,                /* 护盾 */
    
    DEBUFF_POISON,             /* 中毒 */
    DEBUFF_WEAKEN,             /* 虚弱 */
    DEBUFF_VULNERABLE,         /* 脆弱 */
    DEBUFF_FRAIL,              /* 易伤 */
    DEBUFF_FRIGHTENED,         /* 恐惧 */
    DEBUFF_PARALYZED,          /* 麻痹 */
    DEBUFF_CONFUSED,           /* 混乱 */
    DEBUFF_WOUND,              /* 伤口 */
    DEBUFF_BURN,               /* 燃烧 */
    DEBUFF_FREEZE,             /* 冰冻 */
    DEBUFF_SHOCK,              /* 感电 */
    DEBUFF_BLEED               /* 流血 */
} StatusType;

/* ============================================================================
 * 数据结构
 * ============================================================================ */

/* 条件定义 */
typedef struct {
    ConditionType type;
    int value;                  /* 数值条件 */
    int value2;                 /* 范围条件 */
    StatusType status;          /* 状态条件 */
    bool negate;                /* 取反 */
} ConditionDef;

/* 目标选择器 */
typedef struct {
    TargetType type;
    int count;                  /* 目标数量 */
    ConditionDef condition;     /* 过滤条件 */
} TargetSelector;

/* 动作定义 */
typedef struct {
    ActionType type;
    int base_value;            /* 基础值 */
    TargetSelector target;      /* 目标选择 */
    
    /* 扩展 */
    int repeat_count;           /* 重复次数 */
    int delay_turns;            /* 延迟回合 */
    StatusType status_type;     /* 状态类型 */
    int status_turns;          /* 状态持续回合 */
    
    /* 条件动作 */
    struct {
        ConditionDef condition;
        struct ActionDef* true_action;
        struct ActionDef* false_action;
    } conditional;
    
    /* 随机动作 */
    struct {
        struct ActionDef* actions[4];
        int action_count;
        int weights[4];
    } random;
} ActionDef;

/* 修正器定义 */
typedef struct {
    ModifierType type;
    int value;
    int value2;
    ConditionDef condition;
} ModifierDef;

/* 触发器定义 */
typedef struct {
    TriggerType type;
    ConditionDef condition;     /* 触发条件 */
    float chance;               /* 触发概率 */
    int cooldown;               /* 冷却回合 */
} TriggerDef;

/* 技能定义（静态） */
typedef struct {
    int id;
    char name[MAX_SKILL_NAME_LEN];
    char description[MAX_SKILL_DESC_LEN];
    
    TriggerDef trigger;
    ActionDef actions[MAX_ACTIONS_PER_SKILL];
    int action_count;
    
    ModifierDef modifiers[MAX_MODIFIERS_PER_SKILL];
    int modifier_count;
    
    /* 元数据 */
    uint32_t tags;
    int priority;
    bool stackable;
    int max_stack;
    int rarity;                 /* 0=普通, 1=稀有, 2=史诗, 3=传说 */
} SkillDef;

/* ============================================================================
 * 运行时实例
 * ============================================================================ */

/* Buff/Debuff实例 */
typedef struct {
    StatusType type;
    int stacks;                /* 层数 */
    int turns_remaining;       /* 剩余回合 */
    SkillDef* source_skill;   /* 来源技能 */
} StatusInstance;

/* 技能实例（运行时） */
typedef struct {
    SkillDef* def;
    void* owner;               /* 拥有者（Entity*） */
    
    int current_cooldown;
    int stack_count;
    int turn_installed;
    
    /* 动态变量 */
    int variables[8];
    
    /* 关联 */
    void* linked_target;
} SkillInstance;

/* 实体（单位） */
typedef struct Entity Entity;
struct Entity {
    int id;
    char name[64];
    
    /* 基础属性 */
    int hp;
    int max_hp;
    int block;
    int energy;
    int max_energy;
    
    /* 属性 */
    int strength;      /* 力量 */
    int dexterity;     /* 敏捷 */
    int constitution;  /* 体质 */
    int intelligence;  /* 智力 */
    
    /* 状态 */
    StatusInstance statuses[32];
    int status_count;
    
    /* 技能 */
    SkillInstance* skills[16];
    int skill_count;
    
    /* 牌堆 */
    char* draw_pile[64];
    int draw_count;
    char* hand[64];
    int hand_count;
    char* discard_pile[64];
    int discard_count;
    
    /* 下一个实体 */
    Entity* next;
};

/* 事件上下文 */
typedef struct {
    TriggerType trigger_type;
    Entity* source;             /* 事件源 */
    Entity* target;             /* 目标 */
    int value;                  /* 关联数值 */
    void* related_data;         /* 关联数据 */
    
    /* 事件链 */
    struct EventContext* chain_prev;
    int chain_depth;
} EventContext;

/* 游戏状态 */
typedef struct {
    Entity* entities;
    int entity_count;
    
    int turn;
    Entity* current_turn_entity;
    
    /* 全局事件 */
    EventContext* event_queue[256];
    int event_queue_head;
    int event_queue_tail;
} GameState;

/* ============================================================================
 * API
 * ============================================================================ */

/* 创建与销毁 */
SkillDef* skill_def_create(void);
void skill_def_free(SkillDef* def);

SkillInstance* skill_instance_create(SkillDef* def, void* owner);
void skill_instance_free(SkillInstance* inst);

Entity* entity_create(const char* name, int hp, int energy);
void entity_free(Entity* e);

GameState* game_state_create(void);
void game_state_free(GameState* gs);

/* 技能管理 */
int skill_instance_activate(SkillInstance* inst, GameState* gs, EventContext* ctx);
int skill_instance_add(Entity* e, SkillDef* def);
int skill_instance_remove(Entity* e, int skill_id);

/* 事件系统 */
int event_trigger(GameState* gs, EventContext* ctx);
int event_subscribe(Entity* e, SkillInstance* skill);
int event_unsubscribe(Entity* e, int skill_id);

/* 状态管理 */
int status_apply(Entity* e, StatusType type, int stacks, int turns);
int status_remove(Entity* e, StatusType type);
int status_get(Entity* e, StatusType type);
bool status_has(Entity* e, StatusType type);

/* 动作执行 */
int action_execute(ActionDef* action, GameState* gs, EventContext* ctx);
int action_deal_damage(Entity* source, Entity* target, int damage);
int action_heal(Entity* target, int amount);
int action_gain_block(Entity* e, int amount);
int action_apply_status(Entity* e, StatusType type, int stacks, int turns);

/* 条件检查 */
bool condition_check(ConditionDef* cond, Entity* target, GameState* gs);

/* 工具 */
const char* trigger_type_name(TriggerType type);
const char* action_type_name(ActionType type);
const char* modifier_type_name(ModifierType type);
const char* status_type_name(StatusType type);

const char* skill_version(void);

#ifdef __cplusplus
}
#endif

#endif /* SKILL_SYSTEM_H */
