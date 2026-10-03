/**
 * @file skill_system.c
 * @brief DB卡牌游戏技能系统实现
 */

#include "skill_system.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ============================================================================
 * 内部常量
 * ============================================================================ */

#define SKILL_TAG_NAMES_MAX 16

/* ============================================================================
 * 字符串表
 * ============================================================================ */

static const char* trigger_names[] = {
    [TRIGGER_ON_PLAY] = "OnPlay",
    [TRIGGER_ON_DRAW] = "OnDraw",
    [TRIGGER_ON_DISCARD] = "OnDiscard",
    [TRIGGER_ON_EXHAUST] = "OnExhaust",
    [TRIGGER_ON_SHUFFLE] = "OnShuffle",
    [TRIGGER_ON_DAMAGE] = "OnDamage",
    [TRIGGER_ON_DAMAGE_TAKEN] = "OnDamageTaken",
    [TRIGGER_ON_KILL] = "OnKill",
    [TRIGGER_ON_DEATH] = "OnDeath",
    [TRIGGER_ON_BLOCK] = "OnBlock",
    [TRIGGER_ON_HEAL] = "OnHeal",
    [TRIGGER_ON_TURN_START] = "OnTurnStart",
    [TRIGGER_ON_TURN_END] = "OnTurnEnd",
    [TRIGGER_ON_BATTLE_START] = "OnBattleStart",
    [TRIGGER_ON_BATTLE_END] = "OnBattleEnd",
    [TRIGGER_ON_BUFF_APPLY] = "OnBuffApply",
    [TRIGGER_ON_DEBUFF_APPLY] = "OnDebuffApply",
    [TRIGGER_ON_BUFF_REMOVE] = "OnBuffRemove",
    [TRIGGER_ON_COMBO] = "OnCombo",
    [TRIGGER_ON_ENERGY_CHANGE] = "OnEnergyChange",
    [TRIGGER_CUSTOM] = "Custom"
};

static const char* action_names[] = {
    [ACTION_DEAL_DAMAGE] = "DealDamage",
    [ACTION_HEAL] = "Heal",
    [ACTION_GAIN_BLOCK] = "GainBlock",
    [ACTION_GAIN_ENERGY] = "GainEnergy",
    [ACTION_LOSE_HP] = "LoseHP",
    [ACTION_LOSE_ENERGY] = "LoseEnergy",
    [ACTION_DRAW] = "Draw",
    [ACTION_DISCARD] = "Discard",
    [ACTION_EXHAUST] = "Exhaust",
    [ACTION_CREATE_CARD] = "CreateCard",
    [ACTION_UPGRADE_CARD] = "UpgradeCard",
    [ACTION_DUPLICATE_CARD] = "DuplicateCard",
    [ACTION_TRANSFORM_CARD] = "TransformCard",
    [ACTION_APPLY_BUFF] = "ApplyBuff",
    [ACTION_APPLY_DEBUFF] = "ApplyDebuff",
    [ACTION_REMOVE_BUFF] = "RemoveBuff",
    [ACTION_DISPEL] = "Dispel",
    [ACTION_CLEAR_DEBUFFS] = "ClearDebuffs",
    [ACTION_STUN] = "Stun",
    [ACTION_SILENCE] = "Silence",
    [ACTION_TAUNT] = "Taunt",
    [ACTION_STEALTH] = "Stealth",
    [ACTION_INVULNERABLE] = "Invulnerable",
    [ACTION_TRIGGER_SKILL] = "TriggerSkill",
    [ACTION_CHAIN_SKILL] = "ChainSkill",
    [ACTION_CONDITIONAL] = "Conditional",
    [ACTION_RANDOM] = "Random",
    [ACTION_REPEAT] = "Repeat",
    [ACTION_DELAY] = "Delay",
    [ACTION_SELF_DAMAGE] = "SelfDamage",
    [ACTION_GAIN_STRENGTH] = "GainStrength",
    [ACTION_GAIN_DEXTERITY] = "GainDexterity"
};

