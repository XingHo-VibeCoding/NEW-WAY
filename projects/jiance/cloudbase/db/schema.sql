-- =============================================================================
-- schema.sql · 建表脚本
-- 项目：简册 / Ledger and Career
-- 版本：v1.0 ｜ 日期：2026-10-02（Day 16 · 板块 ① 数据模型设计）
-- 归属：Day 16 任务
--
-- 字段依据：../api-contract.md v1.1（唯一权威）
--         ../../../TECH_DESIGN.md 第五节（字段原始出处 5.1 / 5.2 / 5.3 / 5.4）
--
-- 执行位置：CloudBase 控制台 → SQL 空间管理 / 或「数据库 → SQL 编辑器」
-- 执行方式：整份文件复制进去，点「执行」（或按Ctrl+Enter）
-- 可重复执行：本脚本开头DROP、结尾不动数据，可反复跑（详见第0 节）
-- =============================================================================
--
-- 【今天要掌握的知识点】你的两张表分别存什么？靠哪个字段关联？
--
--   expenses（收支流水）  →  每一笔钱：日期、金额、收入还是支出、分类、备注
--   entries  （工作经历）  →  每一条经历：起止时间、做成了什么、公司、职位、成果
--
--   它们之间 **没有任何关联字段**。不靠外键、不靠 id 互指、互不知道对方存在。
--
--   为什么？因为业务上它们是「并列」的两类记录，不是「从属」。
--   你不会说「这笔38 块的午饭，属于某条工作经历」——它们各管各的。
--
--   对照课程的打卡案例（帮你看清差别）：
--     打卡案例：checkins.day_id → plan_days.id    这是「从属」：打卡属于某天计划
--     简册：    expenses ←─?─→ entries            这是「并列」：互不隶属
--
--   一句话记法：「有外键 / 没外键」不是技术高低的差别，是业务关系的如实反映。
--   硬加外键 = 编造一条不存在的业务规则。
--
-- =============================================================================
-- 【本项目的约束取舍】（Day 16 拍板）
--
--   建：主键PRIMARY KEY、NOT NULL、CHECK约束、索引
--   不建：外键FOREIGN KEY —— 4 张表没有任何一对有从属关系（理由见上）
--   不建：账号归属字段 / RLS 行级策略 —— 第 3 周不做账号体系（api-contract 第 89 行）
--
--   字段级校验（金额 > 0、endDate 不得早于 startDate 等）本脚本只用 CHECK
--   兜住「明显错」的那部分；**完整校验由 Day 17 起的云函数负责**，
--   清单见 api-contract 第五节每个接口的「错误」表，已全部写好。
-- =============================================================================


-- =============================================================================
-- 第 0 节 · 为什么可以反复执行
-- =============================================================================
-- PostgreSQL 的 CREATE TABLE 如果表已存在会直接报错。
-- 所以本脚本每一段都用「先 DROP IF EXISTS（如果存在就删掉）→ 再 CREATE（重建）」，
-- 你可以跑第二遍、第三遍，不会报「表已存在」。
--
-- ⚠️ 代价：每次执行本脚本会 **清空这4 张表的数据**。
--    今天是开发期，正好需要反复重建。**上线之后绝不能这么干**——
--    那时要改表结构得另写 ALTER TABLE 迁移脚本，不能DROP 重建。
-- =============================================================================


-- =============================================================================
-- 第 1 节 · 建表
-- =============================================================================

