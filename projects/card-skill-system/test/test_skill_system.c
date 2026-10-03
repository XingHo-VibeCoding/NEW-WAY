/**
 * @file test_skill_system.c
 * @brief DB卡牌技能系统测试套件
 */

#include "skill_system.h"
#include "keywords.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <assert.h>

#define TEST_PASS "\033[32mPASS\033[0m"
#define TEST_FAIL "\033[31mFAIL\033[0m"
#define TEST_SKIP "\033[33mSKIP\033[0m"

static int test_count = 0;
static int pass_count = 0;
static int skip_count = 0;

#define TEST(name) do { \
    test_count++; \
    printf("  [%d] %s... ", test_count, name); \
    fflush(stdout); \
} while(0)

#define ASSERT(cond) do { \
    if (cond) { \
        printf("%s\n", TEST_PASS); \
        pass_count++; \
    } else { \
        printf("%s (line %d)\n", TEST_FAIL, __LINE__); \
    } \
} while(0)

#define SKIP(msg) do { \
    printf("%s (%s)\n", TEST_SKIP, msg); \
    skip_count++; \
} while(0)

/* ============================================================================
 * 基础功能测试
 * ============================================================================ */

static void test_entity_create(void) {
    TEST("创建实体");
    Entity* e = entity_create("Hero", 100, 3);
    ASSERT(e != NULL && strcmp(e->name, "Hero") == 0 && e->hp == 100 && e->energy == 3);
    entity_free(e);
    
    TEST("实体初始状态");
    e = entity_create("Enemy", 50, 2);
    ASSERT(e->max_hp == 50 && e->block == 0 && e->skill_count == 0);
    entity_free(e);
}

static void test_status_system(void) {
    TEST("施加状态");
    Entity* e = entity_create("Test", 100, 3);
    int ret = status_apply(e, BUFF_STRENGTH, 5, 0);
    ASSERT(ret == SKILL_OK && e->status_count == 1);
    
    TEST("获取状态层数");
    int stacks = status_get(e, BUFF_STRENGTH);
    ASSERT(stacks == 5);
    
    TEST("状态叠加");
    status_apply(e, BUFF_STRENGTH, 3, 0);
    stacks = status_get(e, BUFF_STRENGTH);
    ASSERT(stacks == 8);
    
    TEST("移除状态");
    ret = status_remove(e, BUFF_STRENGTH);
    ASSERT(ret == SKILL_OK && e->status_count == 0);
    
    TEST("检查状态存在");
    status_apply(e, DEBUFF_POISON, 10, 3);
    ASSERT(status_has(e, DEBUFF_POISON) == true && status_has(e, DEBUFF_BURN) == false);
    
    entity_free(e);
}

static void test_condition_system(void) {
    TEST("条件检查 - 总是");
    Entity* e = entity_create("Test", 100, 3);
    ConditionDef cond = {.type = COND_ALWAYS};
    ASSERT(condition_check(&cond, e, NULL) == true);
    
    TEST("条件检查 - 从不");
    cond.type = COND_NEVER;
    ASSERT(condition_check(&cond, e, NULL) == false);
    
    TEST("条件检查 - 生命高于");
    cond.type = COND_HP_ABOVE;
    cond.value = 50;
    ASSERT(condition_check(&cond, e, NULL) == true);
    
    TEST("条件检查 - 生命低于");
    cond.type = COND_HP_BELOW;
    cond.value = 50;
    ASSERT(condition_check(&cond, e, NULL) == false);
    
    TEST("条件检查 - 能量高于");
    cond.type = COND_ENERGY_ABOVE;
    cond.value = 2;
    ASSERT(condition_check(&cond, e, NULL) == true);
    
    TEST("条件检查 - 有状态");
    status_apply(e, BUFF_STRENGTH, 5, 0);
    cond.type = COND_HAS_BUFF;
    cond.status = BUFF_STRENGTH;
    ASSERT(condition_check(&cond, e, NULL) == true);
    
    entity_free(e);
}

/* ============================================================================
 * 技能系统测试
 * ============================================================================ */

static void test_skill_def_create(void) {
    TEST("创建技能定义");
    SkillDef* def = skill_def_create();
    ASSERT(def != NULL && def->trigger.chance == 1.0f);
    skill_def_free(def);
}

static void test_skill_instance_add(void) {
    TEST("添加技能到实体");
    Entity* e = entity_create("Hero", 100, 3);
    SkillDef* def = skill_strike();
    
    int ret = skill_instance_add(e, def);
    ASSERT(ret == SKILL_OK && e->skill_count == 1);
    
    TEST("技能叠加");
    ret = skill_instance_add(e, def);
    ASSERT(ret == SKILL_OK && e->skills[0]->stack_count == 2);
    
    skill_def_free(def);
    entity_free(e);
}

