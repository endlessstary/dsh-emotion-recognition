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
// 遗忘（2026-11-26）：两段——先「降温」（悄声回到中性），再「淡忘」（归档，数据留着能恢复）
export const 半衰天 = 45        // 亲近/敌视回到中性的一半要多久
export const 信半衰天 = 90      // 信任掉得慢（信任是靠时间攒的）
export const 归档天 = 90        // 多久没说话才可能被淡忘
export const 归档强度 = 0.25    // 强度（三轴最高）已经低于这个才淡忘

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
 * 从结构化身份里取「渠道 + 编号」。
 * QQ 的身份是 `{ channel:'qq', speakerId:'qq:123456' }`，微信将来是 `wechat:wxid_xxx`。
 * 昵称可以重名、可以随时改，编号不会 —— 认主人优先用这个。
 */
export function 账号从(身份) {
  if (!身份 || typeof 身份 !== 'object') return { 渠道: '', 号: '' }
  const 原 = String(身份.speakerId || '').trim()
  const 渠道 = String(身份.channel || '').trim()
  const 号 = 原.includes(':') ? 原.slice(原.indexOf(':') + 1) : 原
  return { 渠道, 号 }
}

/**
 * 这个账号在不在主人名单里。名单写成 `['qq:123456', 'wechat:wxid_xxx']`（也接受只写编号）。
 */
export function 是主人账号(编号, 名单) {
  if (!编号 || !编号.号) return false
  const 列 = Array.isArray(名单) ? 名单 : String(名单 || '').split(/[,，\s]+/)
  const 全 = 编号.渠道 ? 编号.渠道 + ':' + 编号.号 : 编号.号
  return 列.map((x) => String(x || '').trim()).filter(Boolean).some((x) => x === 全 || x === 编号.号)
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
  const 主 = 参.主 === true || 是主人(名, 参.主人)
  const 渠道 = String(参.渠道 || '').trim().slice(0, 12)
  const 起点 = 主 ? 主人起点 : 中性
  const 旧 = 规范化((关系 && 关系[名]) || { 亲: 起点, 敌: 0, 信: 主 ? 主人信起点 : 信起点, 次: 0 })
  const 愿 = clamp(Number(评估 && 评估.desirability) || 0, -1, 1)
  const 信度 = clamp(Number(评估 && 评估.confidence) || 0, 0, 100) / 100
  const 步 = (Number.isFinite(Number(参.步长)) ? Number(参.步长) : 0.05)
    * (旧.二手 === true && 参.二手 !== true ? 1.5 : 1)   // 传闻的人第一次真见到：那次格外算数
  // 耦合强度：0 = 各走各的（解耦），1 = 强耦合。默认 0.5 / 0.7
  const 消退 = Number.isFinite(Number(参.消退)) ? clamp(Number(参.消退), 0, 1) : 0.5   // 一次好相处，敌意退多少
  const 折扣 = Number.isFinite(Number(参.折扣)) ? clamp(Number(参.折扣), 0, 1) : 0.7   // 一次被惹，亲近掉多少
  // 场合只读（2026-11-26）：有些场合（比如一起改插件）只该证明「在场」，不该改「处得怎么样」。
  // 这时三个数一动不动，只更新 最近 / 次数 —— 免得天天讨论 bug 把关系聊坏。
  const 只记在场 = 参.只记在场 === true

  // 二手（2026-11-27）：从别人口中听来的印象——没打过交道，也可能已经有看法。
  // 三条限制跟着人的直觉走：
  //   · 涨得浅、有天花板：亲近最多到 0.7、信任最多到 0.6（传闻撑不起「很信」，得自己处）；
  //   · 坏话更算数：负面偏差，敌视的步长打 0.8 折（好话只打 0.5 折），而且敌视不封顶；
  //   · 谁说的也算数：转述者的信任度越高，这条传闻分量越足（0.5 ~ 1 倍）。
  const 二手 = 参.二手 === true
  const 源信 = 二手 ? clamp(Number(参.来源信) || 0, 0, 1) : 1
  const 权 = 二手 ? 0.5 + 0.5 * 源信 : 1
  const 亲顶 = 二手 ? 0.7 : 1
  const 信顶 = 二手 ? 0.6 : 1
  const 好折 = 二手 ? 0.8 : 1
  const 坏折 = 二手 ? 1.2 : 1

  let 亲 = 旧.亲
  let 敌 = 旧.敌
  if (!只记在场) {
    if (愿 > 0) {
      亲 = clamp(亲 + 愿 * 步 * 信度 * (1 - 亲) * 好折 * 权, 0, 亲顶)
      敌 = clamp(敌 - 愿 * 步 * 消退 * 信度 * 权, 0, 1)
    } else if (愿 < 0) {
      const 强 = Math.abs(愿)
      敌 = clamp(敌 + 强 * 步 * 1.5 * 信度 * (1 - 敌) * 坏折 * 权, 0, 1)
      亲 = clamp(亲 - 强 * 步 * 折扣 * 信度 * 权, 0, 1)
    }
  }

  // 信任：只有判定明确给出「可信」时才动（没涉及承诺/能力 → 0，不动）
  let 信 = 旧.信
  const 可信 = clamp(Number(评估 && 评估.可信) || 0, -1, 1)
  if (!只记在场) {
    if (可信 > 0) 信 = clamp(信 + 可信 * 步 * 1.2 * 信度 * (1 - 信) * (二手 ? 0.8 : 1) * 权, 0, 信顶)
    else if (可信 < 0) 信 = clamp(信 + 可信 * 步 * 1.2 * 信度 * 信 * (二手 ? 1.2 : 1) * 权, 0, 1)
  }

  const 前次 = Number(旧.次) || 0
  const 传闻 = 二手
    ? [...(Array.isArray(旧.听闻) ? 旧.听闻 : []), { 谁: String(参.谁 || '').slice(0, 16), at, 话: String(参.话 || '').slice(0, 40) }].slice(-3)
    : (Array.isArray(旧.听闻) ? 旧.听闻 : [])

  // 从旧条目展开着改，别白名单重建：定调标记、听闻历史这些字段丢了就找不回来了
  const 出 = {
    ...旧,
    亲: 圆(亲),
    敌: 圆(敌),
    信: 圆(信),
    次: 二手 ? 前次 : 前次 + 1,
    最近: 二手 ? (前次 ? (Number(旧.最近) || at) : at) : at,
    理由: 只记在场 ? (旧.理由 || '')
      : (评估 && 评估.reason ? String(评估.reason).slice(0, 40) : (旧.理由 || '')),
  }
  if (渠道 || 旧.渠道) 出.渠道 = 渠道 || 旧.渠道
  // 账号 id 挂到账上：以后他换昵称、换号，都能靠这个认回同一条账
  const 这账号 = String(参.账号 || '').trim().slice(0, 40)
  if (这账号) {
    const 旧号 = Array.isArray(旧.账号) ? 旧.账号.filter((x) => typeof x === 'string') : []
    出.账号 = (旧号.includes(这账号) ? 旧号 : 旧号.concat(这账号)).slice(-6)
  }
  if (二手 && !前次) 出.二手 = true
  else if (!二手) delete 出.二手
  if (传闻.length) 出.听闻 = 传闻
  delete 出.暖          // 老账的「暖」已经在 规范化 里折成「亲」了，别再写回去
  if (旧.淡忘) { 出.淡忘 = false; 出.唤醒 = at; delete 出.淡忘于 }
  return { ...(关系 || {}), [名]: 出 }
}