-- 1-1. expenses —— 收支流水（账簿面：记一笔 + 底牌页）
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.expenses CASCADE;
CREATE TABLE public.expenses (
  -- 【主键】用文本，不用 PostgreSQL 默认的自增数字。理由见第 2.1 节。
  -- 前缀 ex_ = expense 的缩写，混在多条记录里一眼认出是哪张表的。
  id          text        PRIMARY KEY,

  -- 【为什么存 text 而不存 date 类型】
  -- TECH_DESIGN 5.4 明写「抽屉只认文字」——前端已经按字符串在读了，
  -- 换成date 类型等于让前端全部重写。
  -- 另外 YYYY-MM-DD 这种格式，**字典序正好等于时间序**，
  -- 所以按日期排序、筛选，字符串完全够用。
  -- CHECK 约束保证格式不会写歪（防止有人存成 2026/10/02 或 26-10-02）。
  date        text        NOT NULL
                        CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),

  -- 【为什么必须数字，不能存字符串】
  -- 底牌页要算「本月收入 / 支出 / 结余」三个数，数据库要 SUM 求和。
  -- 字符串加不了法。
  -- numeric(12,2) = 最多 12 位整数 + 2 位小数，**精确小数，不丢精度**
  -- （用浮点数会冒出0.1+0.2=0.30000000000000004 这种问题）。
  amount      numeric(12,2) NOT NULL
                        CHECK (amount > 0),

  -- 为什么存中文「收入」/「支出」而不是 income/expense
  -- api-contract 第 51 行：前端单选框的 value 就是中文，
  -- 改成英文等于前后端各说一门话。收入支出靠这个字段区分，**不靠正负号**。
  type        text        NOT NULL
                        CHECK (type IN ('收入', '支出')),

  -- 固定选项之一。存中文而不是编号 0/1/2 —— 存编号还得在前端配一张对照表再翻译，
  -- 翻译的活儿白丢给前端。
  -- 跨字段 CHECK：分类必须属于「对应 type」的那一组（api-contract 第 232-236 行）。
  category    text        NOT NULL
                        CHECK (
                          (type = '支出' AND category IN ('餐饮','交通','房租','购物','医疗','娱乐','其他'))
                       OR (type = '收入' AND category IN ('工资','兼职','理财收益','其他'))
                        ),

  -- 备注，可能为空。varchar(50) 对应「不超过 50 字」的前端限制，
  -- 数据库层先拦一道，不合格的将来由云函数返回 400。
  note        varchar(50),

  -- 创建时间：ISO 8601 文本。跟 date 同理，前端按文字读。
  created_at  text        NOT NULL
                        CHECK (created_at ~ '^\d{4}-\d{2}-\d{2}T[\d:.]+Z$'),

  -- 最后修改时间。**新增时和 created_at 相同；每次编辑只刷新这一个**。
  -- 它是「这条最后什么时候被改过」的凭据。
  updated_at  text        NOT NULL
                        CHECK (updated_at ~ '^\d{4}-\d{2}-\d{2}T[\d:.]+Z$')
);
COMMENT ON TABLE public.expenses IS '收支流水。对应「记一笔」页与「底牌页」的月度三数';

-- 索引：给第2 号接口 GET /api/expenses 用（按 date 从晚到早排）
-- 索引 = 书的目录。不建的话，数据库找「10 月 2 日那笔账」得一条一条翻。
-- 为什么这个字段特别值：15 个接口里有 3 个「列表读取」接口要排序，
-- 这是第一个。索引不是随手加的，是照接口清单一个个对出来的。
CREATE INDEX idx_expenses_date ON public.expenses (date DESC);


-- 1-2. entries —— 工作经历（简历面：记一条 + 简历预览）
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.entries CASCADE;
CREATE TABLE public.entries (
  id          text        PRIMARY KEY,          -- 前缀 en_ = entry

  start_date  text        NOT NULL
                        CHECK (start_date ~ '^\d{4}-\d{2}-\d{2}$'),

  -- 【本表最容易踩的坑】
  -- endDate 不填 = 到现在还在做，这里存 **空字符串 ''**，不存 NULL。
  -- 跟抽屉里「不填 = 到现在」的现状保持一致（api-contract 第 320 行）。
  -- 为什么不存 NULL：存 NULL 的话前端每次读都要写 `x || ''` 兜一道，
  -- 两个地方口径不一致就容易出 bug。
  -- 排序规则第 2 条「还在做的排最前」完全靠这个约定支撑。
  end_date    text        NOT NULL DEFAULT ''
                        CHECK (end_date = '' OR end_date ~ '^\d{4}-\d{2}-\d{2}$'),

  -- 做成了什么，一句话。这是经历的核心字段。
  content     text        NOT NULL,

  -- 公司 / 团队。**为什么存字符串不关联「公司表」？**
  -- 公司名只是简历上要显示的一个字，没有「公司」这个业务实体，
  -- 为它单独建一张表属于凭空造需求。
  org         text,
  role        text,

  -- 量化成果。字段名就叫 result，不叫 achievement 也不叫 outcome——
  -- 改名等于前端要改（api-contract 第 48 行）。
  result      text,

  created_at  text        NOT NULL
                        CHECK (created_at ~ '^\d{4}-\d{2}-\d{2}T[\d:.]+Z$'),
  updated_at  text        NOT NULL
                        CHECK (updated_at ~ '^\d{4}-\d{2}-\d{2}T[\d:.]+Z$'),

  -- 业务规则：填了结束时间，就必须晚于或等于开始时间。
  -- api-contract 第 317 行：endDate 早于 startDate 要返回 400。
  -- 这里用 CHECK 先在数据库层拦一道。
  CONSTRAINT ck_entries_date_order
    CHECK (end_date = '' OR end_date >= start_date)
);
COMMENT ON TABLE public.entries IS '工作经历。对应「记一条」页与「简历预览」页；end_date 为空串 = 还在做';