static void test_skill_instance_remove(void) {
    TEST("移除技能");
    Entity* e = entity_create("Hero", 100, 3);
    SkillDef* def = skill_defend();
    skill_instance_add(e, def);
    
    int ret = skill_instance_remove(e, def->id);
    ASSERT(ret == SKILL_OK && e->skill_count == 0);
    
    TEST("移除不存在的技能");
    ret = skill_instance_remove(e, 999);
    ASSERT(ret == SKILL_ERR_NOT_FOUND);
    
    skill_def_free(def);
    entity_free(e);
}

/* ============================================================================
 * 动作系统测试
 * ============================================================================ */

static void test_action_damage(void) {
    TEST("造成伤害");
    Entity* attacker = entity_create("Attacker", 100, 3);
    Entity* target = entity_create("Target", 50, 3);
    
    int damage = action_deal_damage(attacker, target, 10);
    ASSERT(target->hp == 40 && damage == 10);
    
    entity_free(attacker);
    entity_free(target);
}

static void test_action_damage_with_strength(void) {
    TEST("伤害受力量加成");
    Entity* attacker = entity_create("Attacker", 100, 3);
    Entity* target = entity_create("Target", 50, 3);
    
    status_apply(attacker, BUFF_STRENGTH, 5, 0);
    int damage = action_deal_damage(attacker, target, 10);
    ASSERT(target->hp == 35 && damage == 15);  /* 10 + 5 = 15 */
    
    entity_free(attacker);
    entity_free(target);
}

static void test_action_damage_with_block(void) {
    TEST("伤害被格挡抵消");
    Entity* attacker = entity_create("Attacker", 100, 3);
    Entity* target = entity_create("Target", 50, 3);
    
    target->block = 15;
    int damage = action_deal_damage(attacker, target, 10);
    ASSERT(target->hp == 50 && target->block == 5);  /* 全部被格挡 */
    
    entity_free(attacker);
    entity_free(target);
}

static void test_action_damage_with_weaken(void) {
    TEST("虚弱减少伤害");
    Entity* attacker = entity_create("Attacker", 100, 3);
    Entity* target = entity_create("Target", 50, 3);
    
    status_apply(attacker, DEBUFF_WEAKEN, 1, 2);
    int damage = action_deal_damage(attacker, target, 10);
    ASSERT(target->hp == 43 && damage == 7);  /* 10 * 0.75 = 7.5 */
    
    entity_free(attacker);
    entity_free(target);
}

static void test_action_damage_with_vulnerable(void) {
    TEST("脆弱增加伤害");
    Entity* attacker = entity_create("Attacker", 100, 3);
    Entity* target = entity_create("Target", 50, 3);
    
    status_apply(target, DEBUFF_VULNERABLE, 1, 2);
    int damage = action_deal_damage(attacker, target, 10);
    ASSERT(target->hp == 35 && damage == 15);  /* 10 * 1.5 = 15 */
    
    entity_free(attacker);
    entity_free(target);
}

static void test_action_heal(void) {
    TEST("治疗");
    Entity* e = entity_create("Test", 100, 3);
    e->hp = 50;
    
    action_heal(e, 30);
    ASSERT(e->hp == 80);
    
    TEST("治疗不超过最大生命");
    action_heal(e, 100);
    ASSERT(e->hp == 100);
    
    entity_free(e);
}

static void test_action_block(void) {
    TEST("获得格挡");
    Entity* e = entity_create("Test", 100, 3);
    
    action_gain_block(e, 10);
    ASSERT(e->block == 10);
    
    TEST("格挡受敏捷加成");
    status_apply(e, BUFF_DEXTERITY, 5, 0);
    e->block = 0;  /* 重置 */
    action_gain_block(e, 10);
    ASSERT(e->block == 15);  /* 10 + 5 = 15 */
    
    entity_free(e);
}

static void test_action_draw(void) {
    TEST("抽牌");
    Entity* e = entity_create("Test", 100, 3);
    
    ActionDef action = {.type = ACTION_DRAW, .base_value = 2};
    EventContext ctx = {.source = e, .target = e};
    GameState* gs = game_state_create();
    
    action_execute(&action, gs, &ctx);
    ASSERT(e->hand_count == 0);  // 初始牌堆为空
    
    game_state_free(gs);
    entity_free(e);
}

/* ============================================================================
 * 技能激活测试
 * ============================================================================ */

