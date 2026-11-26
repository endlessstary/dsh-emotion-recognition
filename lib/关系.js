// 关系.js —— 关系账（2026-11-26）：按「人」记三笔——亲近、敌视、信任
//
// 为什么三根轴：
//   · 亲近 / 敌视可分离（Cacioppo & Berntson 的评价空间模型；PN-RQ 把关系质量当双维，
//     「亲低敌低＝冷淡」和「亲低敌高＝敌对」是两种关系）
//   · 信任是第三根：它和亲近不共线——可以很亲近却不敢托付，也可以不亲近但信得过；
//     对敌意的人也适用（对手的话可能是算数的）。信任研究里它指「愿意让自己处于脆弱」
//     （Mayer/Davis/Schoorman 1995）——注意：**能力**评估属于「对他是什么样人的了解」，放记忆；
//     这里记的是「她敢不敢靠」。
//
// 底下的情绪场（PAD）仍然**按会话**存（11-25 定的没变）。
//
// ⚠ 谁是「主人」不能靠猜：私聊不等于主人。认人优先级：
//   ① payload.source.identity ② 正文身份头【QQ「某人」/ QQ群「…」 阿花 说】③ 老格式「昵称: 」
//   ④ 都不认 → 空（调用方当「还不认识的人」，绝不默认成主人）

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
const 圆 = (x) => Math.round(Number(x) * 100) / 100

export const 中性 = 0.3
export const 主人起点 = 0.5
export const 信起点 = 0.3      // 对陌生人：不预设信也不预设不信
export const 主人信起点 = 0.6
export const 陌生人 = '还不认识的人'

/** 正文开头的身份头（新格式）。 */
const 身份头 = /^【(?:QQ|微信)(群)?「([^」]*)」(?:\s+([^，]+?)\s+说)?，chatId [^】]+】/
/** 老格式：整段 JSON 塞在【消息来源 …】里（0.7.0 及更早的世界版本）。 */
const 老身份头 = /^【消息来源 (\{[\s\S]*?\})】/

/** 老账迁移：只有「暖」→ 亲近；没有信任 → 中性起点。 */
export function 规范化(条 = {}) {
  const t = 条 || {}
  const 亲 = Number.isFinite(Number(t.亲)) ? clamp(Number(t.亲), 0, 1) : clamp(Number(t.暖) || 0, 0, 1)
  const 敌 = clamp(Number(t.敌) || 0, 0, 1)
  const 信 = Number.isFinite(Number(t.信)) ? clamp(Number(t.信), 0, 1) : 信起点
  return { ...t, 亲: 圆(亲), 敌: 圆(敌), 信: 圆(信) }
}

/** 这一段话是谁说的。返回名字，认不出来返回 ''。 */
export function 认说话人(文 = '', 参 = {}) {
  const id = 参 && 参.身份
  if (id && typeof id === 'object' && 名从身份(id)) return 名从身份(id).slice(0, 16)
  const m = String(文 || '').match(身份头)
  if (m) {
    const 名 = (m[3] || '').trim() || (m[1] ? '' : String(m[2] || '').trim())
    if (名) return 名.slice(0, 16)
  }
  const 老 = String(文 || '').match(老身份头)
  if (老) {
    try {
      const j = JSON.parse(老[1])
      const 名 = 名从身份(j)
      if (名) return 名.slice(0, 16)
    } catch { /* 坏 JSON 就算了 */ }
  }
  const 旧 = String(文 || '').match(/^\s*([^\s:：\n]{1,16})[:：]\s+/)
  if (旧) return 旧[1]
  return ''
}

function 名从身份(id) {
  if (!id || typeof id !== 'object') return ''
  const 群 = id.conversationType === 'group'
  return String((群 ? (id.speakerName || id.speakerId) : (id.speakerName || id.conversationName)) || '').trim()
}

export function 是主人(名, 主人名字) {
  const 我 = String(主人名字 || '').trim()
  if (!我 || !名) return false
  return String(名).trim() === 我
}

