/**
 * @file keywords.h
 * @brief 关键字系统 - 简化技能配置
 * 
 * 使用示例:
 *   Keyword_DoubleStrike(keyword, 2)
 *   Keyword_Lifesteal(keyword, 0.5f)
 */

#ifndef KEYWORDS_H
#define KEYWORDS_H

#include "skill_system.h"

/* ============================================================================
 * 关键字宏定义
 * ============================================================================ */

/* 攻击类关键字 */
#define KEYWORD_DOUBLE_STRIKE(name, count) { \
    strncpy(name, "Double Strike", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "攻击%d次", count); \
}

#define KEYWORD_PIERCING(name) { \
    strncpy(name, "Piercing", MAX_SKILL_NAME_LEN-1); \
    strncpy(name##_desc, "无视格挡", MAX_SKILL_DESC_LEN-1); \
}

#define KEYWORD_LIFESTEAL(name, percent) { \
    strncpy(name, "Lifesteal", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "造成伤害的%d%%转化为生命", percent); \
}

#define KEYWORD_VENOM(name, damage) { \
    strncpy(name, "Venom", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "目标每回合失去%d点生命", damage); \
}

#define KEYWORD_POISON(name, stacks, damage) { \
    strncpy(name, "Poison", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "施加%d层中毒，每层%d点伤害", stacks, damage); \
}

/* 防御类关键字 */
#define KEYWORD_THORNS(name, damage) { \
    strncpy(name, "Thorns", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "攻击者受到%d点伤害", damage); \
}

#define KEYWORD_INTANGIBLE(name) { \
    strncpy(name, "Intangible", MAX_SKILL_NAME_LEN-1); \
    strncpy(name##_desc, "受到伤害降为1", MAX_SKILL_DESC_LEN-1); \
}

#define KEYWORD_ARMOR(name, amount) { \
    strncpy(name, "Armor", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "获得%d点护甲", amount); \
}

/* 能量类关键字 */
#define KEYWORD_ENERGIZE(name, amount) { \
    strncpy(name, "Energize", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "获得%d点能量", amount); \
}

/* 牌库类关键字 */
#define KEYWORD_ETHEREAL(name) { \
    strncpy(name, "Ethereal", MAX_SKILL_NAME_LEN-1); \
    strncpy(name##_desc, "回合结束时消耗此牌", MAX_SKILL_DESC_LEN-1); \
}

#define KEYWORD_RETAIN(name) { \
    strncpy(name, "Retain", MAX_SKILL_NAME_LEN-1); \
    strncpy(name##_desc, "回合结束时保留此牌", MAX_SKILL_DESC_LEN-1); \
}

#define KEYWORD_INNATE(name) { \
    strncpy(name, "Innate", MAX_SKILL_NAME_LEN-1); \
    strncpy(name##_desc, "战斗开始时在手牌中", MAX_SKILL_DESC_LEN-1); \
}

#define KEYWORD_EXHAUST(name) { \
    strncpy(name, "Exhaust", MAX_SKILL_NAME_LEN-1); \
    strncpy(name##_desc, "使用后被消耗", MAX_SKILL_DESC_LEN-1); \
}

/* 状态类关键字 */
#define KEYWORD_WEAKEN(name, stacks) { \
    strncpy(name, "Weaken", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "力量降低%d", stacks); \
}

#define KEYWORD_VULNERABLE(name, stacks) { \
    strncpy(name, "Vulnerable", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "受到伤害增加50%%，持续%d回合", stacks); \
}

#define KEYWORD_STRENGTH(name, stacks) { \
    strncpy(name, "Strength", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "力量+%d", stacks); \
}

#define KEYWORD_DEXTERITY(name, stacks) { \
    strncpy(name, "Dexterity", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "敏捷+%d", stacks); \
}

/* 特殊类关键字 */
#define KEYWORD_CHAIN(name, target_count) { \
    strncpy(name, "Chain", MAX_SKILL_NAME_LEN-1); \
    snprintf(name##_desc, MAX_SKILL_DESC_LEN, "弹射至%d个目标", target_count); \
}

#define KEYWORD_AOE(name) { \
    strncpy(name, "Area of Effect", MAX_SKILL_NAME_LEN-1); \
    strncpy(name##_desc, "影响所有目标", MAX_SKILL_DESC_LEN-1); \
}

/* ============================================================================
 * 预定义技能工厂
 * ============================================================================ */

/**
 * @brief 创建"打击"技能
 */