static const char* modifier_names[] = {
    [MODIFIER_ADD_VALUE] = "AddValue",
    [MODIFIER_MULTIPLY_VALUE] = "MultiplyValue",
    [MODIFIER_SET_VALUE] = "SetValue",
    [MODIFIER_PERCENT_VALUE] = "PercentValue",
    [MODIFIER_TARGET_ALL] = "TargetAll",
    [MODIFIER_TARGET_RANDOM] = "TargetRandom",
    [MODIFIER_TARGET_SELF] = "TargetSelf",
    [MODIFIER_TARGET_ADJACENT] = "TargetAdjacent",
    [MODIFIER_TARGET_FILTERED] = "TargetFiltered",
    [MODIFIER_IF_CONDITION] = "IfCondition",
    [MODIFIER_PER_CONDITION] = "PerCondition",
    [MODIFIER_WHILE_CONDITION] = "WhileCondition",
    [MODIFIER_DELAY] = "Delay",
    [MODIFIER_REPEAT] = "Repeat",
    [MODIFIER_PERMANENT] = "Permanent",
    [MODIFIER_COST_HEALTH] = "CostHealth",
    [MODIFIER_COST_ENERGY] = "CostEnergy",
    [MODIFIER_COST_CARD] = "CostCard"
};

static const char* status_names[] = {
    [BUFF_STRENGTH] = "Strength",
    [BUFF_DEXTERITY] = "Dexterity",
    [BUFF_CONSTITUTION] = "Constitution",
    [BUFF_INTELLIGENCE] = "Intelligence",
    [BUFF_WISDOM] = "Wisdom",
    [BUFF_LUCK] = "Luck",
    [BUFF_REGENERATION] = "Regeneration",
    [BUFF_THORNS] = "Thorns",
    [BUFF_INTANGIBLE] = "Intangible",
    [BUFF_REGEN] = "Regen",
    [BUFF_BLOCK] = "Block",
    [DEBUFF_POISON] = "Poison",
    [DEBUFF_WEAKEN] = "Weaken",
    [DEBUFF_VULNERABLE] = "Vulnerable",
    [DEBUFF_FRAIL] = "Frail",
    [DEBUFF_FRIGHTENED] = "Frightened",
    [DEBUFF_PARALYZED] = "Paralyzed",
    [DEBUFF_CONFUSED] = "Confused",
    [DEBUFF_WOUND] = "Wound",
    [DEBUFF_BURN] = "Burn",
    [DEBUFF_FREEZE] = "Freeze",
    [DEBUFF_SHOCK] = "Shock",
    [DEBUFF_BLEED] = "Bleed"
};

/* ============================================================================
 * 创建与销毁
 * ============================================================================ */

SkillDef* skill_def_create(void) {
    SkillDef* def = (SkillDef*)calloc(1, sizeof(SkillDef));
    if (!def) return NULL;
    
    def->trigger.chance = 1.0f;
    def->stackable = true;
    def->max_stack = MAX_SKILL_STACK;
    
    return def;
}

void skill_def_free(SkillDef* def) {
    free(def);
}

SkillInstance* skill_instance_create(SkillDef* def, void* owner) {
    if (!def) return NULL;
    
    SkillInstance* inst = (SkillInstance*)calloc(1, sizeof(SkillInstance));
    if (!inst) return NULL;
    
    inst->def = def;
    inst->owner = owner;
    inst->stack_count = 1;
    
    return inst;
}

void skill_instance_free(SkillInstance* inst) {
    free(inst);
}

Entity* entity_create(const char* name, int hp, int energy) {
    Entity* e = (Entity*)calloc(1, sizeof(Entity));
    if (!e) return NULL;
    
    if (name) {
        strncpy(e->name, name, sizeof(e->name) - 1);
    }
    
    e->hp = hp;
    e->max_hp = hp;
    e->max_energy = energy;
    e->energy = energy;
    
    return e;
}

void entity_free(Entity* e) {
    if (!e) return;
    
    /* 释放技能实例 */
    for (int i = 0; i < e->skill_count; i++) {
        skill_instance_free(e->skills[i]);
    }
    
    /* 释放牌堆 */
    for (int i = 0; i < e->draw_count; i++) {
        free(e->draw_pile[i]);
    }
    for (int i = 0; i < e->hand_count; i++) {
        free(e->hand[i]);
    }
    for (int i = 0; i < e->discard_count; i++) {
        free(e->discard_pile[i]);
    }
    
    free(e);
}

GameState* game_state_create(void) {
    GameState* gs = (GameState*)calloc(1, sizeof(GameState));
    return gs;
}

void game_state_free(GameState* gs) {
    if (!gs) return;
    
    Entity* e = gs->entities;
    while (e) {
        Entity* next = e->next;
        entity_free(e);
        e = next;
    }
    
    free(gs);
}

/* ============================================================================
 * 状态管理
 * ============================================================================ */