-- 索引：给第 7 号接口 GET /api/entries 用（排序规则第 1 条就是按 endDate 从晚到早）
CREATE INDEX idx_entries_end_date ON public.entries (end_date DESC);


-- 1-3. profile —— 个人参数（底牌页 + 简历抬头）
-- -----------------------------------------------------------------------------
-- 【本表是单行表】全库永远只有 1 条记录。
-- 原因：第 3 周不做账号体系（api-contract 第 89 行）——没有「用户」这个概念，
-- 所以也就没有「这个参数属于谁」的问题。
DROP TABLE IF EXISTS public.profile CASCADE;
CREATE TABLE public.profile (
  -- 固定写死这个值。因为是单行表，得有个锁死的名字；
  -- 不固定的话每跑一次 seed 就多一行，「永远只有一条」的口径就破了。
  id                text        PRIMARY KEY
                        CHECK (id = 'profile_singleton')
                        DEFAULT 'profile_singleton',

  -- 可动用的钱（能立刻拿出来花的）。
  -- 为什么数字：要参与「还能撑几个月 = 可动用存款 ÷ 月均支出」这个除法。
  savings           numeric(12,2)  NOT NULL DEFAULT 0
                        CHECK (savings >= 0),

  -- 手填的月均支出。**允许 NULL 的理由**（api-contract 第 351 行）：
  -- NULL 的含义是「我没手填，请前端按近 3 个自然月自动算」。
  -- 绝对不能存 0——0 会被当成「月均支出 0 元」，除法直接崩。
  monthly_expense   numeric(12,2)
                        CHECK (monthly_expense IS NULL OR monthly_expense >= 0),

  -- 姓名。**不参与任何计算**，只给简历预览页当抬头。选填，≤20 字。
  name              varchar(20),

  -- 【红线字段】联系方式。只用于本机展示与打印简历，
  -- **不得拼进任何发往大模型的请求体**（api-contract 第 374 行、AGENTS 附三第 5 条）。
  -- 选填，≤40 字。种子数据里留 NULL。
  contact           varchar(40),

  -- 目标职位。不参与计算，只显示在底牌页。选填，≤20 字。
  target_role       varchar(20),

  updated_at         text          NOT NULL
                        CHECK (updated_at ~ '^\d{4}-\d{2}-\d{2}T[\d:.]+Z$')
);
COMMENT ON TABLE public.profile IS '个人参数，单行表，全库永远只有 1 条（id 固定 profile_singleton）';
COMMENT ON COLUMN public.profile.contact IS '联系方式。红线：只用于本机展示与打印，禁止发往大模型';


-- 1-4. matches —— 岗位匹配快照（岗位匹配页）
-- -----------------------------------------------------------------------------
-- 【本表两个特殊之处】
--   ① 不设 updated_at，也不提供 PUT 接口 —— 快照**只增不改**（api-contract 第 421 行）。
--      要「改」就删了重存。这是有意为之，写下来防止后面有人顺手加个 PUT。
--   ② jd 和 result 存**全文正文**，不是外键。原因见下方注释。
DROP TABLE IF EXISTS public.matches CASCADE;
CREATE TABLE public.matches (
  id          text        PRIMARY KEY,          -- 前缀 ma_ = match

  -- 岗位名称。**为空时前端存的是中文字面量「（未填岗位名称）」**，
  -- 后端保持原样存，不要自作主张改成空串（api-contract 第 94 行）。
  title       text,
  company     text,
  city        text,

  -- 【为什么是字符串不是数字？】"15-20K" 是**区间文字**，
  -- 不是能加减的数。存数字就丢了「K」和区间语义。
  salary      varchar(32),
  edu         varchar(32),

  -- 【本表最核心的两个字段，也是「零外键」的理由所在】
  --
  -- jd 和 result 存的是**当时的完整文字副本**，不是指向别的记录的编号。
  -- api-contract 第 413 行写得很直接：「用户以后改了表单，
  -- 历史记录不该跟着变，所以 jd / result 是正文，不是外键。」
  --
  -- 比方：你把一份简历投了出去，三个月后你把这版简历改了。
  -- 你不会希望招聘方系统里那份三个月前的记录也跟着变。
  -- 快照的价值就在于「它是当时那个样子的照片」。
  --
  -- 存外键就毁了这个设计。
  jd          text        NOT NULL,
  result      text        NOT NULL,

  -- 当时用的模型 id。记下来是为了将来能看出「哪次结果是哪版模型产的」。
  model       text,

  -- 排序用：第 13 号接口 GET /api/matches 要「新的在最前」。
  created_at  text        NOT NULL
                        CHECK (created_at ~ '^\d{4}-\d{2}-\d{2}T[\d:.]+Z$')
);
COMMENT ON TABLE public.matches IS '岗位匹配快照。jd / result 存全文正文不是外键——保证历史记录不随表单变化';
COMMENT ON COLUMN public.matches.jd IS '用户自己粘贴的 JD 全文，原样存。用户材料，非爬取所得';
COMMENT ON COLUMN public.matches.result IS '当时那份 JD 的分析结果全文，原样存';

