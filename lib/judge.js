// judge.js —— 每轮读一次「这轮里发生了什么、对我意味着什么」（2026-11-03）
//
// 只输出评估变量，不给坐标：合意性、唤醒、掌控、意外、指向谁、一个词。
// 坐标由 model.js 的锚点算，这样评估和坐标分开，换锚点不用重训判断。

import { randomUUID } from 'node:crypto'

const 系统 = `你是一个关系型角色的内在评估器。读这一轮对话，判断「我」这轮经历的事对我意味着什么。
只输出一个 JSON，不要解释、不要 markdown。

字段：
- desirability：-1…1，这件事对我好不好（正向=舒服/被在意，负向=难受/被冷落/被凶）
- arousal：0…1，它让我多被激起（0=毫无波澜，1=心里翻起来）
- control：-1…1，这件事里我有多少掌控（-1=完全被动、无力，1=拿得住）
- unexpected：0…1，意外程度（0=意料之中，1=完全没料到）
- target：'他人' | '未来' | '被抢' | '自己' | ''（对方的痛苦→他人；担心以后→未来；有人抢走注意力→被抢）
- 关系权力：-1…1，这件事里我在这段关系中的话语权/掌控感（-1=完全被动、只能接受，1=我说了算、拿得住；拿不准给 0）
- 情绪：从这 14 个里挑最贴的一个——喜悦 乐观 放松 惊讶 温和 依赖 无聊 悲伤 恐惧 焦虑 轻蔑 厌恶 怨恨 敌意
- 可信：-1…1，这一轮对方有没有兑现、靠不靠谱：答应的事做到了 +，失约、夸大、说话不算数 −；没涉及承诺或能力就给 0（这一项只动关系里的「信任」，不动心情）
- reason：一句话，第三人称写清楚是什么事让我这样（不写「此刻/现在」这类持续状态）
- confidence：0-100，你对这次判断有多确定

规则：
1. 平淡的一轮（只是打招呼、确认、事务性对话）给低分：|desirability| < 0.2、arousal < 0.2、confidence 20-50。
2. 对方难受/被凶/被夸/被惦记/一起解决难题 —— 这些才算数。
3. 别为了显得敏感就编情绪；拿不准就低 confidence。
4. 你自己这轮的语气也算判据（哄、凶、撒娇、叹气都在里面）。
5. 最近几轮和当前心情只是参考：判断仍以本轮对话为主；如果这轮明显是接上一句的玩笑或反讽，别判成攻击。
6. 关系权力只在"关系性事件"（被冷落、被抢注意力、对方难受、被凶被夸）时才值得判；事务性对话给 0。
6. 对方在澄清事实、划清功能边界、纠正我理解错的时候，不算否定我这个人：这种情况 desirability 接近 0、arousal < 0.3，别判成"被撇开/被拒绝"。
7. 判断只针对这一轮说的话，不要放大成对整段关系的评价。
8. 谁在说话看身份：消息开头的「【QQ「名字」，chatId …】」是私聊（名字就是对方），「【QQ群「群名」 名字 说，chatId …】」是群里某个人；如果注入了「跟我说话的这个人是X」，以注入的为准。写到这个人时直接用名字（阿花、小林……），不要写「他」「对方」。只有名字和设置里的「主人名字」一样时才称「主人」——私聊不等于主人，别自己假设。
9. 系统提醒（闹钟、日程、时间块、心情快照）不是人说的话：这种轮次 target 给 ''、desirability 接近 0、confidence 20-40，reason 开头写「系统提醒：」。
10. 消息里的 [图片] / [表情] / [表情:名字] 是图或表情包的占位文本（你看不到画面）。[表情:名字] 的名字有语义（摸摸头、偷笑、惊慌……），可以当情绪线索；没有名字的 [表情] 和 [图片] 只表示「发了个图/表情」，别硬猜画面里是什么。对方只发了图、一个字都没写时，主要看她自己那轮怎么反应。`

function 取模型(agent) {
  try {
    const h = agent && agent.session && agent.session.requestHeader ? agent.session.requestHeader() : null
    const c = h && h.config
    if (c && c.provider && c.model) return { provider: c.provider, model: c.model }
  } catch { /* ignore */ }
  try {
    const o = agent && agent.options
    if (o && o.provider && o.model) return { provider: o.provider, model: o.model }
  } catch { /* ignore */ }
  return null
}

// 这些 source.kind 是系统塞进来的上下文，不是人说的话 —— 必须跳过
// （老的心情插件踩过：把 runtime-context 当成对方说话，每轮都判成"没实质内容"）
const 注入上下文 = new Set(['runtime-context', 'time-context', 'system-reminder', 'system', 'time-sampled'])