int status_apply(Entity* e, StatusType type, int stacks, int turns) {
    if (!e) return SKILL_ERR_PARAM;
    
    /* 检查是否已存在 */
    for (int i = 0; i < e->status_count; i++) {
        if (e->statuses[i].type == type) {
            e->statuses[i].stacks += stacks;
            if (turns > 0) {
                e->statuses[i].turns_remaining = turns;
            }
            return SKILL_OK;
        }
    }
    
    /* 添加新状态 */
    if (e->status_count < 32) {
        StatusInstance* s = &e->statuses[e->status_count++];
        s->type = type;
        s->stacks = stacks;
        s->turns_remaining = turns;
        return SKILL_OK;
    }
    
    return SKILL_ERR_MEM;
}

int status_remove(Entity* e, StatusType type) {
    if (!e) return SKILL_ERR_PARAM;
    
    for (int i = 0; i < e->status_count; i++) {
        if (e->statuses[i].type == type) {
            /* 移动后面的元素 */
            for (int j = i; j < e->status_count - 1; j++) {
                e->statuses[j] = e->statuses[j + 1];
            }
            e->status_count--;
            return SKILL_OK;
        }
    }
    
    return SKILL_ERR_NOT_FOUND;
}

int status_get(Entity* e, StatusType type) {
    if (!e) return 0;
    
    for (int i = 0; i < e->status_count; i++) {
        if (e->statuses[i].type == type) {
            return e->statuses[i].stacks;
        }
    }
    
    return 0;
}

bool status_has(Entity* e, StatusType type) {
    return status_get(e, type) > 0;
}

/* ============================================================================
 * 条件检查
 * ============================================================================ */

bool condition_check(ConditionDef* cond, Entity* target, GameState* gs) {
    if (!cond || !target) return true;
    
    bool result = false;
    
    switch (cond->type) {
        case COND_ALWAYS:
            result = true;
            break;
            
        case COND_NEVER:
            result = false;
            break;
            
        case COND_HAS_BUFF:
        case COND_HAS_DEBUFF:
            result = status_has(target, cond->status);
            break;
            
        case COND_HP_ABOVE:
            result = target->hp > cond->value;
            break;
            
        case COND_HP_BELOW:
            result = target->hp < cond->value;
            break;
            
        case COND_ENERGY_ABOVE:
            result = target->energy > cond->value;
            break;
            
        case COND_ENERGY_BELOW:
            result = target->energy < cond->value;
            break;
            
        case COND_CARD_COUNT_ABOVE:
            result = target->hand_count > cond->value;
            break;
            
        case COND_CARD_COUNT_BELOW:
            result = target->hand_count < cond->value;
            break;
            
        case COND_IS_POISONED:
            result = status_has(target, DEBUFF_POISON);
            break;
            
        case COND_IS_WEAKENED:
            result = status_has(target, DEBUFF_WEAKEN);
            break;
            
        case COND_IS_VULNERABLE:
            result = status_has(target, DEBUFF_VULNERABLE);
            break;
            
        case COND_IS_STRENGTHENED:
            result = status_has(target, BUFF_STRENGTH);
            break;
            
        case COND_COUNT:
            result = cond->value > 0;
            break;
            
        default:
            result = true;
    }
    
    return cond->negate ? !result : result;
}

/* ============================================================================
 * 动作执行
 * ============================================================================ */

int action_deal_damage(Entity* source, Entity* target, int damage) {
    if (!source || !target) return SKILL_ERR_PARAM;
    
    /* 应用力量加成（从状态系统获取） */
    damage += status_get(source, BUFF_STRENGTH);
    
    /* 应用虚弱减益 */
    if (status_has(source, DEBUFF_WEAKEN)) {
        damage = (int)(damage * 0.75f);
    }
    
    /* 应用脆弱 */
    if (status_has(target, DEBUFF_VULNERABLE)) {
        damage = (int)(damage * 1.5f);
    }
    
    /* 先扣格挡 */
    if (target->block > 0) {
        if (target->block >= damage) {
            target->block -= damage;
            damage = 0;
        } else {
            damage -= target->block;
            target->block = 0;
        }
    }
    
    /* 再扣生命 */
    if (damage > 0) {
        target->hp -= damage;
        if (target->hp < 0) target->hp = 0;
    }
    
    return damage;
}

int action_heal(Entity* target, int amount) {
    if (!target) return SKILL_ERR_PARAM;
    
    target->hp += amount;
    if (target->hp > target->max_hp) {
        target->hp = target->max_hp;
    }
    
    return SKILL_OK;
}