-- 索引：给第 13 号接口 GET /api/matches 用（新的在最前）
CREATE INDEX idx_matches_created_at ON public.matches (created_at DESC);


-- =============================================================================
-- 第 2 节 · 三个设计决定的理由（余力加练：字段类型为什么这么选）
-- =============================================================================
--
-- 2.1 为什么主键用 text（ex_xxx），不用 PostgreSQL 默认的 bigserial 自增数字？
--
--     自增数字 = 1, 2, 3, 4……
--     简单，但有三个问题：
--       a) 删掉第 3 条后，新记录会填回 3。**你删过的那条的 id 被「借」走了**，
--          以后再导入带 id=3 的旧数据就会撞车。
--       b) 看不出这张表是干什么的（`"id": 3` 谁知道是 expenses 还是 entries）。
--       c) 跨库、跨环境（你手机一份、电脑一份）编号会撞。
--
--     带前缀的文本 id（`ex_1758200000000_ab12`）：
--       a) 永不复用——前缀 + 时间戳 + 随机尾巴，删了也不会被借。
--       b) 一眼看出是哪张表的（api-contract 第 52 行就是这么定的）。
--       c) 导入 seed 时能指定 id，所以 **重复执行不会撞号**。
--
--     代价：不能按 id 大小排序（「先创建的」不等于「id 小的」）。
--     简册不需要这个功能——排序靠日期字段。
--
--
-- 2.2 为什么日期存text，不存 PostgreSQL 的 date / timestamptz 类型？
--
--     PostgreSQL 的 date 类型当然更「正规」——它能算日期差、能防非法日期。
--     选 text 的三个理由：
--       a) **前端已经在按字符串读**。TECH_DESIGN 5.4 白纸黑字：「抽屉只认文字」。
--          用 date 类型，接口返回的 JSON 里会变成 "2026-10-02T00:00:00.000Z"，
--          前端的字符串比较和 month 过滤（`slice(0,7) === month`）全部失效。
--          这就是「改数据库类型 ≠ 改数据库」——它会一路波及前端。
--       b) `YYYY-MM-DD` 的**字典序 = 时间序**，所以排序、范围筛选（`date >= '2026-09-01' AND date < '2026-10-01'`）
--          用字符串一样能排序、能筛选，而且不用写复杂的日期函数。
--       c) 跨时区不会出错。timestamptz 会按服务器时区转换，
--          date 和 timestamptz 混用时容易出现「差一天」的诡异问题。
--     防护措施：CHECK 约束 `~ '^\d{4}-\d{2}-\d{2}$'` 保证格式不会写歪。
--     格式对了，字符串 behaves 得像日期。
--
--
-- 2.3 为什么金额用 numeric(12,2)，不用 float / double / int？
--
--     int（整数）：0.5 元存不进去。直接排除。
--     float / double（浮点）：二进制浮点存不进「0.1」。
--       经典的 0.1 + 0.2 = 0.30000000000000004，记账差一分钱要对账，很烦。
--     numeric(12,2)：PostgreSQL 的**精确小数**。0.1 就是0.1，加法精确。
--       最多 12 位整数 + 2 位小数，对个人记账绰绰有余。
--
--     唯一注意：numeric 读出来在某些驱动里是字符串，Day 17 云函数里要 Number() 转一下。
--     这是小代价，换来的是「账目算得准」。