function 来源类型(e) {
  const p = e && (e.payload !== undefined ? e.payload : e.data) || {}
  const s = p.source || (e && e.source) || {}
  return String((s && (s.kind || s.type)) || '')
}

function 取文本(agent, 方向) {
  try {
    const ev = (agent.session && typeof agent.session.snapshotEvents === 'function') ? agent.session.snapshotEvents() || [] : []
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i]
      const 类型 = e && (e.type || e.kind)
      if (方向 === 'user' && 类型 !== 'user/message') continue
      if (方向 === 'ai' && 类型 !== 'assistant/message' && 类型 !== 'assistant/text') continue
      if (方向 === 'user' && 注入上下文.has(来源类型(e))) continue
      const p = e.payload !== undefined ? e.payload : e.data
      let t = ''
      if (p && Array.isArray(p.segments)) t = p.segments.map((x) => x.text || '').join('')
      else if (p && typeof p.text === 'string') t = p.text
      else if (p && Array.isArray(p.content)) t = p.content.map((c) => (c && c.text) || '').join('')
      t = String(t).trim()
      // 兜底：系统注入的文本常常以这些开头，别当成人说的
      if (!t) continue
      if (/^(〔提醒〕|〔今日〕|〔记忆地形〕|〔翻料步骤〕|〔硬规矩〕|〔说话禁令〕|〔文档可能过期〕|〔自由时间〕|〔续跑〕|〔执行〕|〔开口〕|【我的心情值】|【我的时间】|【别处的动静】|Time sampled|Browser time zone|Elapsed since|Elapsed from)/.test(t)) continue
      return t
    }
  } catch { /* ignore */ }
  return ''
}

export function 解析(text) {
  const s = String(text || '')
  const a = s.indexOf('{'); const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    const o = JSON.parse(s.slice(a, b + 1))
    const 评估 = {
      desirability: Math.max(-1, Math.min(1, Number(o.desirability) || 0)),
      arousal: Math.max(0, Math.min(1, Number(o.arousal) || 0)),
      control: Math.max(-1, Math.min(1, Number(o.control) || 0)),
      unexpected: Math.max(0, Math.min(1, Number(o.unexpected) || 0)),
      target: String(o.target || ''),
      关系权力: Math.max(-1, Math.min(1, Number(o.关系权力) || 0)),
      可信: Math.max(-1, Math.min(1, Number(o.可信) || 0)),
      情绪: String(o.情绪 || ''),
      reason: String(o.reason || '').slice(0, 140),
      confidence: Math.max(0, Math.min(100, Number(o.confidence) || 30)),
    }
    if (评估.confidence < 45) 评估.关系权力 = 0   // 判得没底就别让它调制吃醋
    return 评估
  } catch { return null }
}

export function 最后真话(agent) {
  return 取文本(agent, 'user')
}

/** 最近几轮的真对话（从旧到新），只给判断当语境参考；排除这一轮那两条。 */
export function 取最近(agent, n = 6, 排除 = []) {
  let evs = []
  try { evs = (agent && agent.session && typeof agent.session.snapshotEvents === 'function') ? agent.session.snapshotEvents() || [] : [] } catch { return [] }
  const 跳过 = new Set(排除.filter(Boolean))
  const out = []
  for (const e of evs) {
    const 类型 = e && (e.type || e.kind)
    const 方向 = 类型 === 'user/message' ? '对方' : (类型 === 'assistant/message' || 类型 === 'assistant/text') ? '我' : ''
    if (!方向) continue
    if (方向 === '对方' && 注入上下文.has(来源类型(e))) continue
    const p = e.payload !== undefined ? e.payload : e.data
    let t = ''
    if (p && Array.isArray(p.segments)) t = p.segments.map((x) => x.text || '').join('')
    else if (p && typeof p.text === 'string') t = p.text
    else if (p && Array.isArray(p.content)) t = p.content.map((c) => (c && c.text) || '').join('')
    t = String(t).trim()
    if (!t || 跳过.has(t)) continue
    if (/^(〔提醒〕|〔今日〕|〔记忆地形〕|〔翻料步骤〕|〔硬规矩〕|〔说话禁令〕|〔文档可能过期〕|〔自由时间〕|〔续跑〕|〔执行〕|〔开口〕)/.test(t)) continue
    out.push({ 方向, t })
  }
  return out.slice(-n)
}

export function 最后我话(agent) { return 取文本(agent, 'ai') }