/**
 * 记一次互动。
 *   正向：亲近涨（越亲近越难再涨），敌视慢慢退
 *   负向：敌视涨（越敌对越难再涨），亲近掉一点
 *   信任：只看「可信」（这一轮对方有没有兑现/靠不靠谱），没涉及就不动 —— 不跟着情绪漂
 * @param {{主人?: string, 步长?: number}} 参
 */
export function 记一次(关系 = {}, 名字 = '', 评估 = {}, at = Date.now(), 参 = {}) {
  const 名 = String(名字 || '').trim().slice(0, 16) || 陌生人
  const 主 = 是主人(名, 参.主人)
  const 起点 = 主 ? 主人起点 : 中性
  const 旧 = 规范化((关系 && 关系[名]) || { 亲: 起点, 敌: 0, 信: 主 ? 主人信起点 : 信起点, 次: 0 })
  const 愿 = clamp(Number(评估 && 评估.desirability) || 0, -1, 1)
  const 信度 = clamp(Number(评估 && 评估.confidence) || 0, 0, 100) / 100
  const 步 = Number.isFinite(Number(参.步长)) ? Number(参.步长) : 0.05
  // 耦合强度：0 = 各走各的（解耦），1 = 强耦合。默认 0.5 / 0.7
  const 消退 = Number.isFinite(Number(参.消退)) ? clamp(Number(参.消退), 0, 1) : 0.5   // 一次好相处，敌意退多少
  const 折扣 = Number.isFinite(Number(参.折扣)) ? clamp(Number(参.折扣), 0, 1) : 0.7   // 一次被惹，亲近掉多少

  let 亲 = 旧.亲
  let 敌 = 旧.敌
  if (愿 > 0) {
    亲 = clamp(亲 + 愿 * 步 * 信度 * (1 - 亲), 0, 1)
    敌 = clamp(敌 - 愿 * 步 * 消退 * 信度, 0, 1)
  } else if (愿 < 0) {
    const 强 = Math.abs(愿)
    敌 = clamp(敌 + 强 * 步 * 1.5 * 信度 * (1 - 敌), 0, 1)
    亲 = clamp(亲 - 强 * 步 * 折扣 * 信度, 0, 1)
  }

  // 信任：只有判定明确给出「可信」时才动（没涉及承诺/能力 → 0，不动）
  let 信 = 旧.信
  const 可信 = clamp(Number(评估 && 评估.可信) || 0, -1, 1)
  if (可信 > 0) 信 = clamp(信 + 可信 * 步 * 1.2 * 信度 * (1 - 信), 0, 1)
  else if (可信 < 0) 信 = clamp(信 + 可信 * 步 * 1.2 * 信度 * 信, 0, 1)

  return {
    ...(关系 || {}),
    [名]: {
      ...(旧 && 旧.昵称 ? { 昵称: 旧.昵称 } : {}),
      ...(旧 && 旧.备注 ? { 备注: 旧.备注 } : {}),
      亲: 圆(亲),
      敌: 圆(敌),
      信: 圆(信),
      次: (Number(旧.次) || 0) + 1,
      最近: at,
      理由: 评估 && 评估.reason ? String(评估.reason).slice(0, 40) : (旧.理由 || ''),
    },
  }
}

/** 她对这个人自己的叫法（昵称）；没有昵称就用账号名。 */
export function 显示名(名 = '', 条 = null) {
  const 昵称 = 条 && typeof 条.昵称 === 'string' ? 条.昵称.trim() : ''
  return String(昵称 || 名 || '').slice(0, 16)
}

/** 给关系账里的人起个叫法。名字必须是账上已有的。 */
export function 起个昵称(关系 = {}, 名字 = '', 叫法 = '') {
  const 名 = String(名字 || '').trim()
  if (!名 || !关系 || !关系[名]) return null
  const 新 = String(叫法 || '').trim().slice(0, 16)
  return { ...关系, [名]: { ...规范化(关系[名]), 昵称: 新 } }
}

/**
 * 她**自己定**一个人的信任度（日常微调由判定负责，这里是一次性定调）。
 * 账上没有这个人也能建 —— 比如「他很可靠的人介绍来的，我先给 0.7」。
 * @param {number} 信 0…1
 */