int action_gain_block(Entity* e, int amount) {
    if (!e) return SKILL_ERR_PARAM;
    
    /* 应用敏捷加成（从状态系统获取） */
    amount += status_get(e, BUFF_DEXTERITY);
    
    e->block += amount;
    return SKILL_OK;
}

int action_apply_status(Entity* e, StatusType type, int stacks, int turns) {
    return status_apply(e, type, stacks, turns);
}

int action_execute(ActionDef* action, GameState* gs, EventContext* ctx) {
    if (!action || !gs || !ctx) return SKILL_ERR_PARAM;
    
    Entity* source = ctx->source;
    Entity* target = ctx->target;
    
    int value = action->base_value;
    int result = SKILL_OK;
    
    switch (action->type) {
        case ACTION_DEAL_DAMAGE:
            result = action_deal_damage(source, target, value);
            break;
            
        case ACTION_HEAL:
            result = action_heal(target, value);
            break;
            
        case ACTION_GAIN_BLOCK:
            result = action_gain_block(target, value);
            break;
            
        case ACTION_GAIN_ENERGY:
            if (target) target->energy += value;
            break;
            
        case ACTION_LOSE_HP:
            if (target) {
                target->hp -= value;
                if (target->hp < 0) target->hp = 0;
            }
            break;
            
        case ACTION_LOSE_ENERGY:
            if (target) {
                target->energy -= value;
                if (target->energy < 0) target->energy = 0;
            }
            break;
            
        case ACTION_DRAW:
            if (target && value > 0) {
                for (int i = 0; i < value; i++) {
                    if (target->draw_count > 0 && target->hand_count < 64) {
                        target->hand[target->hand_count++] = 
                            target->draw_pile[--target->draw_count];
                    }
                }
            }
            break;
            
        case ACTION_DISCARD:
            if (target && value > 0) {
                for (int i = 0; i < value && target->hand_count > 0; i++) {
                    target->discard_pile[target->discard_count++] = 
                        target->hand[--target->hand_count];
                }
            }
            break;
            
        case ACTION_APPLY_BUFF:
        case ACTION_APPLY_DEBUFF:
            result = action_apply_status(target, action->status_type, 
                                         value, action->status_turns);
            break;
            
        case ACTION_REMOVE_BUFF:
            result = status_remove(target, action->status_type);
            break;
            
        case ACTION_GAIN_STRENGTH:
            result = status_apply(target, BUFF_STRENGTH, value, 0);
            break;
            
        case ACTION_GAIN_DEXTERITY:
            result = status_apply(target, BUFF_DEXTERITY, value, 0);
            break;
            
        case ACTION_SELF_DAMAGE:
            result = action_deal_damage(source, source, value);
            break;
            
        default:
            result = SKILL_OK;
    }
    
    return result;
}

/* ============================================================================
 * 技能激活
 * ============================================================================ */

int skill_instance_activate(SkillInstance* inst, GameState* gs, EventContext* ctx) {
    if (!inst || !gs || !ctx) return SKILL_ERR_PARAM;
    
    SkillDef* def = inst->def;
    if (!def) return SKILL_ERR_PARAM;
    
    /* 检查冷却 */
    if (inst->current_cooldown > 0) {
        inst->current_cooldown--;
        return SKILL_OK;  /* 冷却中，静默跳过 */
    }
    
    /* 检查触发概率 */
    if (def->trigger.chance < 1.0f) {
        float roll = (float)rand() / (float)RAND_MAX;
        if (roll > def->trigger.chance) {
            return SKILL_OK;  /* 概率检查失败 */
        }
    }
    
    /* 检查触发条件 */
    if (!condition_check(&def->trigger.condition, ctx->target, gs)) {
        return SKILL_ERR_COND_FALSE;
    }
    
    /* 应用修正器计算最终值 */
    for (int i = 0; i < def->action_count; i++) {
        ActionDef* action = &def->actions[i];
        
        /* 应用修正器 */
        int final_value = action->base_value;
        int repeat_count = 1;
        
        for (int j = 0; j < def->modifier_count; j++) {
            ModifierDef* mod = &def->modifiers[j];
            
            switch (mod->type) {
                case MODIFIER_ADD_VALUE:
                    final_value += mod->value;
                    break;
                    
                case MODIFIER_MULTIPLY_VALUE:
                    final_value *= mod->value;
                    break;
                    
                case MODIFIER_SET_VALUE:
                    final_value = mod->value;
                    break;
                    
                case MODIFIER_PERCENT_VALUE:
                    final_value = final_value * (100 + mod->value) / 100;
                    break;
                    
                case MODIFIER_REPEAT:
                    repeat_count = mod->value;
                    break;
                    
                case MODIFIER_IF_CONDITION:
                    if (!condition_check(&mod->condition, ctx->target, gs)) {
                        continue;  /* 条件不满足，跳过此动作 */
                    }
                    break;
                    
                case MODIFIER_PER_CONDITION:
                    /* 计算条件满足次数 */
                    final_value += mod->value * mod->value2;
                    break;
                    
                default:
                    break;
            }
        }
        
        /* 执行动作 */
        ActionDef exec_action = *action;
        exec_action.base_value = final_value;
        
        for (int r = 0; r < repeat_count; r++) {
            action_execute(&exec_action, gs, ctx);
        }
    }
    
    /* 设置冷却 */
    if (def->trigger.cooldown > 0) {
        inst->current_cooldown = def->trigger.cooldown;
    }
    
    return SKILL_OK;
}