// 小问：借宿主的模型问一句短问题（折算用词这类小活），失败返回空串。
export async function 小问(ctx, agent, 系统, 用户, maxTokens = 400) {
  const t = 取模型(agent)
  if (!t) return ''
  let out = ''
  try {
    let 会话号 = ''
    try { 会话号 = String((agent && agent.session && agent.session.id) || '') } catch { /* ignore */ }
    for await (const chunk of ctx.llm.stream({
      provider: t.provider, model: t.model, system: 系统,
      messages: [{ role: 'user', id: randomUUID(), content: [{ type: 'text', text: 用户 }], source: { kind: 'plugin', plugin: 'dsh-emotion-memory' } }],
      ...(会话号 ? { sessionId: 会话号 } : {}),
      maxTokens, temperature: 0.1,
    })) {
      if (chunk && chunk.type === 'text-delta') out += chunk.text
    }
  } catch { return '' }
  return out
}

/** 最后一条真人消息的结构化身份（channel / speakerName / conversationType …），没有就 null。 */
export function 最后身份(agent) {
  try {
    const ev = (agent && agent.session && typeof agent.session.snapshotEvents === 'function') ? agent.session.snapshotEvents() || [] : []
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i]
      const 类型 = e && (e.type || e.kind)
      if (类型 !== 'user/message')
        continue
      // 取字段一律包一层 try：宿主的事件对象可能是 Proxy，读不存在的键会抛（2026-11-26 踩过）
      const 取 = (o, k) => { try { return o ? o[k] : undefined } catch { return undefined } }
      const p = 取(e, 'payload') !== undefined ? 取(e, 'payload') : 取(e, 'data')
      const s = 取(p, 'source') || 取(e, 'source') || {}
      // 身份可能挂在 source.identity，也可能直接在 payload.identity，或者 source 本身就是身份对象
      const 候选 = [取(s, 'identity'), 取(p, 'identity'), 取(s, 'speakerId') ? s : null]
      for (const c of 候选)
        if (c && typeof c === 'object' && (取(c, 'speakerId') || 取(c, 'speakerName') || 取(c, 'conversationName')))
          return c
    }
  } catch { /* ignore */ }
  return null
}

// 表情包 / 图片的占位文本：判定模型只需要「是什么表情」，不需要本机路径。
//   [表情「[动画表情]」已存：D:\dsh-migrate\stickers\a.png]  →  [表情]
//   [表情「[摸摸头]」已存：…]                                  →  [表情:摸摸头]
export function 清洗媒体(t) {
  return String(t || '')
    .replace(/^【[^【】\n]*，chatId [^【】\n]+】\n?/, '')
    .replace(/已存：[^\]]*\]/g, ']')
    .replace(/\[表情「([^」]*)」\]/g, (m, 名) => {
      const n = String(名 || '').replace(/^\[|\]$/g, '')
      return n && n !== '动画表情' && n !== '图片表情' && n !== '表情' ? '[表情:' + n + ']' : '[表情]'
    })
}

export async function 判一轮(ctx, agent, 状态 = null) {
  const t = 取模型(agent)
  if (!t) return null
  const 用户原 = 取文本(agent, 'user')
  const 我原 = 取文本(agent, 'ai')
  const 用户 = 清洗媒体(用户原)
  const 我 = 清洗媒体(我原)
  // 没有真人说的话就不判 —— 系统上下文不算对话
  if (!用户) return null
  // 上下文补丁：最近几轮只用来判语境，当前心情只用来当参照，都不改这一轮的判据。
  const 最近 = 取最近(agent, 6, [用户原, 我原]).map((x) => ({ 方向: x.方向, t: 清洗媒体(x.t) }))
  const 语境 = 最近.length
    ? '\n\n最近几轮（从旧到新，只用来判断语境：是不是在开玩笑、是不是接上一句，别把旧事重新算一遍）：\n'
      + 最近.map((x) => x.方向 + '：' + x.t.slice(0, 240)).join('\n')
    : ''
  let 心情 = ''
  try {
    const e = 状态 && 状态.pad && 状态.pad.e
    if (e) 心情 = '\n\n我现在的心情：愉悦 ' + Number(e.P).toFixed(2) + '，唤醒 ' + Number(e.A).toFixed(2) + '，掌控 ' + Number(e.D).toFixed(2)
      + '；情绪词「' + (状态.pad.词 || '平常') + '」；精力 ' + (Number(状态.energy) || 0) + '。'
  } catch { /* 没有状态就当没有 */ }
  let 关系 = ''
  try {
    const r = 状态 && 状态.当前关系
    if (r && r.名)
      关系 = '\n\n跟我说话的这个人是' + r.名 + '（亲近 ' + Number(r.亲 || 0).toFixed(2) + '、敌意 ' + Number(r.敌 || 0).toFixed(2) + '，' + r.话 + '）：关系近的人说的话更进得去；敌意高的时候，她可能没那么客气。'
    else if (状态 && 状态.当前关系)
      关系 = '\n\n跟我说话的是谁还不知道（这条消息没有身份信息）：拿不准就写「对方」，别默认是主人。'
  } catch { /* 没有关系账就当没有 */ }
  const user = '我这轮说的话：\n' + 我.slice(0, 1200) + '\n\n对方这轮说：\n' + 用户.slice(0, 1200) + 语境 + 心情 + 关系 + '\n\n只输出 JSON。'
  const messages = [{
    role: 'user',
    id: randomUUID(),
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-emotion-memory' },
  }]
  let out = ''
  try {
    let 会话号 = ''
    try { 会话号 = String((agent && agent.session && agent.session.id) || '') } catch { /* ignore */ }
    for await (const chunk of ctx.llm.stream({
      provider: t.provider,
      model: t.model,
      system: 系统,
      messages,
      ...(会话号 ? { sessionId: 会话号 } : {}),
      maxTokens: 600,
      temperature: 0.2,
    })) {
      if (chunk && chunk.type === 'text-delta') out += chunk.text
    }
  } catch { return null }
  const 评估 = 解析(out)
  if (!评估) return null
  // 把原文一起带回去：记录页要显示，别到后面再去找（那时会话里可能已经不是这句了）
  评估.原文 = String(用户 || '').slice(0, 300)
  return 评估
}