-- =============================================================================
-- 第 3 节 · 权限说明
-- =============================================================================
-- CloudBase PG 模式的权限模型是双层的：表级 GRANT + 行级 RLS Policy。
--
-- **本脚本不写 GRANT / RLS**，原因：
--   第 3 周不做账号体系（api-contract 第 89 行），只有你一个人用。
--   完整权限配置（GRANT + RLS + 匿名/登录角色的读写分离）
--   属于 Day 17 写接口时的任务，今天不碰。
--
-- 若 Day 17 需要前端直连数据库，顺序是：
--   1. GRANT SELECT / INSERT / UPDATE / DELETE ON <表> TO authenticated;
--      （用 serial / bigserial 时还要 GRANT USAGE, SELECT ON SEQUENCE）
--   2. ALTER TABLE <表> ENABLE ROW LEVEL SECURITY;
--   3. CREATE POLICY ... USING / WITH CHECK
--   注意：**开了 RLS 但没配 Policy = 默认全部拒绝**，非 service_role 谁都读不到。
-- =============================================================================


-- =============================================================================
-- 第 4 节 · 执行后自查（跑完这段 SQL 确认 4 张表都建成了）
-- =============================================================================

-- 4-1. 看有哪些表（应该出现 expenses / entries / profile / matches 四张）
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;

-- 4-2. 看每张表的字段和类型（对着本脚本逐个核对一遍）
-- SELECT table_name, column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--   ORDER BY table_name, ordinal_position;

-- 4-3. 看索引建了没有（应该出现 3 个：idx_expenses_date / idx_entries_end_date / idx_matches_created_at）
-- SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';

-- 4-4. 确认外键确实是 0 个（输出应该是 0 行——这是有意为之，见第 0 节说明）
-- SELECT conname, conrelid::regclass AS table_name
--   FROM pg_constraint WHERE contype = 'f';
-- =============================================================================


-- =============================================================================
-- 第 4.5 节 · 本地实测记录（Day 16 · 已验证，不是「应该能跑」）
-- =============================================================================
-- 这两个文件已在 **真实 PostgreSQL 18.6** 上跑过（临时库，用完即删），
-- 不是「看着对」，是「跑过了」。记录如下：
--
-- 【schema.sql】
--   执行结果：0 错误（含全部中文注释——中文注释不影响执行）
--   建出表：entries / expenses / matches / profile（4 张）
--   建出索引：idx_entries_end_date / idx_expenses_date / idx_matches_created_at（3 个）
--            （另有 4 个 xxx_pkey 主键索引，PostgreSQL 自动建的，正常）
--   外键数量：0 ✅ 符合「零外键」设计
--
-- 【seed.sql】—— 可重复执行实测
--   第 1 遍：0 错误→ expenses 6 / entries 6 / profile 1 / matches 5
--   第 2 遍：0 错误 → 行数不变 6/ 6 / 1 / 5← 关键：不产生重复数据
--   第 3 遍：0 错误 → 行数不变 6 / 6 / 1 / 5
--   （靠开头 4 行 TRUNCATE 实现「擦桌子重摆菜」）
--
-- 【业务口径校验】
--   2026-09 三数：收入 8000.00 / 支出 1533.40 / 结余 6466.60 ✅ 与手算一致
--   经历排序：3 条「end_date 为空」的排在最前，其后按 end_date 降序 ✅
--             符合 TECH_DESIGN 5.2 三条排序规则
--
-- 【CHECK 约束拦截能力】逐条试插非法数据，6/6 全部被拒：
--   拦截 ✓ 收入误用「餐饮」（支出类）分类
--   拦截 ✓ 负金额
--   拦截 ✓ 支出误用「工资」（收入类）分类
--   拦截 ✓ end_date 早于 start_date
--   拦截 ✓ profile 塞第二条（id 不等于 profile_singleton）
--   拦截 ✓ 负储蓄
--   试插后各表行数仍为 6/6/1/5 —— **非法数据一行都没进库**
-- =============================================================================


-- =============================================================================
-- 第 5 节 · 今天不做的事
-- =============================================================================
-- ❌ 不写任何接口（15 个接口里只有 /api/health 存在，其余等 Day 17）
-- ❌ 不改前端一个字
-- ❌ 不建外键（4 张表无从属关系）
-- ❌ 不建账号体系 / RLS 策略（第 3 周不做，见第 3 节）
-- ❌ 不建唯一约束（主键已经唯一；给 date 建唯一会判「一天记两笔账」为错误）
-- ❌ 不写任何真实数据——种子数据全是编造的假数据
-- =============================================================================