export function 定信任(关系 = {}, 名字 = '', 信 = 0.3, 备注 = '', 参 = {}) {
  const 名 = String(名字 || '').trim().slice(0, 16)
  if (!名) return null
  const 主 = 是主人(名, 参.主人)
  const 旧 = 规范化((关系 && 关系[名]) || { 亲: 主 ? 主人起点 : 中性, 敌: 0, 信: 主 ? 主人信起点 : 信起点, 次: 0 })
  const 新信 = 圆(clamp(Number(信), 0, 1))
  const 注 = String(备注 || '').trim().slice(0, 60)
  return {
    ...(关系 || {}),
    [名]: {
      ...旧,
      ...(旧.昵称 ? { 昵称: 旧.昵称 } : {}),
      信: 新信,
      ...(注 ? { 备注: 注 } : {}),
      ...(Number(旧.次) ? { 最近: Date.now() } : {}),
    },
  }
}

/** 三根轴翻成人话。只描述，不指令。 */
export function 关系话(条 = {}) {
  const t = 规范化(条)
  const 次 = Number(t.次) || 0
  const 信 = t.信
  if (!次 && !t.备注) return '还没打过交道'
  // 敌意高的时候，信任是**单独**的一句话：对手的话也可能是算数的
  if (t.敌 >= 0.5) return 信 >= 0.6 ? '敌对，但对方说话算数' : '敌对'
  if (t.亲 >= 0.55 && t.敌 >= 0.25) return 信 >= 0.6 ? '亲近，心里憋着气，但信得过' : '亲近，但心里憋着气'
  if (t.敌 >= 0.3) return 信 >= 0.6 ? '不喜欢，但信得过' : '不喜欢'
  if (t.亲 >= 0.75 && t.敌 < 0.15) return 信 >= 0.6 ? '很熟、很放心' : '很熟，但还不太敢托付'
  if (t.亲 >= 0.55) return 信 < 0.35 ? '挺亲近，但不敢托付' : '挺亲近'
  if (t.亲 >= 0.4) return 信 >= 0.7 ? '还行，但信得过' : '还行'
  if (t.亲 >= 0.25) return 信 >= 0.7 ? '有点生，但信得过' : '有点生'
  return 信 >= 0.7 ? '不太亲，但信得过' : '很生'
}

/**
 * 给界面/接口用。排法（2026-11-26 岁岁定）：
 *   ① **主人永远第一**（靠 主人名字 认，改昵称不影响）
 *   ② 其余：把 亲近 / 敌视 / 信任 三个数**降序排好，逐位比**（第一高的比完比第二高，再比第三高）——
 *      这样「亲 0.9」和「敌 0.9」不会被当成一样重，而「敌 0.8、信 0.9」的人也能靠信任提到前面
 *   ③ 三个数完全相同：亲近分高的在上；亲近也相同，信任分高的在上；再相同就比谁更近
 * @param {{主人?: string}} 参 主人名字
 */
export function 排行(关系 = {}, n = 5, 参 = {}) {
  const 主人 = String(参.主人 || '').trim()
  const 降序三 = (条) => [条.亲, 条.敌, 条.信].sort((x, y) => y - x)
  return Object.entries(关系 || {})
    .map(([名, 原]) => {
      const 条 = 规范化(原)
      const 三 = 降序三(条)
      return {
        名, 昵称: (条 && 条.昵称) || '', 备注: (条 && 条.备注) || '', 显示: 显示名(名, 条),
        亲: 条.亲, 敌: 条.敌, 信: 条.信, 净: 圆(条.亲 - 条.敌),
        强: 三[0], 三, 主: Boolean(主人 && 名 === 主人),
        次: Number(条.次) || 0, 最近: Number(条.最近) || 0, 话: 关系话(条),
      }
    })
    .sort((a, b) => {
      if (a.主 !== b.主) return a.主 ? -1 : 1
      for (let i = 0; i < 3; i++)
        if (a.三[i] !== b.三[i]) return b.三[i] - a.三[i]
      // 三个数完全一样：先看亲近，再看信任
      if (a.亲 !== b.亲) return b.亲 - a.亲
      if (a.信 !== b.信) return b.信 - a.信
      return b.最近 - a.最近
    })
    .slice(0, n)
}