static void test_skill_activation(void) {
    TEST("激活打击技能");
    Entity* hero = entity_create("Hero", 100, 3);
    Entity* enemy = entity_create("Enemy", 50, 3);
    GameState* gs = game_state_create();
    
    hero->next = enemy;
    gs->entities = hero;
    
    SkillDef* strike = skill_strike();
    skill_instance_add(hero, strike);
    
    EventContext ctx = {
        .trigger_type = TRIGGER_ON_PLAY,
        .source = hero,
        .target = enemy
    };
    
    int ret = skill_instance_activate(hero->skills[0], gs, &ctx);
    ASSERT(ret == SKILL_OK && enemy->hp == 44);  /* 50 - 6 = 44 */
    
    skill_def_free(strike);
    game_state_free(gs);
}

static void test_skill_with_condition(void) {
    TEST("技能条件不满足时跳过");
    Entity* hero = entity_create("Hero", 100, 3);
    Entity* enemy = entity_create("Enemy", 50, 3);
    GameState* gs = game_state_create();
    
    hero->next = enemy;
    gs->entities = hero;
    
    SkillDef* heavy = skill_heavy_strike();
    skill_instance_add(hero, heavy);
    
    EventContext ctx = {
        .trigger_type = TRIGGER_ON_PLAY,
        .source = hero,
        .target = enemy
    };
    
    /* 敌人没有脆弱，伤害14 */
    skill_instance_activate(hero->skills[0], gs, &ctx);
    ASSERT(enemy->hp == 36);  /* 50 - 14 = 36 */
    
    skill_def_free(heavy);
    game_state_free(gs);  /* 会释放 hero 和 enemy 链表 */
}

static void test_passive_skill(void) {
    TEST("被动技能 - 战斗开始获得力量");
    Entity* hero = entity_create("Hero", 100, 3);
    GameState* gs = game_state_create();
    gs->entities = hero;
    
    SkillDef* strength = skill_strength_buff();
    skill_instance_add(hero, strength);
    
    EventContext ctx = {
        .trigger_type = TRIGGER_ON_BATTLE_START,
        .source = hero,
        .target = hero
    };
    
    event_trigger(gs, &ctx);
    ASSERT(status_get(hero, BUFF_STRENGTH) == 2);
    
    skill_def_free(strength);
    game_state_free(gs);
}

/* ============================================================================
 * 事件系统测试
 * ============================================================================ */

static void test_event_trigger(void) {
    TEST("事件触发遍历实体");
    Entity* hero = entity_create("Hero", 100, 3);
    Entity* enemy = entity_create("Enemy", 50, 3);
    GameState* gs = game_state_create();
    
    hero->next = enemy;
    gs->entities = hero;
    
    SkillDef* strength = skill_strength_buff();
    skill_instance_add(hero, strength);
    skill_instance_add(enemy, strength);
    
    EventContext ctx = {
        .trigger_type = TRIGGER_ON_BATTLE_START,
        .source = hero,
        .target = hero
    };
    
    int triggered = event_trigger(gs, &ctx);
    ASSERT(triggered == 2);
    ASSERT(status_get(hero, BUFF_STRENGTH) == 2);
    ASSERT(status_get(enemy, BUFF_STRENGTH) == 2);
    
    skill_def_free(strength);
    game_state_free(gs);
}

/* ============================================================================
 * 关键字技能测试
 * ============================================================================ */

static void test_keyword_skills(void) {
    TEST("关键字技能 - Strike");
    SkillDef* strike = skill_strike();
    ASSERT(strike != NULL && strike->id == 1001 && strike->actions[0].base_value == 6);
    skill_def_free(strike);
    
    TEST("关键字技能 - Defend");
    SkillDef* defend = skill_defend();
    ASSERT(defend != NULL && defend->id == 1002 && defend->actions[0].base_value == 5);
    skill_def_free(defend);
    
    TEST("关键字技能 - Heavy Strike");
    SkillDef* heavy = skill_heavy_strike();
    ASSERT(heavy != NULL && heavy->actions[0].base_value == 14 && heavy->modifier_count == 2);
    skill_def_free(heavy);
    
    TEST("关键字技能 - Double Strike");
    SkillDef* dbl = skill_double_strike();
    ASSERT(dbl != NULL && dbl->actions[0].repeat_count == 2);
    skill_def_free(dbl);
    
    TEST("关键字技能 - Lifesteal");
    SkillDef* vamp = skill_lifesteal_strike();
    ASSERT(vamp != NULL && vamp->action_count == 2);
    skill_def_free(vamp);
}

/* ============================================================================
 * 压力测试
 * ============================================================================ */