/** 她对这个人自己的叫法（昵称）；没有昵称就用账号名。 */
export function 显示名(名 = '', 条 = null) {
  const 昵称 = 条 && typeof 条.昵称 === 'string' ? 条.昵称.trim() : ''
  const 全名 = 条 && typeof 条.全名 === 'string' ? 条.全名.trim() : ''
  return String(昵称 || 全名 || 名 || '').slice(0, 16)
}

/**
 * 括号里那行。账号名不等于真名：一个人自己认可的名字（「我叫珑岁之」）优先，
 * 没说过才退回账号名/群昵称。
 */
export function 括号名(名 = '', 条 = null) {
  const 全名 = 条 && typeof 条.全名 === 'string' ? 条.全名.trim() : ''
  return String(全名 || 名 || '').slice(0, 24)
}

/**
 * 账上挂过的账号（`qq:123` / `wechat:wxid…`）。昵称会改、账号名可能不止一个，
 * 但账号 id 是稳的：认人时先按它找，找到就并到同一条账。
 */
export function 认账号(关系 = {}, 账号 = '') {
  const a = String(账号 || '').trim()
  if (!a) return ''
  for (const [名, 原] of Object.entries(关系 || {})) {
    if (原 && Array.isArray(原.账号) && 原.账号.includes(a)) return 名
  }
  return ''
}

/**
 * 记下「这个人自己认可的名字」（全名）。和另外两个名字的区别：
 *   · 账号名（账的 key）——消息头里那个，可能是网名，也可能换；
 *   · 昵称（她的叫法）——她自己给人起的，比如把 Dylanzh 叫成「岁岁」；
 *   · 全名（这里）——人自己说的「我叫珑岁之」，跨账号也认这个。
 */