/* ============================================================================
 * 技能管理
 * ============================================================================ */

int skill_instance_add(Entity* e, SkillDef* def) {
    if (!e || !def) return SKILL_ERR_PARAM;
    
    if (e->skill_count >= 16) return SKILL_ERR_MEM;
    
    /* 检查是否已存在（可叠加） */
    for (int i = 0; i < e->skill_count; i++) {
        if (e->skills[i]->def->id == def->id) {
            if (def->stackable && e->skills[i]->stack_count < def->max_stack) {
                e->skills[i]->stack_count++;
                return SKILL_OK;
            }
            return SKILL_OK;  /* 已存在，不重复添加 */
        }
    }
    
    SkillInstance* inst = skill_instance_create(def, e);
    if (!inst) return SKILL_ERR_MEM;
    
    e->skills[e->skill_count++] = inst;
    return SKILL_OK;
}

int skill_instance_remove(Entity* e, int skill_id) {
    if (!e) return SKILL_ERR_PARAM;
    
    for (int i = 0; i < e->skill_count; i++) {
        if (e->skills[i]->def->id == skill_id) {
            skill_instance_free(e->skills[i]);
            
            /* 移动后面的元素 */
            for (int j = i; j < e->skill_count - 1; j++) {
                e->skills[j] = e->skills[j + 1];
            }
            e->skill_count--;
            
            return SKILL_OK;
        }
    }
    
    return SKILL_ERR_NOT_FOUND;
}

/* ============================================================================
 * 事件系统
 * ============================================================================ */

int event_trigger(GameState* gs, EventContext* ctx) {
    if (!gs || !ctx) return SKILL_ERR_PARAM;
    
    int triggered_count = 0;
    
    /* 遍历所有实体 */
    Entity* e = gs->entities;
    while (e) {
        /* 检查实体的技能 */
        for (int i = 0; i < e->skill_count; i++) {
            SkillInstance* inst = e->skills[i];
            SkillDef* def = inst->def;
            
            /* 检查触发类型匹配 */
            if (def->trigger.type == ctx->trigger_type) {
                /* 设置事件上下文 */
                EventContext skill_ctx = *ctx;
                if (def->actions[0].target.type == TARGET_SELF) {
                    skill_ctx.target = e;
                }
                
                skill_instance_activate(inst, gs, &skill_ctx);
                triggered_count++;
            }
        }
        
        e = e->next;
    }
    
    return triggered_count;
}

/* ============================================================================
 * 工具函数
 * ============================================================================ */

const char* trigger_type_name(TriggerType type) {
    if (type >= 0 && type < sizeof(trigger_names) / sizeof(trigger_names[0])) {
        return trigger_names[type];
    }
    return "Unknown";
}

const char* action_type_name(ActionType type) {
    if (type >= 0 && type < sizeof(action_names) / sizeof(action_names[0])) {
        return action_names[type];
    }
    return "Unknown";
}

const char* modifier_type_name(ModifierType type) {
    if (type >= 0 && type < sizeof(modifier_names) / sizeof(modifier_names[0])) {
        return modifier_names[type];
    }
    return "Unknown";
}

const char* status_type_name(StatusType type) {
    if (type >= 0 && type < sizeof(status_names) / sizeof(status_names[0])) {
        return status_names[type];
    }
    return "Unknown";
}

const char* skill_version(void) {
    return "1.0.0";
}
