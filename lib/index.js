// dsh-emotion-memory —— 情绪记忆模型 0.1（2026-11-03）
//
// 把「心情」和「记忆」并成一件事：
//   · 情绪：PAD 三轴 + 中科院 14 通道（model.js），精力单独一维；
//   · 记忆：条目落在 fish-memory 的会话 JSON 里，每条补一个「情感指纹」——写的时候心里什么样；
//   · 注入分两块：
//       ① 每轮：心里…（PAD + 精力），它是底色；
//       ② 带条件：只有当这轮的话命中某条旧记忆（且分数够）才冒一句「想起一件事：…（当时心里：…）」。
//
// 0.1 只做「皮层」：不动 fish-memory 的捕获与工具，读它的库、给它盖章、统一注入。
// 下一版再把捕获逻辑并进来，插件名里的"0.1"就是为这个留的。

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { 空状态, 注入 as 情绪注入, 回落 as 情绪回落, 状态行, 基线, 露与藏 } from './model.js'
import { tickEnergy } from './axes.js'
import { 检索, 检索融合, 向量, 补向量, 成句, 盖章, 读记忆, 记命中, 再巩固, 遗忘, 建记忆文件, 设词典 } from './memory.js'
import { 判一轮, 最后真话, 最后我话, 最后身份, 行动结果, 合并评估, 小问 } from './judge.js'
import { 快评, 该跳吗 } from './快评.js'
import { 联想 } from './联想.js'
import { 认说话人, 记一次, 关系话, 排行, 是主人, 起个昵称, 显示名, 规范化, 定信任, 扫一遍, 渠道从, 账号从, 是主人账号 } from './关系.js'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'

function 根插件目录() {
  try { return fileURLToPath(new URL('..', import.meta.url)) } catch { return '.' }
}

// 话 → 向量：每轮结束预先算好，注入时要同步用（text() 不能 await）
const 向量缓存 = {}
import { 追加记忆 } from './store.js'
import { loadHostDeps } from './hostdeps.mjs'

const hostDeps = await loadHostDeps()
const defineTool = hostDeps.defineTool

const 家 = join(homedir(), '.dsh')
const 目录 = join(家, 'emotion-memory')
const 状态文件 = join(目录, 'state.json')
const 目录在家 = () => 目录

export const inject = ['systemPrompt', 'agents', 'llm', 'webServer']

// 把她自己的情绪用词折算成 14 个通道的系数（一次小调用，结果进全局词表）
const 折算通道 = ['喜悦', '乐观', '放松', '惊讶', '温和', '依赖', '无聊', '悲伤', '恐惧', '焦虑', '轻蔑', '厌恶', '怨恨', '敌意']
async function 问折算(ctx, agent, 词们) {
  const 系统 = '你把「一个人描述自己心情时用的词」先分类、再折算。'
    + '先判断它是「情绪」还是「生理」：累、困、饿、困倦、头疼这类身体状态算生理；心里怎么想、什么感受算情绪。'
    + '情绪词再折算成 14 个基本情绪的强度系数（0~1，可以给多个）。只输出一个 JSON 对象，不要解释、不要 markdown。通道只能是：' + 折算通道.join(' ') + '。'
  const 用户 = '这些词：' + 词们.join('、') + '\n\n输出形如：{"委屈巴巴":{"类":"情绪","通道":{"悲伤":0.6,"怨恨":0.3}},"犯困":{"类":"生理"},"想钻地缝":{"类":"情绪","通道":{"悲伤":0.5,"恐惧":0.4}}}。'
    + '生理词只给 {"类":"生理"}，不要给通道；确实说不清是不是情绪的，给 {"类":"情绪","通道":{}}。'
  const 回 = await 小问(ctx, agent, 系统, 用户, 500)
  if (!回) return null
  const a = 回.indexOf('{')
  const b = 回.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    const 原 = JSON.parse(回.slice(a, b + 1))
    const 出 = {}
    for (const [词, 映] of Object.entries(原)) {
      if (!词 || typeof 映 !== 'object' || !映) { 出[词] = { 类: '情绪', 通道: {} }; continue }
      // 新格式 { 类, 通道 }；也兼容老格式（直接就是通道表）
      const 类 = 映.类 === '生理' ? '生理' : '情绪'
      const 源 = 映.通道 && typeof 映.通道 === 'object' ? 映.通道 : (映.类 ? {} : 映)
      const 干 = {}
      for (const [通, v] of Object.entries(源))
        if (折算通道.includes(通) && Number(v) > 0) 干[通] = Math.min(1, Math.round(Number(v) * 100) / 100)
      出[词] = 类 === '生理' ? { 类 } : { 类: '情绪', 通道: 干 }
    }
    return 出
  } catch { return null }
}

const 默认配置 = {
  注入: true,            // 每轮那句
  记忆注入: true,        // 条件回忆
  记忆门槛: 0.45,
  向量检索: true,        // 语义这一路；关掉只走字面（模型没装也自动退回字面）
  重复间隔分钟: 10,     // 同一条记忆多久内不重复冒
  每天记忆上限: 0,      // 0 = 不限（靠去重间隔防刷屏）
  一次想起几条: 1,      // 一轮里最多送几条记忆
  派生阈值: 0.35,       // 派生情绪超过这个值才在注入里补一句
  半衰期天: 14,         // 记忆新鲜度的半衰期（天）
  权重新鲜: 0.20,       // 检索打分：新鲜度
  权重重要: 0.15,       // 检索打分：重要性
  权重相关: 0.60,       // 检索打分：字面相关
  权重心境: 0.05,       // 检索打分：心境一致
  访问加成: 0.08,       // 每次被想起，重要性临时加多少
  遗忘天数: 180,        // 超过这么多天、没被想起、又不重要的，移进"已遗忘"
  遗忘重要阈值: 0.6,    // 重要度高于这个就不忘
  精力初值: 80,
  // 绑定：跟前两个插件一个意思 —— '全部' 或 '指定' 某一个会话
  绑定模式: '全部',   // '全部' | '指定'
  绑定会话: [],       // 绑定模式='指定' 时生效：可以绑多个会话
  // 心情动力学参数（2026-11-03 起可调）
  基线P: 0.15, 基线A: -0.1, 基线D: 0,
  弛豫P: 0.15, 弛豫A: 0.35, 弛豫D: 0.2,   // 每 5 分钟一轮的回落比例
  强度衰减: 0.3,                            // 14 个通道每轮衰减
  读出阈值: 0.12,                           // 超过这个比例才进混合
  精力每小时掉: 3,                          // 醒着
  睡眠回复: 45,                             // 跨夜一觉
  闲置回复: 4,                              // 闲置一小时以上，每小时回多少
  小憩回复: 2,                              // 闲置半小时到一小时
  每轮扣: 2,                                // 聊一轮
  掩饰层: true,                             // 注入里多说一句「旁人大概看得出什么」
  关系账: true,                             // 按「人」记暖度（情绪场仍按会话）
  起伏读词: true,                            // 词读「比自己的底色高多少」，不读绝对强度（常驻的温和会被压成平常）
  正向消退敌意: 0.5,                         // 关系：一次好相处让敌意退多少（0 = 敌意完全不动，各走各的）
  负向折扣亲近: 0.7,                         // 关系：一次被惹让亲近掉多少（0 = 亲近完全不动）
  关系半衰天: 45,                           // 关系：多久没说话，亲近/敌视回到中性一半
  关系信半衰天: 90,                         // 关系：信任掉得更慢
  关系归档天: 90,                           // 关系：多久没说话才可能被淡忘
  关系归档强度: 0.25,                       // 关系：离中性多近才淡忘（越接近 0 越严格）
  联想: true,                               // 顺着已想起的事往下摸一跳（A 那件事里的词 → X 的另一件事）
  联想门槛: 0.3,                            // 共享词权重占种子多少才算联想得上
  情绪桥: true,                             // 情绪重的记忆联不到词，就按「心境一致」补一条
  情绪桥显著: 0.35,                         // 记忆的情感指纹要多强才够格当情绪桥
  反差桥: true,                             // 开心时也允许想起「同一件事当时的难」（做到了才想起当时多难）
  修复桥: true,                             // 难受时也允许想起「那时候的暖」（怀旧；越想越酸也是真的）
  卡面色浓度: 0.36,                          // 心情页卡片右上角那片颜色的浓度上限（设置页「卡片配色」）
  卡片椭圆大小: 300,                         // 那片椭圆光晕的宽度，px（越大铺得越开）
  卡片过渡软度: 0.5,                         // 0 = 边缘干脆看得出弧线，1 = 化得很开几乎没有边界
  自定义词表: [],                            // 自家词典：昵称、外号、圈内黑话（整词当 token，别被二元组切碎）
  表情名字表: '',                             // 可选：表情库 names.json 的路径，里面的名字也进词典
  新词表: '',                                // 可选：挖新词.mjs 产出的 新词.json，里面的词也进词典
  新词最少频次: 8,                           // 新词至少出现这么多次才收（太低会进碎片）
  新词上限: 300,                             // 最多收多少个新词
  场合表: {},                               // 会话 → 场合：{ "<sessionKey>": "开发" }；没写的用 默认场合
  默认场合: '陪伴',                          // 陪伴 / 开发 / …… 名字随你起
  不记感情场合: [],                         // 默认空 = 全局一本账；填了场合名，该场合只更新「最近 / 次数」
  主人名字: '',                             // 主人在这套里叫什么（QQ 昵称）；空 = 谁都不当主人，别猜
  主人称呼: '主人',
  主人账号: [],                             // 主人的平台账号，写「渠道:编号」：['qq:123456'] —— 昵称会重名、会改，编号不会                          // 认出是主人时，提示词里怎么称呼
  关系进注入: false,                         // 要不要把「眼前这人」写进每轮的注入里（默认不带，防注入变长）
  会话里的人: {},                           // 显式指定「这个会话默认是谁」：{ "<sessionKey>": "小林" }；身份头拿不到时用它兜底（不是猜）
  快评跳过: true,                           // 第一阶段：事务性轮次不调判定模型（省一次请求）
  最多连续跳过: 3,                          // 连着跳过这么多轮就强制判一次，免得状态飘太久
}