export function 定全名(关系 = {}, 名字 = '', 全名 = '', 参 = {}) {
  const 名 = String(名字 || '').trim().slice(0, 16)
  if (!名) return null
  const 文 = String(全名 || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  const 主 = 是主人(名, 参.主人)
  const 旧 = 规范化((关系 && 关系[名]) || { 亲: 主 ? 主人起点 : 中性, 敌: 0, 信: 主 ? 主人信起点 : 信起点, 次: 0 })
  const 出 = { ...旧 }
  if (文) { 出.全名 = 文; 出.全名于 = Date.now() } else { delete 出.全名; delete 出.全名于 }
  return { ...(关系 || {}), [名]: 出 }
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
  return 定三轴(关系, 名字, { 信 }, 备注, 参)
}

/**
 * 她自己的「定调」：亲近 / 敌视 / 信任 三根轴，想写哪根写哪根（0~1）。
 * 一条账只认一次 —— 定过之后交给相处慢慢改（记一次 每轮都在挪亲近/敌视，
 * 判定明确给出可信/不可信时也会挪信任）。这样关系页上的数是「处出来的」，
 * 不是她随手改出来的。没记过账的人（次 = 0）也认，等于初见的印象。
 */
export function 定三轴(关系 = {}, 名字 = '', 值们 = {}, 备注 = '', 参 = {}) {
  const 名 = String(名字 || '').trim().slice(0, 16)
  if (!名) return null
  const 主 = 是主人(名, 参.主人)
  const 旧 = 规范化((关系 && 关系[名]) || { 亲: 主 ? 主人起点 : 中性, 敌: 0, 信: 主 ? 主人信起点 : 信起点, 次: 0 })
  if (旧.自定过) return null
  const 新 = { ...旧 }
  let 写了 = false
  for (const k of ['亲', '敌', '信']) {
    const v = 值们 && 值们[k]
    if (v == null || v === '') continue
    if (!Number.isFinite(Number(v))) return null
    新[k] = 圆(clamp(Number(v), 0, 1))
    写了 = true
  }
  if (!写了) return null
  const 注 = String(备注 || '').trim().slice(0, 60)
  return {
    ...(关系 || {}),
    [名]: {
      ...新,
      自定过: true,
      自定: { 亲: 新.亲, 敌: 新.敌, 信: 新.信, at: Date.now() },
      ...(注 ? { 备注: 注 } : {}),
      ...(Number(旧.次) ? { 最近: Date.now() } : {}),
    },
  }
}

/** 这条消息是从哪个渠道来的（qq / wechat / …）：身份里有就用，没有就看消息头。 */
export function 渠道从(身份, 文 = '') {
  const ch = 身份 && typeof 身份 === 'object' ? String(身份.channel || '').trim() : ''
  if (ch) return ch.slice(0, 12)
  const s = String(文 || '')
  if (/^【微信/.test(s)) return 'wechat'
  if (/^【QQ/.test(s)) return 'qq'
  return ''
}
/** 一个数按半衰期回到中性（天 = 多少天没说话，半衰 = 几天掉一半）。 */
const 融 = (v, 中, 天, 半衰) => {
  if (!(天 > 0) || !(半衰 > 0)) return v
  return 中 + (v - 中) * Math.pow(0.5, 天 / 半衰)
}

/** 按「多久没说话」给一个人降温 —— 多年不联系的关系会慢慢回到中性。 */
export function 降温(条 = {}, 现在 = Date.now(), 参 = {}) {
  const t = 规范化(条)
  const 最近 = Number(t.最近) || 0
  if (!最近) return t
  const 天 = Math.max(0, (现在 - Number(最近)) / 86400000)
  if (天 < 1) return t
  const 半亲 = Number.isFinite(Number(参.半衰天)) ? Number(参.半衰天) : 半衰天
  const 半信 = Number.isFinite(Number(参.信半衰天)) ? Number(参.信半衰天) : 信半衰天
  // 敌意淡得慢（半衰 ×2.5）：记仇比记好更持久
  return { ...t, 亲: 圆(融(t.亲, 中性, 天, 半亲)), 敌: 圆(融(t.敌, 0, 天, 半亲 * 2.5)), 信: 圆(融(t.信, 中性, 天, 半信)) }
}

/**
 * 每天扫一遍关系账：先降温，再把「很久没说话 + 强度已经很低」的标成淡忘。
 * 淡忘只是**标记**（数据留着，能恢复）：她再和这个人说一句话就自动取消。
 * 主人永远不降温、不淡忘。
 */
export function 扫一遍(关系 = {}, 现在 = Date.now(), 参 = {}) {
  const 主人 = String(参.主人 || '').trim()
  const 基准天数 = Number.isFinite(Number(参.归档天)) ? Number(参.归档天) : 归档天
  const 门槛 = Number.isFinite(Number(参.归档强度)) ? Number(参.归档强度) : 归档强度
  const 出 = {}
  let 新淡忘 = 0
  for (const [名, 原] of Object.entries(关系 || {})) {
    // 主人不降温也不淡忘：不管多久没说话，他都在那儿
    if (主人 && 名 === 主人) { 出[名] = 规范化(原); continue }
    const 条 = 降温(原, 现在, 参)
    if (条.淡忘) { 出[名] = 条; continue }
    const 最近 = Number(条.最近) || 0
    const 闲 = 最近 ? (现在 - Number(最近)) / 86400000 : Infinity
    // 传闻过期得快：没打过交道、只听过别人说的人，30 天没人再提起就归档
    const 天数 = (Number(条.次) || 0) ? 基准天数 : Math.min(基准天数, 30)
    // ⚠ 不能拿 max(亲,敌,信) 当强度：降温是往 0.3 回的，max 永远 ≥0.3，永远归档不了。
    //   所以这里看「离中性多远」——淡定下来的路人 ≈ 0，曾经很要好的人离得远（不会被归档）。
    const 偏 = Math.max(Math.abs(条.亲 - 中性), 条.敌, Math.abs(条.信 - 中性))
    if (闲 >= 天数 && 偏 <= 门槛) {
      出[名] = { ...条, 淡忘: true, 淡忘于: 现在 }
      新淡忘 += 1
      continue
    }
    出[名] = 条
  }
  return { 关系: 出, 新淡忘 }
}
/** 三根轴翻成人话。只描述，不指令。 */
export function 关系话(条 = {}) {
  const t = 规范化(条)
  const 次 = Number(t.次) || 0
  const 信 = t.信
  const 有传闻 = Array.isArray(t.听闻) && t.听闻.length > 0
  if (!次) {
    if (有传闻) return '还没打过交道，只是听人说起过'
    if (!t.备注) return '还没打过交道'
  }
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
/**
 * 她对某个人的「看法」——一页纸的当前结论（「岁岁这人：改东西有耐心，但一改起来就不肯睡」）。
 * 和记忆不同：记忆记「发生过什么」，看法记「我现在怎么看」，可以随时重写。
 * 不碰三根轴、不碰次数，只写这一段话。
 */
export function 定看法(关系 = {}, 名字 = '', 看法 = '', 参 = {}) {
  const 名 = String(名字 || '').trim().slice(0, 16)
  if (!名) return null
  const 文 = String(看法 || '').replace(/\s+/g, ' ').trim().slice(0, 400)
  const 主 = 是主人(名, 参.主人)
  const 旧 = 规范化((关系 && 关系[名]) || { 亲: 主 ? 主人起点 : 中性, 敌: 0, 信: 主 ? 主人信起点 : 信起点, 次: 0 })
  const 出 = { ...旧, ...(文 ? { 看法: 文, 看法于: Date.now() } : {}) }
  if (!文) { delete 出.看法; delete 出.看法于 }
  return { ...(关系 || {}), [名]: 出 }
}

/** 三个数写成一句话，给界面和注入用。 */
export function 排行(关系 = {}, n = 5, 参 = {}) {
  const 主人 = String(参.主人 || '').trim()
  const 含淡忘 = 参.含淡忘 === true
  const 降序三 = (条) => [条.亲, 条.敌, 条.信].sort((x, y) => y - x)
  return Object.entries(关系 || {})
    .filter(([, 原]) => 含淡忘 || !(原 && 原.淡忘))
    .map(([名, 原]) => {
      const 条 = 规范化(原)
      const 三 = 降序三(条)
      return {
        名, 昵称: (条 && 条.昵称) || '', 备注: (条 && 条.备注) || '', 显示: 显示名(名, 条),
        全名: (条 && 条.全名) || '', 括号: 括号名(名, 条),
        账号: Array.isArray(条.账号) ? 条.账号.slice(0, 6) : [],
        亲: 条.亲, 敌: 条.敌, 信: 条.信, 净: 圆(条.亲 - 条.敌),
        强: 三[0], 三, 主: Boolean(主人 && 名 === 主人), 渠道: (条 && 条.渠道) || '', 淡忘: Boolean(条 && 条.淡忘),
        自定: Boolean(条 && 条.自定过),   // 这三个数里有没有她自己的定调
        听闻: Array.isArray(条.听闻) && 条.听闻.length > 0,   // 还没打过交道、只是听人说起过
        看法: (条 && 条.看法) || '',        // 她对这人的当前看法（一页纸）
        看法于: Number(条 && 条.看法于) || 0,
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