static inline SkillDef* skill_strike(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 1001;
    strncpy(def->name, "Strike", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "造成6点伤害", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    def->actions[0].type = ACTION_DEAL_DAMAGE;
    def->actions[0].base_value = 6;
    def->actions[0].target.type = TARGET_ENEMY;
    def->action_count = 1;
    
    def->tags = TAG_ATTACK;
    def->rarity = 0;
    
    return def;
}

/**
 * @brief 创建"防御"技能
 */
static inline SkillDef* skill_defend(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 1002;
    strncpy(def->name, "Defend", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "获得5点格挡", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    def->actions[0].type = ACTION_GAIN_BLOCK;
    def->actions[0].base_value = 5;
    def->actions[0].target.type = TARGET_SELF;
    def->action_count = 1;
    
    def->tags = TAG_SKILL;
    def->rarity = 0;
    
    return def;
}

/**
 * @brief 创建"重击"技能
 */
static inline SkillDef* skill_heavy_strike(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 1003;
    strncpy(def->name, "Heavy Strike", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "造成14点伤害，敌人脆弱时伤害翻倍", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    
    /* 基础伤害 */
    def->actions[0].type = ACTION_DEAL_DAMAGE;
    def->actions[0].base_value = 14;
    def->actions[0].target.type = TARGET_ENEMY;
    
    /* 脆弱时伤害翻倍 */
    def->modifiers[0].type = MODIFIER_IF_CONDITION;
    def->modifiers[0].condition.type = COND_IS_VULNERABLE;
    def->modifiers[1].type = MODIFIER_MULTIPLY_VALUE;
    def->modifiers[1].value = 2;
    
    def->action_count = 1;
    def->modifier_count = 2;
    
    def->tags = TAG_ATTACK;
    def->rarity = 1;
    
    return def;
}

/**
 * @brief 创建"双击"技能
 */
static inline SkillDef* skill_double_strike(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 1004;
    strncpy(def->name, "Double Strike", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "攻击2次，每次造成5点伤害", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    def->actions[0].type = ACTION_DEAL_DAMAGE;
    def->actions[0].base_value = 5;
    def->actions[0].target.type = TARGET_ENEMY;
    def->actions[0].repeat_count = 2;
    def->action_count = 1;
    
    def->tags = TAG_ATTACK;
    def->rarity = 0;
    
    return def;
}

/**
 * @brief 创建"吸血"技能
 */
static inline SkillDef* skill_lifesteal_strike(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 1005;
    strncpy(def->name, "Vampiric Strike", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "造成8点伤害，回复等量生命", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    
    /* 造成伤害 */
    def->actions[0].type = ACTION_DEAL_DAMAGE;
    def->actions[0].base_value = 8;
    def->actions[0].target.type = TARGET_ENEMY;
    
    /* 回复生命 */
    def->actions[1].type = ACTION_HEAL;
    def->actions[1].base_value = 8;
    def->actions[1].target.type = TARGET_SELF;
    
    def->action_count = 2;
    
    def->tags = TAG_ATTACK;
    def->rarity = 1;
    
    return def;
}

/**
 * @brief 创建"力量爆发"被动技能
 */
static inline SkillDef* skill_strength_buff(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 2001;
    strncpy(def->name, "Strength", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "战斗开始时获得2点力量", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_BATTLE_START;
    def->actions[0].type = ACTION_GAIN_STRENGTH;
    def->actions[0].base_value = 2;
    def->actions[0].target.type = TARGET_SELF;
    def->action_count = 1;
    
    def->tags = TAG_POWER;
    def->rarity = 1;
    def->stackable = true;
    def->max_stack = 99;
    
    return def;
}

/**
 * @brief 创建"燃烧"持续伤害
 */
static inline SkillDef* skill_burn(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 3001;
    strncpy(def->name, "Burn", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "目标每回合受到3点伤害，持续3回合", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    def->actions[0].type = ACTION_APPLY_DEBUFF;
    def->actions[0].base_value = 3;
    def->actions[0].status_type = DEBUFF_BURN;
    def->actions[0].status_turns = 3;
    def->actions[0].target.type = TARGET_ENEMY;
    def->action_count = 1;
    
    def->tags = TAG_ATTACK | TAG_DEBUFF;
    def->rarity = 1;
    
    return def;
}

/**
 * @brief 创建"抽牌"技能
 */
static inline SkillDef* skill_draw(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 4001;
    strncpy(def->name, "Quick Draw", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "抽2张牌", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    def->actions[0].type = ACTION_DRAW;
    def->actions[0].base_value = 2;
    def->actions[0].target.type = TARGET_SELF;
    def->action_count = 1;
    
    def->tags = TAG_SKILL;
    def->rarity = 0;
    
    return def;
}

/**
 * @brief 创建"弃牌"技能
 */
static inline SkillDef* skill_discard(void) {
    SkillDef* def = skill_def_create();
    if (!def) return NULL;
    
    def->id = 4002;
    strncpy(def->name, "Discard", MAX_SKILL_NAME_LEN-1);
    strncpy(def->description, "弃1张牌，获得1点能量", MAX_SKILL_DESC_LEN-1);
    
    def->trigger.type = TRIGGER_ON_PLAY;
    
    /* 弃牌 */
    def->actions[0].type = ACTION_DISCARD;
    def->actions[0].base_value = 1;
    def->actions[0].target.type = TARGET_SELF;
    
    /* 获得能量 */
    def->actions[1].type = ACTION_GAIN_ENERGY;
    def->actions[1].base_value = 1;
    def->actions[1].target.type = TARGET_SELF;
    
    def->action_count = 2;
    
    def->tags = TAG_SKILL;
    def->rarity = 0;
    
    return def;
}

#endif /* KEYWORDS_H */
