# Card Skill System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Language: C](https://img.shields.io/badge/Language-C-blue.svg)](https://en.wikipedia.org/wiki/C_(programming_language))

> **触发器 + 动作 + 修正器 = 无限可能**

通用DB卡牌游戏技能系统，纯C实现。支持主流牌库构筑游戏（杀戮尖塔、怪物火车、Inscryption等）和Roguelike元素。

## 核心特性

| 特性 | 说明 |
|------|------|
| 🎯 **三原子设计** | Trigger + Action + Modifier = Skill |
| 🔄 **事件驱动** | 20+ 触发时机，自动分发 |
| ⚡ **高性能** | 位运算 + 数组索引，零动态分配 |
| 🧩 **强扩展** | 30+ 动作类型，18+ 修正器 |
| 📦 **零依赖** | 纯C99，嵌入式友好 |

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    三层架构                                  │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: 数据层 (Data)                                      │
│   SkillDef, TriggerDef, ActionDef, ModifierDef              │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: 实例层 (Instance)                                  │
│   SkillInstance, Entity, StatusInstance                     │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: 上下文层 (Context)                                 │
│   GameState, EventContext, Resolver                         │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 基本用法

```c
#include "skill_system.h"
#include "keywords.h"

int main() {
    // 创建游戏状态
    GameState* gs = game_state_create();
    
    // 创建角色
    Entity* hero = entity_create("Hero", 100, 3);
    Entity* enemy = entity_create("Enemy", 50, 3);
    hero->next = enemy;
    gs->entities = hero;
    
    // 添加技能
    SkillDef* strike = skill_strike();
    skill_instance_add(hero, strike);
    
    // 触发技能
    EventContext ctx = {
        .trigger_type = TRIGGER_ON_PLAY,
        .source = hero,
        .target = enemy
    };
    skill_instance_activate(hero->skills[0], gs, &ctx);
    
    // 清理
    skill_def_free(strike);
    game_state_free(gs);
    return 0;
}
```

### 自定义技能

```c
SkillDef* my_skill = skill_def_create();
my_skill->id = 9999;
strcpy(my_skill->name, "Fireball");
strcpy(my_skill->description, "造成20点伤害，灼烧目标");

my_skill->trigger.type = TRIGGER_ON_PLAY;

// 动作1: 造成伤害
my_skill->actions[0].type = ACTION_DEAL_DAMAGE;
my_skill->actions[0].base_value = 20;
my_skill->actions[0].target.type = TARGET_ENEMY;

// 动作2: 施加灼烧
my_skill->actions[1].type = ACTION_APPLY_DEBUFF;
my_skill->actions[1].status_type = DEBUFF_BURN;
my_skill->actions[1].base_value = 5;  // 5层
my_skill->actions[1].status_turns = 3;
my_skill->actions[1].target.type = TARGET_ENEMY;

my_skill->action_count = 2;
my_skill->tags = TAG_ATTACK | TAG_FIRE;
```

## 核心 API

### 实体管理

| 函数 | 说明 |
|------|------|
| `entity_create(name, hp, energy)` | 创建实体 |
| `entity_free(e)` | 销毁实体 |
| `status_apply(e, type, stacks, turns)` | 施加状态 |
| `status_remove(e, type)` | 移除状态 |
| `status_get(e, type)` | 获取状态层数 |
| `status_has(e, type)` | 检查状态存在 |

### 技能管理

| 函数 | 说明 |
|------|------|
| `skill_def_create()` | 创建技能定义 |
| `skill_def_free(def)` | 销毁技能定义 |
| `skill_instance_add(e, def)` | 添加技能到实体 |
| `skill_instance_remove(e, id)` | 移除技能 |
| `skill_instance_activate(inst, gs, ctx)` | 激活技能 |

### 事件系统

| 函数 | 说明 |
|------|------|
| `event_trigger(gs, ctx)` | 触发事件 |

## 触发器类型

| 类型 | 说明 |
|------|------|
| `TRIGGER_ON_PLAY` | 出牌时 |
| `TRIGGER_ON_DRAW` | 抽牌时 |
| `TRIGGER_ON_DISCARD` | 弃牌时 |
| `TRIGGER_ON_EXHAUST` | 消耗时 |
| `TRIGGER_ON_DAMAGE` | 造成伤害时 |
| `TRIGGER_ON_DAMAGE_TAKEN` | 受到伤害时 |
| `TRIGGER_ON_KILL` | 击杀时 |
| `TRIGGER_ON_TURN_START` | 回合开始 |
| `TRIGGER_ON_TURN_END` | 回合结束 |
| `TRIGGER_ON_BATTLE_START` | 战斗开始 |

## 动作类型

### 资源类
| 动作 | 说明 |
|------|------|
| `ACTION_DEAL_DAMAGE` | 造成伤害 |
| `ACTION_HEAL` | 治疗 |
| `ACTION_GAIN_BLOCK` | 获得格挡 |
| `ACTION_GAIN_ENERGY` | 获得能量 |

### 牌库类
| 动作 | 说明 |
|------|------|
| `ACTION_DRAW` | 抽牌 |
| `ACTION_DISCARD` | 弃牌 |
| `ACTION_EXHAUST` | 消耗 |
| `ACTION_CREATE_CARD` | 生成卡牌 |

### 状态类
| 动作 | 说明 |
|------|------|
| `ACTION_APPLY_BUFF` | 施加增益 |
| `ACTION_APPLY_DEBUFF` | 施加减益 |
| `ACTION_GAIN_STRENGTH` | 获得力量 |
| `ACTION_GAIN_DEXTERITY` | 获得敏捷 |

## 修正器类型

| 修正器 | 说明 |
|------|------|
| `MODIFIER_ADD_VALUE` | +N |
| `MODIFIER_MULTIPLY_VALUE` | ×N |
| `MODIFIER_SET_VALUE` | =N |
| `MODIFIER_PERCENT_VALUE` | +N% |
| `MODIFIER_IF_CONDITION` | 条件满足时 |
| `MODIFIER_REPEAT` | 重复N次 |
| `MODIFIER_TARGET_ALL` | 全体目标 |

## 关键字系统

预定义技能工厂：

```c
skill_strike()        // 打击：6伤害
skill_defend()        // 防御：5格挡
skill_heavy_strike()  // 重击：14伤害，脆弱时翻倍
skill_double_strike() // 双击：5伤害×2次
skill_lifesteal_strike() // 吸血：8伤害+8治疗
skill_strength_buff() // 力量：战斗开始+2力量
skill_burn()          // 燃烧：3层灼烧
skill_draw()          // 抽牌：抽2张
skill_discard()       // 弃牌：弃1张+1能量
```

## 构建

```bash
# 编译库
make

# 运行测试
make test

# 调试版本
make debug

# 内存检查
make valgrind
```

## 测试覆盖

- ✅ 实体创建与销毁
- ✅ 状态系统（施加/叠加/移除）
- ✅ 条件检查（生命/能量/状态）
- ✅ 伤害计算（力量/虚弱/脆弱/格挡）
- ✅ 技能激活与触发
- ✅ 事件系统分发
- ✅ 关键字技能
- ✅ 压力测试（1000实体）

## 游戏兼容性

| 游戏机制 | 支持 |
|----------|------|
| 杀戮尖塔 卡牌系统 | ✅ |
| 怪物火车 房间系统 | ✅ |
| Inscryption 牺牲系统 | ✅ |
| Dream Quest 永久卡 | ✅ |
| 坠落秩序 时间线 | ✅ |

## License

MIT License - 自由使用、修改、分发。

---

*Made with ❤️ by kuuila*