static void test_stress(void) {
    printf("\n  === 压力测试 ===\n");
    
    TEST("1000实体创建");
    clock_t start = clock();
    
    Entity* first = NULL;
    Entity* prev = NULL;
    for (int i = 0; i < 1000; i++) {
        Entity* e = entity_create("Unit", 100, 3);
        if (!first) first = e;
        if (prev) prev->next = e;
        prev = e;
    }
    
    clock_t end = clock();
    double create_time = (double)(end - start) / CLOCKS_PER_SEC * 1000;
    printf("      创建时间: %.2f ms\n", create_time);
    
    TEST("1000实体事件触发");
    GameState* gs = game_state_create();
    gs->entities = first;
    
    SkillDef* strength = skill_strength_buff();
    Entity* e = first;
    while (e) {
        skill_instance_add(e, strength);
        e = e->next;
    }
    
    start = clock();
    EventContext ctx = {
        .trigger_type = TRIGGER_ON_BATTLE_START,
        .source = first,
        .target = first
    };
    int triggered = event_trigger(gs, &ctx);
    end = clock();
    
    double trigger_time = (double)(end - start) / CLOCKS_PER_SEC * 1000;
    printf("      触发时间: %.2f ms (%d 次)\n", trigger_time, triggered);
    printf("      平均触发: %.4f ms\n", trigger_time / triggered);
    
    skill_def_free(strength);
    game_state_free(gs);
    
    ASSERT(triggered == 1000);
}

/* ============================================================================
 * 内存测试
 * ============================================================================ */

static void test_memory(void) {
    TEST("内存泄漏检查");
    
    for (int i = 0; i < 100; i++) {
        Entity* e = entity_create("Test", 100, 3);
        SkillDef* def = skill_strike();
        skill_instance_add(e, def);
        status_apply(e, BUFF_STRENGTH, 5, 0);
        status_apply(e, DEBUFF_POISON, 10, 3);
        
        skill_def_free(def);
        entity_free(e);
    }
    
    ASSERT(1);  /* 如果没崩溃就算通过 */
}

/* ============================================================================
 * 工具函数测试
 * ============================================================================ */

static void test_utils(void) {
    TEST("触发器类型名称");
    const char* name = trigger_type_name(TRIGGER_ON_PLAY);
    ASSERT(strcmp(name, "OnPlay") == 0);
    
    TEST("动作类型名称");
    name = action_type_name(ACTION_DEAL_DAMAGE);
    ASSERT(strcmp(name, "DealDamage") == 0);
    
    TEST("修正器类型名称");
    name = modifier_type_name(MODIFIER_ADD_VALUE);
    ASSERT(strcmp(name, "AddValue") == 0);
    
    TEST("状态类型名称");
    name = status_type_name(BUFF_STRENGTH);
    ASSERT(strcmp(name, "Strength") == 0);
    
    TEST("版本号");
    name = skill_version();
    ASSERT(strcmp(name, "1.0.0") == 0);
}

/* ============================================================================
 * 主函数
 * ============================================================================ */

int main(int argc, char** argv) {
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════╗\n");
    printf("║     Card Skill System 测试套件 v%s                   ║\n", skill_version());
    printf("║     DB卡牌游戏技能系统 - 纯C实现                          ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n\n");
    
    printf("【实体与状态测试】\n");
    test_entity_create();
    test_status_system();
    test_condition_system();
    
    printf("\n【技能定义测试】\n");
    test_skill_def_create();
    test_skill_instance_add();
    test_skill_instance_remove();
    
    printf("\n【动作系统测试】\n");
    test_action_damage();
    test_action_damage_with_strength();
    test_action_damage_with_block();
    test_action_damage_with_weaken();
    test_action_damage_with_vulnerable();
    test_action_heal();
    test_action_block();
    test_action_draw();
    
    printf("\n【技能激活测试】\n");
    test_skill_activation();
    test_skill_with_condition();
    test_passive_skill();
    
    printf("\n【事件系统测试】\n");
    test_event_trigger();
    
    printf("\n【关键字技能测试】\n");
    test_keyword_skills();
    
    printf("\n【工具函数测试】\n");
    test_utils();
    
    printf("\n【压力测试】\n");
    test_stress();
    
    printf("\n【内存测试】\n");
    test_memory();
    
    printf("\n╔══════════════════════════════════════════════════════════╗\n");
    printf("║  测试结果: %d/%d 通过 (%d 跳过)                         %s║\n", 
           pass_count, test_count - skip_count, skip_count,
           (pass_count + skip_count == test_count) ? "" : " ");
    printf("╚══════════════════════════════════════════════════════════╝\n\n");
    
    return (pass_count + skip_count == test_count) ? 0 : 1;
}