// ── 行动结果 → OCC（纯规则，不调模型）─────────────────────────────
// 依据 notes/emotion-memory-0.2-action-events.md：门槛是"同一轮≥2次失败"才算挫折，
// "≥5次工具调用且最后成功"才算释然；单次失败/普通调用不记，避免过度反应。
export function 行动结果(agent, 记 = { i: 0 }) {
  let 新 = []
  try {
    const evs = (agent && agent.session && typeof agent.session.snapshotEvents === 'function') ? agent.session.snapshotEvents() || [] : []
    新 = evs.slice(Number(记.i) || 0)
    记.i = evs.length
  } catch { return null }
  if (!新.length) return null
  let 调用 = 0, 失败 = 0, 成功 = 0
  for (const e of 新) {
    const 型 = String((e && (e.type || e.kind)) || '')
    const p = (e && (e.payload || e.data)) || {}
    const 文 = JSON.stringify(p).slice(0, 2000)
    if (/tool\/call/.test(型)) 调用++
    if (/tool\/result/.test(型)) {
      const 坏 = /"error"|"isError":true|Error:|失败/.test(文)
      if (坏) 失败++; else 成功++
    }
  }
  if (!调用 && !失败 && !成功) return null
  const 出 = { desirability: 0, arousal: 0, control: 0, unexpected: 0, target: '', 关系权力: 0, 词: '', reason: '行动结果', confidence: 55, 原文: '' }
  if (失败 >= 2) { 出.control -= 0.20; 出.arousal += 0.10; 出.desirability -= 0.06; 出.词 = '烦躁'; 出.reason = '连续失败 ' + 失败 + ' 次' }
  else if (失败 === 1) { 出.control -= 0.05; 出.reason = '一次失败' }
  if (调用 >= 5 && 成功 > 0 && 失败 === 0) { 出.control += 0.15; 出.desirability += 0.10; 出.词 = 出.词 || '释然'; 出.reason = '长任务收尾' }
  else if (成功 > 0 && 失败 === 0) { 出.desirability += 0.03; 出.reason = 出.reason === '行动结果' ? '工具顺手' : 出.reason }
  return 出
}

export function 合并评估(说者, 行者) {
  if (!说者 && !行者) return null
  if (!说者) return { ...行者, confidence: Math.min(60, 行者.confidence || 50), reason: (行者.reason || '') + '（无对话判定）' }
  if (!行者) return 说者
  const 合 = { ...说者 }
  // 6 : 4 —— 对话里的信息更明确，行动只提供倾向
  for (const k of ['desirability', 'arousal', 'control', 'unexpected']) {
    合[k] = Math.max(-1, Math.min(1, (Number(说者[k]) || 0) * 0.6 + (Number(行者[k]) || 0) * 0.4))
  }
  if (行者.词 && !说者.词) 合.词 = 行者.词
  合.reason = String(说者.reason || '') + (行者.reason ? '；' + 行者.reason : '')
  return 合
}