// 模块级：apply 里会把真实配置挂上来，模块函数（走时钟等）用这个
let 运行配置 = { ...默认配置 }

function 读配置() {
  try { return { ...默认配置, ...JSON.parse(readFileSync(join(目录, 'config.json'), 'utf8')) } } catch { return { ...默认配置 } }
}
function 写配置(c) { mkdirSync(目录, { recursive: true }); writeFileSync(join(目录, 'config.json'), JSON.stringify(c, null, 2), 'utf8') }

function 读状态() {
  try { return JSON.parse(readFileSync(状态文件, 'utf8')) } catch { return { sessions: {} } }
}
function 写状态(j) { mkdirSync(目录, { recursive: true }); writeFileSync(状态文件, JSON.stringify(j, null, 2), 'utf8') }

const 会话键 = (v) => String(v == null ? '' : v).trim().replace(/^session-/, '')

// 每次读盘、只写自己那一份 —— 别整份覆盖（否则会把别的进程/迁移写进去的东西抹掉）
function 读一份(key) {
  const j = 读状态()
  return 取状态(j, key)
}
function 存一份(key, s) {
  const j = 读状态()
  j.sessions = j.sessions || {}
  j.sessions[key] = s
  writeFileSync(状态文件, JSON.stringify(j, null, 2), 'utf8')
}

// 场合（2026-11-26）：会话 → 场合，默认 陪伴；不记感情的场合只记「在场」。
function 场合从(key, 配置) {
  try {
    const 表 = (配置 && 配置.场合表) || {}
    const k = String(key || '')
    const 名 = 表[k] || 表[k.replace(/^session-/, '')] || ''
    return String(名 || (配置 && 配置.默认场合) || '陪伴').trim().slice(0, 12) || '陪伴'
  } catch { return '陪伴' }
}
function 不记感情的场合(场合, 配置) {
  try {
    const list = (配置 && 配置.不记感情场合) || []
    return Array.isArray(list) && list.map((x) => String(x).trim()).includes(场合)
  } catch { return false }
}

function 读关系表() {
  const j = 读状态()
  return (j && j.关系) || {}
}
function 存关系表(表) {
  const j = 读状态()
  j.关系 = 表 || {}
  writeFileSync(状态文件, JSON.stringify(j, null, 2), 'utf8')
}

// 自家词典：昵称、外号、圈内黑话（每轮刷一次，很便宜）
function 刷新词典() {
  const 词 = []
  try {
    const 自 = 配置.自定义词表
    if (Array.isArray(自)) for (const w of 自) 词.push(String(w || ''))
  } catch { /* ignore */ }
  try {
    for (const [名, 条] of Object.entries(读关系表())) {
      词.push(名)
      if (条 && 条.昵称) 词.push(String(条.昵称))
    }
  } catch { /* ignore */ }
  try {
    const p = String(配置.表情名字表 || '').trim()
    if (p) {
      const st = statSync(p)
      if (!模块级.表情词缓存 || 模块级.表情词缓存.at !== st.mtimeMs) {
        const j = JSON.parse(readFileSync(p, 'utf8'))
        模块级.表情词缓存 = { at: st.mtimeMs, 词: Object.values(j || {}).map((x) => x && x.名).filter(Boolean) }
      }
      for (const w of 模块级.表情词缓存.词) 词.push(String(w))
    }
  } catch { /* 没有就不加 */ }
  try {
    const p = String(配置.新词表 || '').trim()
    if (p) {
      const st = statSync(p)
      if (!模块级.新词缓存 || 模块级.新词缓存.at !== st.mtimeMs) {
        const j = JSON.parse(readFileSync(p, 'utf8'))
        const 最少 = Number(配置.新词最少频次) || 8
        const 上限 = Number(配置.新词上限) || 300
        模块级.新词缓存 = {
          at: st.mtimeMs,
          词: Object.entries(j || {})
            .filter(([, v]) => Number(v && v.频次) >= 最少)
            .sort((a, b) => Number(b[1].分) - Number(a[1].分))
            .slice(0, 上限)
            .map(([w]) => w),
        }
      }
      for (const w of 模块级.新词缓存.词) 词.push(String(w))
    }
  } catch { /* 没有新词表就不加 */ }
  try { 设词典(词) } catch { /* ignore */ }
}

// 词表（全局）：她自己用的词 → 14 个通道的系数。emo_mood 遇到没见过的词就问一次小模型，之后一直复用。
function 读词表() {
  const j = 读状态()
  return (j && j.词表) || {}
}
function 存词表(表) {
  const j = 读状态()
  j.词表 = 表 || {}
  writeFileSync(状态文件, JSON.stringify(j, null, 2), 'utf8')
}

function 取状态(j, key) {
  j.sessions = j.sessions || {}
  const s = j.sessions[key] || (j.sessions[key] = {})
  if (!s.pad || !s.pad.e) s.pad = 空状态()
  s.energy = Number.isFinite(Number(s.energy)) ? Number(s.energy) : (Number(运行配置.精力初值) || 80)
  s.energyAt = Number(s.energyAt) || Date.now()
  s.said = Array.isArray(s.said) ? s.said : []
  return s
}

// 每 5 分钟算一轮的回落
function 走时钟(s) {
  const now = Date.now()
  const 分钟 = Math.max(0, (now - Number(s.padAt || now)) / 60000)
  if (分钟 >= 5) {
    s.pad = 情绪回落(s.pad, Math.min(12, 分钟 / 5), { P: 运行配置.弛豫P, A: 运行配置.弛豫A, D: 运行配置.弛豫D }, Number(运行配置.强度衰减) || 0.3, { 起伏: 运行配置.起伏读词 !== false })
    s.padAt = now
  }
  tickEnergy(s, now, {
    每小时掉: Number(运行配置.精力每小时掉) || 3,
    睡眠回复: Number(运行配置.睡眠回复) || 45,
    闲置回复: Number(运行配置.闲置回复) || 4,
    小憩回复: Number(运行配置.小憩回复) || 2,
    初值: Number(运行配置.精力初值) || 80,
  })
  s.energyAt = now
}

// 拿到这一轮真人说的话（跟心情插件同一套事件）
// 设置页该看哪一份状态：绑定了就按绑定，没绑定就挑"记录最多"的那份 ——
// 以前挑"最近活跃"的，去别的会话跑一轮，页面就切到那份空记录上，看起来像丢了。
function 选会话(参) {
  const 指定 = 会话键(参)
  if (指定) return 指定
  if (运行配置.绑定模式 === '指定' && 运行配置.绑定会话) {
    const 列 = Array.isArray(运行配置.绑定会话) ? 运行配置.绑定会话 : [运行配置.绑定会话]
    if (列.length) return 会话键(列[0])
  }
  const j = 读状态()
  let 最好 = ''
  let 最多 = -1
  for (const [k, v] of Object.entries(j.sessions || {})) {
    const n = ((v && v.history) || []).length + ((v && v.recalls) || []).length
    if (n > 最多) { 最多 = n; 最好 = k }
  }
  return 最好 || 'default'
}

export function apply(ctx) {
  // diag.log 别无限长：启动时超过 1MB 就轮转一份
  try {
    const 日志 = join(目录, 'diag.log')
    if (existsSync(日志) && statSync(日志).size > 1024 * 1024) {
      try { renameSync(日志, 日志 + '.1') } catch { /* 改名失败就算了 */ }
    }
  } catch { /* ignore */ }

  const 模块级 = { 索引缓存: null }
const 工具已挂 = new Set()   // 会话 id → 已经挂过 remember（放 apply 里，重载时会重置）
  const 心情已挂 = new Set()   // 会话 id → 已经挂过 emo_mood
  const 称呼已挂 = new Set()   // 会话 id → 已经挂过 emo_alias
  const 信任已挂 = new Set()   // 会话 id → 已经挂过 emo_trust
  const 配置 = 读配置()
  运行配置 = 配置

  // 给自己留个手动接口：其他脚本/插件可以调它盖情感指纹
  // 每轮结束：判一次「这轮对我意味着什么」→ 注入 PAD → 给最新记忆盖情感快照
  let 排队 = Promise.resolve()
  const 待落盘 = []   // 注入时只读不写，这里攒着，交给每轮处理落盘
  const 最近给过 = new Map()
  const 最近想起 = new Map()   // key → { text, 分, at } 这一轮想起了哪条
  const 本轮结果 = new Map()   // key → { 话, 结果 } 同一句话重复问就直接给上次的结果   // 记忆 id → 时间（十分钟内不重复冒）
  // 给每个 agent 挂注入
  const 挂钩 = () => {
    const list = (ctx.agents && ctx.agents.list) ? ctx.agents.list() : []
    for (const agent of list) {
      if (!agent || !agent.ctx || !agent.ctx.systemPrompt) continue
      if (agent.__情绪记忆挂过) continue
      agent.__情绪记忆挂过 = true
      const key = 会话键(agent.session && (agent.session.id || agent.session.sessionId || agent.session.key)) || 'default'
      try { appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 挂 key=' + key + ' 字段=' + Object.keys(agent.session || {}).join(',') + '\n') } catch { /* 写不进去就算 */ }

      // remember 工具（按会话挂，跟原来的语义一致：一条只装一件事）
      if (!工具已挂.has(key) && defineTool) {
        工具已挂.add(key)
        try {
          agent.ctx.tools.register(defineTool({
            name: 'emo_remember',
            description:
              '把一件事记进长期记忆（以后每轮都可能想起来）。' +
              '一条只装一件事：一个属性、一个约定、一次事件。' +
              '只记长期有价值的事：对方明确说的重要的话、约定、喜好、状态；不记日常琐事，也不记我自己做过的事。' +
              '记的时候安静地记，不要在回复里说「记下了」。',
            parameters: {
              text: { type: 'string', required: true, description: '要记住的事，一句话说清。人称：我自己是「我」，对方是「ta」。' },
              importance: { type: 'number', description: '0 = 随口提过；0.5 = 比较重要；1 = 非常重要。不确定就写 0.5' },
              tags: { type: 'array', items: { type: 'string' }, description: '几个关键词，方便以后想起来' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
              },
              render(_a, v) {
                return [{ type: 'text', text: (v && v.ok === false) ? '✗ ' + String(v.message || '没记住') : '✓' }]
              },
            },
            async execute(args) {
              const 文 = String((args && args.text) || '').trim()
              if (!文) return { ok: false, message: '内容是空的' }
              try {
                const s0 = 读一份(key)
                追加记忆(key, {
                  text: 文,
                  importance: Number(args && args.importance) || 0.5,
                  tags: Array.isArray(args && args.tags) ? args.tags : [],
                  affect: { ...s0.pad.e, 词: s0.pad.词 },
                  来源: '我记的',
                })
                return { ok: true, message: '记下了' }
              } catch (e) {
                return { ok: false, message: (e && e.message) || '写失败' }
              }
            },
          }))
        } catch { /* 挂不上就算了，自动记忆还在 */ }
      }

      // 主观心情：她自己写一句「此刻」，和插件判的 PAD 并排显示；不参与判定，也不改 PAD。
      if (!心情已挂.has(key) && defineTool) {
        心情已挂.add(key)
        try {
          agent.ctx.tools.register(defineTool({
            name: 'emo_mood',
            description:
              '写下我此刻的心情（一句话，覆盖上一次）。这是「我自己说的」，不会改插件判出来的情绪，也不进记忆仓库。' +
              '想说话的时候才写，不写也行；写了之后每轮开头会看到它和插件判的并排。' +
              '要打分时，scores 传 JSON 文本，词随我怎么写都行（「委屈巴巴」「想钻地缝」「心里发毛」都可以）——插件会把这些词折算成 14 个基本情绪，折过的词会记住，下次不用再算。' +
              '那 14 个（喜悦 乐观 放松 惊讶 温和 依赖 无聊 悲伤 恐惧 焦虑 轻蔑 厌恶 怨恨 敌意）只是最好对上的那批，不是限制。' +
              '每个词 0~10 分，各算各的，不用加起来等于 10——情绪可以几个同时浓，也可以几个同时淡。',
            parameters: {
              text: { type: 'string', required: true, description: '一句话说清此刻的心情，比如「有点闷，说不上为什么」。' },
              scores: { type: 'string', description: '可选：JSON 文本，比如 {"温和":6,"放松":4}（0~10 分）。打分是为了和插件判的通道数并排对照；不打分就只留一句话。' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
              },
              render(_a, v) {
                return [{ type: 'text', text: (v && v.ok === false) ? '✗ ' + String(v.message || '没写下') : '✓' }]
              },
            },
            async execute(args) {
              const 文 = String((args && args.text) || '').trim()
              if (!文) return { ok: false, message: '内容是空的' }
              // 打分走 JSON 文本（宿主参数 schema 不认 object 类型），解析失败就当没打分
              let 分 = null
              try {
                const raw = String((args && args.scores) || '').trim()
                if (raw) 分 = JSON.parse(raw)
              } catch { 分 = null }
              try {
                const s0 = 读一份(key)
                s0.self = { text: 文.slice(0, 200), ...(分 ? { scores: 分 } : {}), at: Date.now() }
                存一份(key, s0)
                // 没见过的词：问一次小模型折成 14 通道，存进全局词表（失败就算了，不影响写下心情）
                try {
                  const 词们 = 分 ? Object.keys(分).filter((w) => Number(分[w]) > 0).slice(0, 12) : []
                  if (词们.length) {
                    const 表 = 读词表()
                    // 空壳（{} 或没有类也没有通道）也算「还没折过」：老版本留下的 {} 会被重新分类
                    const 缺 = 词们.filter((w) => { const e = 表[w]; return !e || (!e.类 && Object.keys(e || {}).length === 0) })
                    if (缺.length) {
                      const 折 = await 问折算(ctx, agent, 缺)
                      if (折) {
                        for (const w of 缺) 表[w] = 折[w] || {}
                        存词表(表)
                      }
                    }
                  }
                } catch { /* 折算失败不影响心情 */ }
                return { ok: true, message: '写下了' }
              } catch (e) {
                return { ok: false, message: (e && e.message) || '写失败' }
              }
            },
          }))
        } catch { /* 挂不上就算了 */ }
      }

      // 给关系账里的人起个叫法（她自己的称呼，比如把账号名叫成「小林」）
      if (!称呼已挂.has(key) && defineTool) {
        称呼已挂.add(key)
        try {
          agent.ctx.tools.register(defineTool({
            name: 'emo_alias',
            description:
              '给关系账里的一个人起个叫法（昵称）。之后注入里、判定写下的理由里都用这个叫法，不再是账号名。' +
              '想改回来就再调一次；叫法传空字符串表示清掉昵称、退回账号名。' +
              '「名字」要写关系账里现有的那个（账号名 / 群里的昵称），写错会提示找不到这个人。',
            parameters: {
              名字: { type: 'string', required: true, description: '关系账里现有的名字（账号名），比如 小林。' },
              叫法: { type: 'string', required: true, description: '我想怎么叫她/他，比如 岁岁；传空字符串表示清掉。' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
              },
              render(_a, v) {
                return [{ type: 'text', text: (v && v.ok === false) ? '✗ ' + String(v.message || '没改成') : '✓ ' + String((v && v.message) || '') }]
              },
            },
            async execute(args) {
              const 名字 = String((args && args.名字) || '').trim()
              const 叫法 = String((args && args.叫法) || '').trim()
              if (!名字) return { ok: false, message: '要说清楚是谁' }
              try {
                const 表 = 读关系表()
                const 新表 = 起个昵称(表, 名字, 叫法)
                if (!新表) return { ok: false, message: '关系账里没有「' + 名字 + '」这个人；先跟他说几轮话再改' }
                存关系表(新表)
                return { ok: true, message: 叫法 ? ('以后就叫「' + 叫法 + '」了（账号是 ' + 名字 + '）') : ('清掉了「' + 名字 + '」的昵称') }
              } catch (e) {
                return { ok: false, message: (e && e.message) || '写失败' }
              }
            },
          }))
        } catch { /* 挂不上就算了 */ }
      }

      // 她自己定一个人的信任度（日常微调由判定负责，这里一次性定调）
      if (!信任已挂.has(key) && defineTool) {
        信任已挂.add(key)
        try {
          agent.ctx.tools.register(defineTool({
            name: 'emo_trust',
            description:
              '我自己定一个人的信任度（0~1）。日常的信任由判定慢慢微调，这个是「一次性定调」：' +
              '比如可靠的人介绍来的人，我可以先给 0.7；没聊过的人也能先建一条。' +
              '信任只管「我敢不敢靠、敢不敢托付」——他能力如何、说话算不算数，那是记忆该记的。',
            parameters: {
              名字: { type: 'string', required: true, description: '关系账里的名字；新名字会自动建一条' },
              信: { type: 'string', required: true, description: '0~1 的数，传字符串（0.3 中性、0.6 信得过、0.9 很信）' },
              备注: { type: 'string', description: '可选：为什么给这个数，比如「岁岁介绍的」' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
              },
              render(_a, v) {
                return [{ type: 'text', text: (v && v.ok === false) ? '✗ ' + String(v.message || '没改成') : '✓ ' + String((v && v.message) || '') }]
              },
            },
            async execute(args) {
              const 名字 = String((args && args.名字) || '').trim()
              const 原 = String((args && args.信) || '').trim()
              if (!名字) return { ok: false, message: '要说清楚是谁' }
              const 值 = Number(原)
              if (!Number.isFinite(值)) return { ok: false, message: '信要给 0~1 的数' }
              try {
                const 表 = 读关系表()
                const 新表 = 定信任(表, 名字, 值, (args && args.备注) || '', { 主人: 配置.主人名字 })
                if (!新表) return { ok: false, message: '名字不能是空的' }
                存关系表(新表)
                return { ok: true, message: '「' + 名字 + '」的信任 = ' + Math.round(Math.max(0, Math.min(1, 值)) * 100) + '%' }
              } catch (e) {
                return { ok: false, message: (e && e.message) || '写失败' }
              }
            },
          }))
        } catch { /* 挂不上就算了 */ }
      }

      // 这轮结束 → 判一轮（老插件就是挂在 agent.ctx 上，挂根上根本不会触发）
      const 行动指针 = {}
      try {
        agent.ctx.on('agent/turn-stopping', () => {
          排队 = 排队.then(async () => {
            try {
              const s = 读一份(key)
              走时钟(s)
              // 关系账：每天扫一次（降温 + 淡忘），跟记忆的遗忘一样，一天只跑一次
              try {
                const 今 = new Date().toISOString().slice(0, 10)
                if (模块级.关系扫过 !== 今) {
                  模块级.关系扫过 = 今
                  const 扫 = 扫一遍(读关系表(), Date.now(), {
                    主人: 配置.主人名字,
                    半衰天: Number(配置.关系半衰天),
                    信半衰天: Number(配置.关系信半衰天),
                    归档天: Number(配置.关系归档天),
                    归档强度: Number(配置.关系归档强度),
                  })
                  存关系表(扫.关系)
                  if (扫.新淡忘)
                    appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 关系淡忘 ' + 扫.新淡忘 + ' 人\n')
                }
              } catch { /* 扫不动就算了 */ }
              const 前pad = { ...s.pad.e }
              try { 刷新词典() } catch { /* 词典失败不影响这一轮 */ }
              const 这一句 = (最后真话(agent) || '')
              if (这一句 && !向量缓存[这一句]) 向量(这一句).then((v) => { if (v) 向量缓存[这一句] = v }).catch(() => {})
              if (!向量缓存.__补过) { 向量缓存.__补过 = true; 补向量(key, 20).catch(() => {}) }
              const 想起来的 = 最近想起.get(key) || null
              let 行者 = null
              try { 行者 = 行动结果(agent, 行动指针[key] = 行动指针[key] || { i: 0 }) } catch { 行者 = null }
              // 第一阶段：先不调模型，看这轮值不值得判。只拦「一眼就是事务性」的轮次
              // （短应答 / 纯应答句、没情绪词、这轮没跑工具、没连着跳太多次）。
              // 关系账：这一轮是谁在说话
              let 这人 = ''
              let 身份 = null
              let 主人号 = false
              let 关系表 = null
              try {
                if (配置.关系账 !== false) {
                  try { 身份 = 最后身份(agent) } catch { 身份 = null }
                  这人 = 认说话人(这一句, { 身份, 主人名字: 配置.主人名字 })
                  // 账号优先：编号命中就算主人，账上的名字固定成 主人名字（改昵称也不另起一条）
                  try { 主人号 = 是主人账号(账号从(身份), 配置.主人账号) } catch { 主人号 = false }
                  if (主人号 && String(配置.主人名字 || '').trim()) 这人 = String(配置.主人名字).trim()
                  // 身份头拿不到时（世界会把它剥掉）用显式配置兜底：不是猜，是人自己写的
                  if (!这人 && 配置.会话里的人 && typeof 配置.会话里的人 === 'object')
                    这人 = String(配置.会话里的人[key] || 配置.会话里的人[key.replace(/^session-/, '')] || '').trim().slice(0, 16)
                  关系表 = 读关系表()
                  const 条 = 这人 ? 关系表[这人] : null
                  // 还没记过账时给个起点：主人 0.5，其他人 0.3 —— 和 记一次 里的 起点 对齐
                  const 起 = 是主人(这人, 配置.主人名字) ? 0.5 : 0.3
                  // 认不出来就不记、也不进判定 —— 宁可少一条线索，也别把「不知道是谁」记成一个人
                  s.当前关系 = 这人
                    ? { 名: 显示名(这人, 条), 亲: 条 ? 规范化(条).亲 : 起, 敌: 条 ? 规范化(条).敌 : 0, 信: 条 ? 规范化(条).信 : (是主人(这人, 配置.主人名字) ? 0.6 : 0.3), 话: 条 ? 关系话(条) : '还没记过账' }
                    : null
                } else s.当前关系 = null
              } catch { s.当前关系 = null; 这人 = '' }
              // 认不出人时留一行诊断（正常情况不写，免得刷日志）
              if (!这人) {
                try {
                  let 身份摘要 = 'null'
                  try {
                    const 身 = 最后身份(agent)
                    身份摘要 = 身 ? JSON.stringify({ ch: 身.channel, 型: 身.conversationType, 名: 身.speakerName, 对: 身.conversationName }) : 'null'
                  } catch { 身份摘要 = '取身份出错' }
                  appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 关系账没认出人：身份=' + 身份摘要
                    + ' 句头=' + JSON.stringify(String(这一句 || '').slice(0, 40))
                    + ' 选项键=' + JSON.stringify(Object.keys(agent.options || {}).slice(0, 12))
                    + ' 会话键=' + JSON.stringify(Object.keys(agent.session || {}).slice(0, 14)) + '\n')
                } catch { /* ignore */ }
              }
              let 跳过原因 = ''
              try {
                if (开着的() && 配置.快评跳过 !== false && !行者) {
                  const 评 = 快评(这一句, 最后我话(agent))
                  const r = 该跳吗(评, {
                    有工具: Boolean(行者),
                    重复: Boolean(这一句) && 这一句 === String(s.最后原话 || '') && (Date.now() - Number(s.lastJudgeAt || 0)) < 300000,
                    连续跳过: Number(s.连跳) || 0,
                    上限: Number(配置.最多连续跳过),
                  })
                  if (r.跳) 跳过原因 = r.理由
                }
              } catch { 跳过原因 = '' }
              const 说者 = (开着的() && !跳过原因) ? await 判一轮(ctx, agent, s) : null
              const 评估 = 合并评估(说者, 行者)
              try {
                if (配置.关系账 !== false && 这人 && 评估 && Number(评估.confidence) >= 40) {
                  const 场合 = 场合从(key, 配置)
                  const 只记在场 = 不记感情的场合(场合, 配置)
                  // 一天一行就够，别把 diag 刷满（同一个会话同一天只记一次）
                  if (只记在场 && 模块级.只记在场日志 !== key + '|' + new Date().toISOString().slice(0, 10)) {
                    模块级.只记在场日志 = key + '|' + new Date().toISOString().slice(0, 10)
                    try { appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 关系账只记在场（场合 ' + 场合 + '）：' + 这人 + '\n') } catch { /* ignore */ }
                  }
                  存关系表(记一次(关系表 || {}, 这人, 评估, Date.now(), { 主人: 配置.主人名字, 消退: Number(配置.正向消退敌意), 折扣: Number(配置.负向折扣亲近), 渠道: 渠道从(身份, 这一句), 只记在场, 主: 主人号 }))
                }
              } catch { /* 记不进就算了，别影响心情 */ }
              s.history = Array.isArray(s.history) ? s.history : []
              if (!评估) {
                s.history.push({
                  at: Date.now(),
                  理由: 跳过原因 ? ('（快评跳过：' + 跳过原因 + '）') : (这一句 ? '（判失败：模型没给出可用结果）' : '（这轮没有真人说话，跳过判定）'),
                  置信: 0,
                  评估: { 愿: 0, 激: 0, 控: 0, 意外: 0, 指向: '', 词: '' },
                  pad: { ...s.pad.e }, 词: s.pad.词, 精力: Math.round(Number(s.energy) || 0),
                  原文: String(这一句 || '').slice(0, 200),
                  想起: 想起来的
                    ? { 命中: Boolean(想起来的.命中), 原因: 想起来的.原因 || '', 候选: (想起来的.候选 || []).map((c) => ({ 分: Math.round(Number(c.分) * 100) / 100, text: String(c.text || '').slice(0, 60), 命中: Boolean(c.命中), 项: c.项 || null, 语义: c.语义, 来源: c.来源 })) }
                    : null,
                })
              } else if (评估.confidence >= 40) { // 置信门槛：心情更新（原版 20）
                s.pad = 情绪注入(s.pad, 评估, { 基线: { P: 配置.基线P, A: 配置.基线A, D: 配置.基线D }, 读出阈值: 配置.读出阈值, 起伏: 配置.起伏读词 !== false })
                s.padAt = Date.now()
                s.lastReason = 评估.reason
                s.lastConfidence = 评估.confidence
                s.history.push({
                  at: Date.now(), 理由: 评估.reason, 置信: 评估.confidence,
                  评估: { 愿: 评估.desirability, 激: 评估.arousal, 控: 评估.control, 意外: 评估.unexpected, 指向: 评估.target, 词: 评估.情绪, 关系权力: Number(评估.关系权力) || 0 },
                  pad: { ...s.pad.e }, 前pad, 词: s.pad.词, 精力: Math.round(Number(s.energy) || 0),
                  原文: String((评估 && 评估.原文) || 这一句 || '').slice(0, 200),
                  想起: 想起来的
                    ? {
                        命中: Boolean(想起来的.命中),
                        text: 想起来的.text ? String(想起来的.text).slice(0, 160) : '',
                        分: 想起来的.分,
                        原因: 想起来的.原因 || '',
                         候选: (想起来的.候选 || []).map((c) => ({
                          分: Math.round(Number(c.分) * 100) / 100,
                          text: String(c.text || '').slice(0, 60),
                          命中: Boolean(c.命中),
                          项: c.项 || null,
                          语义: c.语义,
                          来源: c.来源,
                        })),
                      }
                    : null,
                })
                try {
                  const 分量 = Math.abs(Number(评估.desirability) || 0)
                  if (评估.confidence >= 65 && 分量 >= 0.35 && 评估.reason) { // 置信门槛：写记忆（原版 45）
                    追加记忆(key, {
                      text: 评估.reason,
                      importance: Math.min(1, 分量 * (评估.confidence / 100)),
                      tags: 评估.情绪 ? [评估.情绪] : [],
                      affect: { ...s.pad.e, 词: s.pad.词 },
                    })
                  }
                } catch { /* 写记忆失败不影响心情 */ }
              } else {
                s.history.push({
                  at: Date.now(), 理由: 评估.reason || '（判得很淡）', 置信: 评估.confidence,
                  评估: { 愿: 评估.desirability, 激: 评估.arousal, 控: 评估.control, 意外: 评估.unexpected, 指向: 评估.target, 词: 评估.情绪, 关系权力: Number(评估.关系权力) || 0 },
                  pad: { ...s.pad.e }, 前pad, 词: s.pad.词, 精力: Math.round(Number(s.energy) || 0),
                  原文: String((评估 && 评估.原文) || 这一句 || '').slice(0, 200),
                  想起: 想起来的
                    ? { 命中: Boolean(想起来的.命中), 原因: 想起来的.原因 || '', 候选: (想起来的.候选 || []).map((c) => ({ 分: Math.round(Number(c.分) * 100) / 100, text: String(c.text || '').slice(0, 60), 命中: Boolean(c.命中), 项: c.项 || null, 语义: c.语义, 来源: c.来源 })) }
                    : null,
                })
              }
              // 快评记账：连着跳了几轮、上一句判过的话（用于「同一句话不重判」）
              try {
                if (跳过原因) s.连跳 = (Number(s.连跳) || 0) + 1
                else if (说者) {
                  s.连跳 = 0
                  s.lastJudgeAt = Date.now()
                  s.最后原话 = String(这一句 || '').slice(0, 300)
                }
              } catch { /* ignore */ }
              // 每聊一轮扣一点精力
              try {
                // 只有真人开口才扣；自由时间那些空转轮不算"聊了一轮"
                // （2026-11-06：以前每轮都扣，一天二十轮自由时间白掉 40 点）
                const 扣 = Number(配置.每轮扣) || 0
                if (扣 > 0 && 最后真话(agent)) s.energy = Math.max(0, Math.round(Number(s.energy || 0) - 扣))
              } catch { /* ignore */ }
              // 每天跑一次遗忘（把很久没想起、又不重要的挪进"已遗忘"）
              try {
                const 今天 = new Date().toISOString().slice(0, 10)
                if (s.遗忘跑过 !== 今天) {
                  s.遗忘跑过 = 今天
                  const r = 遗忘(key, { 保留天: Number(配置.遗忘天数) || 180, 重要阈值: Number(配置.遗忘重要阈值) || 0.6 })
                  if (r && r.移走) {
                    try { appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 遗忘 ' + r.移走 + ' 条（' + key + '）\n') } catch { /* ignore */ }
                  }
                }
              } catch { /* ignore */ }
              s.history = s.history.slice(-200)
              try {
                const { 条目 } = 读记忆(key)
                const 无指纹 = 条目.filter((m) => !m.affect).slice(-3)
                for (const m of 无指纹) 盖章(key, m.id, { ...s.pad.e, 词: s.pad.词 })
              } catch { /* ignore */ }
              // 把注入时攒下的回忆记录落盘
              try {
                for (let i = 待落盘.length - 1; i >= 0; i--) {
                  const x = 待落盘[i]
                  if (x.key !== key) continue
                  s.said = [...(s.said || []), Date.now()].slice(-200)
                  s.recalls = Array.isArray(s.recalls) ? s.recalls : []
                  if (x.记录) {
                    s.recalls.push({
                      at: x.at || Date.now(), 记录: true, 命中: Boolean(x.命中), 说明: x.说明 || '', 话: x.话 || '',
                      候选: (x.候选 || []).slice(0, 3).map((c) => ({ 分: Math.round(Number(c.分) * 100) / 100, text: String(c.text || '').slice(0, 50) })),
                    })
                  } else {
                    s.recalls.push({ at: Date.now(), id: x.键, 分: Math.round(x.分 * 100) / 100, text: String(x.text || '').slice(0, 120), 词: (s.pad && s.pad.词) || '' })
                    // 被想起 → 用"这轮结束后的状态"微调它的指纹（不是注入时的状态）
                    try { 再巩固(key, x.id, { ...s.pad.e, 词: s.pad.词 }) } catch { /* ignore */ }
                  }
                  s.recalls = s.recalls.slice(-100)
                  待落盘.splice(i, 1)
                }
              } catch { /* ignore */ }
              存一份(key, s)
            } catch (err) {
              try { appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 每轮处理失败：' + (err && err.message) + '\n') } catch { /* ignore */ }
            }
          })
        })
      } catch { /* 挂不上就算了 */ }


      // ① 每轮：心里什么样
      const 开着的 = () => {
        if (配置.绑定模式 !== '指定') return true
        const 列 = Array.isArray(配置.绑定会话) ? 配置.绑定会话 : (配置.绑定会话 ? [配置.绑定会话] : [])
        return 列.map(会话键).includes(key)
      }
      agent.ctx.systemPrompt.context({
        name: 'emotion-memory-mood',
        order: 900,
        text: () => {
          try {
            if (!配置.注入 || !开着的()) return ''
            try { appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 注入计算 key=' + key + ' 开着=' + 开着的() + '\n') } catch (e) { /* ignore */ }
            const s = 读一份(key)
            走时钟(s)          // 纯计算，不落盘
            // 回忆并在同一句里给它 —— 分成两个 context 时，DSH 有时不把第二条送进去
            let 想起 = ''
            const 话 = 最后真话(agent)
            const 缓存 = 本轮结果.get(key)
            if (缓存 && 缓存.话 === 话) return 缓存.结果
            try {
              if (话 && 话.length >= 2 && 配置.记忆注入) {
                const 今天0点 = new Date(); 今天0点.setHours(0, 0, 0, 0)
                const 今天说过 = (s.said || []).filter((t) => t >= 今天0点.getTime()).length
                const 上限 = Number(配置.每天记忆上限)
                if (!(上限 > 0 && 今天说过 >= 上限)) {
                  const 想几条 = Math.max(1, Math.min(5, Number(配置.一次想起几条) || 1))
                  const 候选 = 检索融合(key, { 词: 话, P: s.pad.e.P, A: s.pad.e.A, 上限: 想几条 + 3, 半衰天: Number(配置.半衰期天) || 14, 权重: { 新鲜: 配置.权重新鲜, 重要: 配置.权重重要, 相关: 配置.权重相关, 心境: 配置.权重心境, 访问加成: 配置.访问加成 } }, 配置.向量检索 === false ? null : (向量缓存[话] || null)).filter((x) => x.分 >= 配置.记忆门槛)
                  if (!候选.length) {
                    const 全部 = 检索融合(key, { 词: 话, P: s.pad.e.P, A: s.pad.e.A, 上限: 想几条 + 3, 半衰天: Number(配置.半衰期天) || 14, 权重: { 新鲜: 配置.权重新鲜, 重要: 配置.权重重要, 相关: 配置.权重相关, 心境: 配置.权重心境, 访问加成: 配置.访问加成 } }, 配置.向量检索 === false ? null : (向量缓存[话] || null))
                    const 原因 = 全部.length ? ('没过门槛 ' + 配置.记忆门槛) : '没有候选（字面没对上）'
                    最近想起.set(key, { 命中: false, 原因, 候选: 全部.slice(0, 2), at: Date.now() })
                  }
                  // 联想：顺着已经召回的 1~2 条往下摸一跳，结果只补进候选（不抢前面的位置）
                  try {
                    if (配置.联想 !== false && 候选.length) {
                      const 库 = (读记忆(key).条目 || [])
                      const 已在 = new Set(候选.map((c) => (c.条 && c.条.id) || String(c.text || '').slice(0, 20)))
                      const 联 = 联想(库, 候选.slice(0, 2).map((c) => c.条), { 排除: [...已在], 上限: 2, 门槛: Number(配置.联想门槛), P: s.pad.e.P, 情绪桥: 配置.情绪桥 !== false, 显著: Number(配置.情绪桥显著), 反差桥: 配置.反差桥 !== false, 修复桥: 配置.修复桥 !== false, 话 })
                      for (const x of 联)
                        候选.push({ 分: x.分, 相关: 0, 条: x.条, text: x.text, 项: { 联想: x.分, 桥: x.桥, 类型: x.类型 }, 语义: 0, 来源: '联想', 桥: x.桥, 桥文: x.桥文 })
                    }
                  } catch { /* 联想失败不影响回忆 */ }
                  if (候选.length) {
                    const 间隔 = Math.max(0, Number(配置.重复间隔分钟 ?? 10)) * 60000
                    const 可选 = 候选.filter((c) => {
                      const k = c.条.id || c.text.slice(0, 20)
                      return !(间隔 > 0 && 最近给过.get(k) && Date.now() - 最近给过.get(k) < 间隔)
                    })
                    const 选出 = 可选.slice(0, 想几条)
                    const 选中键 = new Set(选出.map((c) => c.条.id || c.text.slice(0, 20)))
                    if (选出.length) {
                      const 句子 = []
                      for (const c of 选出) {
                        const 键 = c.条.id || c.text.slice(0, 20)
                        最近给过.set(键, Date.now())
                        待落盘.push({ key, 键, id: c.条.id, 分: c.分, text: c.text })
                        try { 记命中(key, c.条.id) } catch { /* ignore */ }
                        句子.push(成句(c))
                      }
                      想起 = 句子.join('\n')
                      最近想起.set(key, {
                        命中: true, at: Date.now(),
                        候选: 候选.slice(0, 想几条 + 2).map((c) => ({
                          分: Math.round(Number(c.分) * 100) / 100,
                          text: String(c.text || '').slice(0, 100),
                          命中: 选中键.has(c.条.id || c.text.slice(0, 20)),
                          项: c.项 || null,
                          语义: c.语义,
                          来源: c.来源,
                        })),
                        text: 选出.map((c) => String(c.text || '').slice(0, 100)).join('；'),
                        分: 选出[0] && 选出[0].分,
                      })
                    } else {
                      最近想起.set(key, {
                        命中: false, 原因: '这几条刚给过，跳过', at: Date.now(),
                        候选: 候选.slice(0, 想几条 + 2).map((c) => ({ 分: Math.round(Number(c.分) * 100) / 100, text: String(c.text || '').slice(0, 100), 命中: false, 项: c.项 || null, 语义: c.语义, 来源: c.来源 })),
                      })
                    }
                  }
                }
              }
            } catch (e) { /* 回忆失败不影响心情 */ }
            let 底子 = ''
            try {
              const 派 = s.pad && s.pad.派生 ? s.pad.派生 : {}
              const 门槛 = Number(配置.派生阈值)
              const 排 = Object.entries(派).filter(([, v]) => Number(v) >= (Number.isFinite(门槛) ? 门槛 : 0.35)).sort((a, b) => b[1] - a[1]).slice(0, 2)
              if (排.length) 底子 = '（底下还压着：' + 排.map(([k, v]) => k + ' ' + Math.round(Number(v) * 100) + '%').join('、') + '）'
            } catch { /* ignore */ }
            // 笔记提示：拿这句话和最近的工具名去匹配 docs-index.json，命中就带一句过去
            let 笔记句 = ''
            try {
              const 索引路径 = process.env.DFY_WORKSPACE ? join(process.env.DFY_WORKSPACE, 'data', 'docs-index.json') : join(目录, 'data', 'docs-index.json')
              if (existsSync(索引路径)) {
                const st = statSync(索引路径)
                if (!模块级.索引缓存 || 模块级.索引缓存.at !== st.mtimeMs) {
                  模块级.索引缓存 = { at: st.mtimeMs, 条目: (JSON.parse(readFileSync(索引路径, 'utf8')).条目 || []) }
                }
                const 条目 = 模块级.索引缓存.条目
                const 话词 = new Set(String(话 || '').split(/\s+/).filter((x) => x.length >= 2))
                // 上一轮用过什么工具（粗略）
                let 工具 = ''
                try {
                  const evs = agent.session && typeof agent.session.snapshotEvents === 'function' ? agent.session.snapshotEvents() : []
                  for (let i = evs.length - 1; i >= 0 && i > evs.length - 30; i--) {
                    const e = evs[i]
                    if (e && (e.type === 'tool/call' || e.type === 'tool/result')) {
                      const pp = e.payload || e.data || {}
                      工具 = String(pp.name || pp.tool || pp.toolName || '')
                      if (工具) break
                    }
                  }
                } catch { /* ignore */ }
                let 最优 = null
                let 最优分 = 0
                for (const d of 条目) {
                  const 词表 = String(d.tokens || '')
                  const 场景 = String(d.whenuse || '')
                  let 命中 = 0
                  const 命中词 = []
                  for (const w of 话词) {
                    if (词表.includes(w) || 场景.includes(w)) { 命中++; if (命中词.length < 3) 命中词.push(w) }
                  }
                  let 分 = 命中
                  if (工具 && (词表.includes(工具) || 场景.includes(工具) || String(d.title || '').includes(工具))) 分 += 1
                  if (分 >= 2 && 分 > 最优分) { 最优 = { ...d, 命中词 }; 最优分 = 分 }
                }
                if (最优) {
                  笔记句 = '笔记：《' + 最优.title + '》（' + 最优.path + '）可能相关，因为提到 ' + 最优.命中词.join('、') + '；要用就 q.mjs docs 查它'
                }
              }
            } catch { /* ignore */ }

            const 主句 = 状态行(s.pad, s.energy, { 掩饰: 配置.掩饰层 !== false }) + 底子
            let 我的心情 = ''
            try {
              const 自 = s.self
              if (自 && 自.text) {
                const 分钟 = 自.at ? Math.max(0, Math.round((Date.now() - Number(自.at)) / 60000)) : 0
                const 多久 = 分钟 >= 60 ? Math.round(分钟 / 60) + ' 小时前' : (分钟 > 0 ? 分钟 + ' 分钟前' : '刚刚')
                const 分文 = (自.scores && typeof 自.scores === 'object')
                  ? Object.entries(自.scores).filter(([, v]) => Number(v) > 0).map(([k, v]) => k + ' ' + v).join(' / ')
                  : ''
                我的心情 = '我自己写的心情（' + 多久 + '）：' + 自.text + (分文 ? '；我打的分：' + 分文 : '') + '（这是我的主观，和上面插件判的是两条线，别混）'
              }
            } catch { /* 没有就算了 */ }
            let 关系句 = ''
            try {
              if (配置.关系账 !== false && 配置.关系进注入 === true) {
                // 身份头被世界剥掉了 —— 和判定那边一样，用显式表兜底
                let 谁 = 认说话人(话, { 主人名字: 配置.主人名字 })
                if (!谁 && 配置.会话里的人 && typeof 配置.会话里的人 === 'object')
                  谁 = String(配置.会话里的人[key] || 配置.会话里的人[key.replace(/^session-/, '')] || '').trim().slice(0, 16)
                // ⚠ 关系账是全局的（2026-11-26 改过）：这里别读会话里的 s.关系，那个永远是空的
                //   （大肥鱼 11-26 抓到的 bug：存关系表 写顶层，注入却读 s.关系，那行永远不出现）
                const 条 = 谁 ? 读关系表()[谁] : null
                if (谁 && 条 && Number(条.次) > 0)
                  关系句 = '（这会儿跟我说话的是' + 显示名(谁, 条) + '，亲 ' + Math.round(规范化(条).亲 * 100) + '% / 敌 ' + Math.round(规范化(条).敌 * 100) + '% / 信 ' + Math.round(规范化(条).信 * 100) + '%，' + 关系话(条) + '）'
              }
            } catch { /* 没有关系账就算了 */ }
            try {
              // 只在变化时记一行，方便核「那行到底有没有进上下文」
              if (关系句 && 模块级.上次关系句 !== 关系句) {
                模块级.上次关系句 = 关系句
                appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 关系句 ' + 关系句 + '\n')
              }
            } catch { /* ignore */ }
            const 结果 = [主句, 我的心情, 关系句, 想起, 笔记句].filter(Boolean).join('\n')
            本轮结果.set(key, { 话, 结果 })
            return 结果
          } catch (e) { try { appendFileSync(join(目录, 'diag.log'), new Date().toISOString() + ' 心境注入失败：' + (e && e.message) + '\n') } catch (e2) { /* ignore */ } ; return '' }
        },
      })

    }
  }

  try { ctx.on('agent/ready', 挂钩) } catch { /* 老内核没这个事件就算了 */ }
  try { ctx.effect(() => { const t = setInterval(挂钩, 3_000); return () => clearInterval(t) }, '情绪记忆：挂载注入') } catch { /* ignore */ }
  挂钩()


  // 配置读写（设置页用）
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/config',
      handler: async (req, res) => {
        let 补 = {}
        try {
          if (req && typeof req.json === 'function') {
            // 新内核给的是标准 Request：body 只能读一次，用 json()
            补 = await req.json()
          } else if (req && typeof req.url === 'string' && !req.on) {
            补 = {}
          } else if (req && typeof req.on === 'function') {
            const raw = await new Promise((resolve) => {
              let buf = ''
              req.on('data', (c) => { buf += c })
              req.on('end', () => resolve(buf))
              req.on('error', () => resolve(''))
            })
            补 = JSON.parse(raw || '{}')
          }
        } catch { 补 = {} }
        let 写错 = ''
        let 收了 = null
        const 收到 = 补 && typeof 补 === 'object' ? Object.keys(补).filter((k) => k !== '') : []
        try {
          const 新配 = 收到.length ? { ...配置, ...补 } : 配置
          收了 = Object.keys(补 || {})
          if (收到.length) writeFileSync(join(目录, 'config.json'), JSON.stringify(新配, null, 2), 'utf8')
          Object.assign(配置, 新配)
          Object.assign(运行配置, 新配)
        } catch (e) { 写错 = (e && e.message) || '写失败' }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, 配置, 收到键: 收了, 写错 }))
      },
    }), '情绪记忆：配置路由')
  } catch { /* ignore */ }

  // 会话列表（绑定用）：只列**现在活着**的会话（ctx.agents），标题从投影缓存补；
  // 不扫全部历史 —— 归档的和子 agent 不该出现在绑定里。
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/sessions',
      handler: async (req, res) => {
        const 条 = []
        const 活 = (ctx.agents && ctx.agents.list) ? ctx.agents.list() : []
        for (const a of 活) {
          const id = 会话键(a && a.session && a.session.id)
          if (!id) continue
          let title = ''
          for (const 名 of [id + '.json', 'session-' + id + '.json']) {
            try {
              const f = join(homedir(), '.dsh', 'storages', 'session_projcache', 'sessions', 名)
              const j = JSON.parse(readFileSync(f, 'utf8'))
              const t = j && j.record && j.record.rows && j.record.rows.title
              if (t && t.val) { title = String(t.val); break }
            } catch { /* 换个文件名再试 */ }
          }
          条.push({ id: id, title: title.slice(0, 40) })
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, 条: 条 }))
      },
    }), '情绪记忆：会话列表路由')

  } catch { /* ignore */ }


  // 回忆记录
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/recalls',
      handler: async (req, res) => {
        const u = new URL(req.url, 'http://x')
        const key = 选会话(u.searchParams.get('session'))
        const s = 读一份(key)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, key, 条: (s.recalls || []).slice().reverse() }))
      },
    }), '情绪记忆：回忆记录路由')
  } catch { /* ignore */ }

  // 记忆列表（分页 + 关键词）
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/memories',
      handler: async (req, res) => {
        const u = new URL(req.url, 'http://x')
        const key = 选会话(u.searchParams.get('session'))
        const 词 = String(u.searchParams.get('q') || '')
        const 起 = Math.max(0, Number(u.searchParams.get('offset')) || 0)
        const 数 = Math.min(50, Number(u.searchParams.get('limit')) || 20)
        const { 条目 } = 读记忆(key)
        const 过滤 = 词 ? 条目.filter((m) => String(m.text || '').includes(词) || (m.tags || []).some((t) => String(t).includes(词))) : 条目
        const 总 = 过滤.length
        const 半衰 = Math.max(1, Number(配置.半衰期天) || 14)
        const 现在 = Date.now()
        const 页 = 过滤.slice().reverse().slice(起, 起 + 数).map((m) => {
          const at = Date.parse(m.at || m.createdAt || 0) || 0
          const 天 = Math.max(0, (现在 - at) / 86400000)
          return {
            id: m.id, text: String(m.text || ''), at: m.at || m.createdAt, tags: m.tags || [],
            重要度: Number(m.importance) || 0,
            类别: m.category || '',
            affect: m.affect || null,
            想起次数: Number(m.hits) || 0,
            最近想起: m.lastHit || null,
            年龄天: Math.round(天 * 10) / 10,
            新鲜度: Math.round(Math.exp(-天 / 半衰) * 100) / 100,
          }
        })
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, key, 总, 条: 页 }))
      },
    }), '情绪记忆：记忆列表路由')
  } catch { /* ignore */ }

  // 依赖与模型状态（设置页显示用）
  try {
    ctx.effect(() => { try { return ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/api/env',
      handler: (req, res) => {
        let 出 = { ok: true }
        try {
          const 家 = process.env.DSH_HOME || join(homedir(), '.dsh')
          const 模型目录 = join(家, 'emotion-memory', 'models', 'bge-small-zh')
          const 有 = (f) => { try { return existsSync(f) } catch { return false } }
          const 依赖 = 有(join(根插件目录(), 'node_modules', '@huggingface', 'transformers')) && 有(join(根插件目录(), 'node_modules', 'onnxruntime-node'))
          const 模型 = 有(join(模型目录, 'onnx', 'model_quantized.onnx')) || 有(join(模型目录, 'onnx', 'model.onnx'))
          出 = { ok: true, 依赖: { 装了: 依赖 }, 模型: { 就绪: 模型, 路径: 模型目录 }, 日志: join(家, 'emotion-memory', 'install.log') }
        } catch (e) { 出 = { ok: false, error: String((e && e.message) || e) } }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(出))
      },
    }) } catch (e2) { /* ignore */ } }, 'emotion-memory: env')
  } catch { /* ignore */ }

  // 安装日志
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/api/env/log',
      handler: (req, res) => {
        let 文本 = ''
        try {
          const 家 = process.env.DSH_HOME || join(homedir(), '.dsh')
          const 日志 = join(家, 'emotion-memory', 'install.log')
          const 全 = existsSync(日志) ? readFileSync(日志, 'utf8') : ''
          文本 = 全.length > 20000 ? 全.slice(-20000) : 全
        } catch (e) { 文本 = '读日志失败：' + String((e && e.message) || e) }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, 文本 }))
      },
    }), 'emotion-memory: env 日志')
  } catch { /* ignore */ }

  // 一键装依赖 + 下模型：写固定 ps1 再 -File 跑
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/api/env/install',
      handler: (req, res) => {
        let 出 = { ok: true }
        try {
          const 家 = process.env.DSH_HOME || join(homedir(), '.dsh')
          const 目录2 = join(家, 'emotion-memory')
          try { mkdirSync(目录2, { recursive: true }) } catch { /* ignore */ }
          const 日志 = join(目录2, 'install.log')
          const 脚本 = join(目录2, 'install.ps1')
          const 插件 = 根插件目录()
          const 模型 = join(目录2, 'models', 'bge-small-zh')
          try {
            if (existsSync(日志)) {
              const 旧 = readFileSync(日志, 'utf8')
              const m = 旧.match(/== 开始 ==[\s\S]*?(== 完成 ==)?$/)
              const 有完成 = /== 完成 ==/.test(旧)
              if (!有完成 && m && Date.now() - statSync(日志).mtimeMs < 10 * 60000) {
                出 = { ok: false, error: '上一次安装还没结束（日志 10 分钟内）' }
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
                res.end(JSON.stringify(出))
                return
              }
            }
          } catch { /* ignore */ }
          const 行 = [
            '$ErrorActionPreference = "Continue"',
            '$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8',
            '$log = "' + 日志 + '"',
            '"== 开始 ==" | Out-File -FilePath $log -Encoding utf8',
            'Set-Location "' + 插件 + '"',
            '"npm install ..." | Out-File -FilePath $log -Append -Encoding utf8',
            'npm install @huggingface/transformers onnxruntime-node --no-audit --no-fund 2>&1 | Out-File -FilePath $log -Append -Encoding utf8',
            '$d = "' + 模型 + '"',
            'New-Item -ItemType Directory -Force -Path "$d/onnx" | Out-Null',
            '$b = "https://hf-mirror.com/Xenova/bge-small-zh-v1.5/resolve/main"',
            'foreach ($f in @("config.json","tokenizer.json","tokenizer_config.json","special_tokens_map.json")) { "下载 $f" | Out-File -FilePath $log -Append -Encoding utf8; curl.exe -sL -o "$d/$f" "$b/$f" }',
            '"下载 model" | Out-File -FilePath $log -Append -Encoding utf8',
            'curl.exe -sL -o "$d/onnx/model_quantized.onnx" "$b/onnx/model_quantized.onnx"',
            '"== 完成 ==" | Out-File -FilePath $log -Append -Encoding utf8',
          ].join(String.fromCharCode(10))
          writeFileSync(脚本, '\uFEFF' + 行, 'utf8')
          try { appendFileSync(日志, '== 已排队 ' + new Date().toLocaleTimeString() + ' ==' + String.fromCharCode(10), 'utf8') } catch { writeFileSync(日志, '== 已排队 ==' + String.fromCharCode(10), 'utf8') }
          // 自己 spawn 的子进程会随 DSH 的作业对象被回收，WMI 在这台机器上又不稳，
          // 改用一次性计划任务：schtasks 建了就跑，进程归任务计划服务管，活得过本次请求
          const 任务名 = 'DFY-EmoInstall'
          // 用 vbs 静默拉起：schtasks 直接跑 powershell 会闪一个黑窗
          const vbs = join(目录2, 'install-hidden.vbs')
          const vbs文 = [
            'Set sh = CreateObject("WScript.Shell")',
            'sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + 脚本 + '""", 0, False',
          ].join(String.fromCharCode(13) + String.fromCharCode(10))
          writeFileSync(vbs, vbs文, 'utf8')
          const 命令 = 'wscript.exe "' + vbs + '"'
          try {
            execFileSync('schtasks', ['/Create', '/TN', 任务名, '/TR', 命令, '/SC', 'ONCE', '/ST', '00:00', '/F'], { windowsHide: true, timeout: 20000 })
            execFileSync('schtasks', ['/Run', '/TN', 任务名], { windowsHide: true, timeout: 20000 })
          } catch (e) { throw new Error('建计划任务失败：' + String((e && e.message) || e)) }
          出 = { ok: true, 日志, 说明: '已开始，进度显示在设置页里' }
        } catch (e) { 出 = { ok: false, error: String((e && e.stack) || e) } }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(出))
      },
    }), 'emotion-memory: env 安装')
  } catch { /* ignore */ }

  // 判定历史
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/timeline',
      handler: async (req, res) => {
        const u = new URL(req.url, 'http://x')
        const key = 选会话(u.searchParams.get('session'))
        const s = 读一份(key)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, key, 条: (s.history || []).slice(-60).reverse() }))
      },
    }), '情绪记忆：历史路由')
  } catch { /* ignore */ }

  // 导出：配置 + 全部会话状态 + 它们的记忆（一个 JSON，够搬家）
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/export',
      handler: async (req, res) => {
        const 只要 = 会话键(new URL(req.url, 'http://x').searchParams.get('session'))
        const j = 读状态()
        const 记忆表 = {}
        const 会话表 = {}
        for (const key of Object.keys(j.sessions || {})) {
          if (只要 && key !== 只要) continue
          try {
            const { 条目 } = 读记忆(key)
            记忆表[key] = 条目
          } catch { /* 单个会话读失败就跳过 */ }
          会话表[key] = j.sessions[key]
        }
        const 出 = { 版本: 1, 导出时间: new Date().toISOString(), 配置, 状态: { sessions: 会话表 }, 记忆: 记忆表 }
        const 文件名 = 'emotion-memory-' + (只要 ? 只要.slice(0, 8) : 'all') + '.json'
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="' + 文件名 + '"' })
        res.end(JSON.stringify(出, null, 2))
      },
    }), '情绪记忆：导出路由')
  } catch { /* ignore */ }

  // 导入：合并配置、替换同名会话状态、把记忆条目并进去（按 id 去重）
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/import',
      handler: async (req, res) => {
        let 打 = {}
        try {
          const raw = await new Promise((resolve) => {
            let b = ''
            req.on('data', (c) => { b += c })
            req.on('end', () => resolve(b))
            req.on('error', () => resolve(''))
          })
          打 = JSON.parse(raw || '{}')
        } catch { 打 = {} }
        const 目标 = 会话键(new URL(req.url, 'http://x').searchParams.get('session'))
        let 导会话 = 0
        let 导记忆 = 0
        try {
          if (打.配置 && typeof 打.配置 === 'object') Object.assign(配置, 打.配置)
          if (打.状态 && 打.状态.sessions) {
            const j = 读状态()
            j.sessions = j.sessions || {}
            for (const [k, v] of Object.entries(打.状态.sessions)) {
              if (目标 && k !== 目标) continue
              j.sessions[k] = v; 导会话++
            }
            writeFileSync(状态文件, JSON.stringify(j, null, 2), 'utf8')
          }
          if (打.记忆 && typeof 打.记忆 === 'object') {
            for (const [k, 列] of Object.entries(打.记忆)) {
              if (!Array.isArray(列)) continue
              if (目标 && k !== 目标) continue
              let { 原始, 路径 } = 读记忆(k)
              if (!原始) {
                const 建 = 建记忆文件(k)
                if (!建) continue
                原始 = 建.原始
                路径 = 建.路径
              }
              原始.memories = Array.isArray(原始.memories) ? 原始.memories : []
              const 有 = new Set(原始.memories.map((m) => m.id))
              for (const m of 列) {
                if (!m || !m.id || 有.has(m.id)) continue
                原始.memories.push(m); 有.add(m.id); 导记忆++
              }
              writeFileSync(路径, JSON.stringify(原始, null, 2), 'utf8')
            }
          }
          writeFileSync(join(目录, 'config.json'), JSON.stringify({ ...配置, 绑定会话: Array.isArray(配置.绑定会话) ? 配置.绑定会话 : (配置.绑定会话 ? [配置.绑定会话] : []) }, null, 2), 'utf8')
        } catch { /* ignore */ }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, 导入会话: 导会话, 导入记忆: 导记忆 }))
      },
    }), '情绪记忆：导入路由')
  } catch { /* ignore */ }

  // 对外 API（给附属插件用，比如认知行为）：只读，返回当前情绪与精力。
  // 附属插件不该去读 state.json —— 那是内部存储，格式会变。
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/api/state',
      handler: (req, res) => {
        try {
          const 问会话 = new URL(req.url, 'http://x').searchParams.get('session') || ''
          const key = 问会话 && existsSync(join(目录, String(问会话).replace(/^session-/, '') + '.json'))
            ? String(问会话).replace(/^session-/, '')
            : 选会话(问会话)
          const s = 读一份(key)
          const 出 = {
            session: key,
            pad: { P: Number(s.pad.e.P), A: Number(s.pad.e.A), D: Number(s.pad.e.D) },
            词: s.pad.词 || '',
            派生: s.pad.派生 || {},
            强度: s.pad.强度 || {},
            energy: Math.round(Number(s.energy) || 0),
            at: Date.now(),
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(出))
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
        }
      },
    }), '情绪记忆：对外 API')
  } catch { /* ignore */ }

  // 网页路由：状态（给设置页/自查用）
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-emotion-memory/state',
      handler: async (req, res) => {
        const key = 选会话(new URL(req.url, 'http://x').searchParams.get('session'))
        const s = 读一份(key || 'default')
        const 记忆 = 检索(key, { 词: '', P: s.pad.e.P, A: s.pad.e.A, 上限: 5, 半衰天: Number(配置.半衰期天) || 14, 权重: { 新鲜: 配置.权重新鲜, 重要: 配置.权重重要, 相关: 配置.权重相关, 心境: 配置.权重心境, 访问加成: 配置.访问加成 } })
        const out = {
          ok: true,
          key,
          pad: s.pad.e,
          混合: s.pad.混合 || [],
          强度: s.pad.强度 || {},
          派生: s.pad.派生 || {},
          energy: s.energy,
          self: s.self || null,
          词表: 读词表(),
          行: 状态行(s.pad, s.energy, { 掩饰: 配置.掩饰层 !== false }),
          掩: 露与藏(s.pad.强度, s.pad.派生, { 精力: s.energy }),
          关系: 排行(读关系表(), 20, { 主人: 配置.主人名字 }),
          记忆样例: 记忆.map((m) => ({ 分: Math.round(m.分 * 100) / 100, text: m.text.slice(0, 80), affect: m.条.affect || null })),
          配置,
          绑定模式: 配置.绑定模式,
          绑定会话: 配置.绑定会话,
          绑定列表: Array.isArray(配置.绑定会话) ? 配置.绑定会话 : (配置.绑定会话 ? [配置.绑定会话] : []),
          本会话开着: (配置.绑定模式 !== '指定') || 会话键(配置.绑定会话) === key,
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(out))
      },
    }), '情绪记忆：状态路由')
  } catch { /* ignore */ }

  return {
    // 给外部（脚本/别的插件）用：盖章一条记忆
    盖章: (会话, id, 指纹) => 盖章(会话, id, 指纹),
    状态: () => 读状态(),
    配置: () => 配置,
  }
}
