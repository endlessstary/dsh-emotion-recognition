// 联想.js —— 顺着已经想起的事往下摸一跳（2026-11-26，借鉴 noema 的实体图多跳）
//
// 两条路，各管各的：
//   ① **词桥**（主路）：这轮已经召回的 1~2 条记忆里，那些「少见的词」牵出另一件相关的事。
//      附带一个「反差」加成（2026-11-26 晚）：开心的时候，**同一件事**里「当时的难」会一起冒上来
//      （「做到了，才想起当时有多难」）。依据：redemption 叙事（McAdams 等 2001：坏→好的故事序列）、
//      relief 需要负向前件（Sweeny & Vohs 2012）、FAB 褪色效应（Walker 等 2003：负性情绪褪得快，
//      留下的多是内容不是疼）。同题由词桥本身保证 —— 不同题的负面记忆只是随机翻出一件倒霉事。
//      判「那件事难」优先看情感指纹；但实测指纹全是正的（198 条 0 条负），所以另加一条文字线索兜底。
//   ② **情绪桥**（补路，2026-11-26 加；当晚扩展成分流）：词联不到，但心境上头时补 1 条。
//      · **同号**：难过/开心时想起同号的浓记忆（Bower 1981 心境一致；负面记忆的侵入性真实存在，
//        所以只补 1 条）
//      · **修复**（难过时）：想起「那时候的暖」—— 怀旧常由负状态触发（Wildschut、Sedikides 等 2006），
//        甜里带苦，功能是恢复归属感（poignancy：Ersner-Hershfield 等 2008）。越想越酸也可能，那是真的。
//        不要求同题（怀旧本来就不挑题），偏「旧、有分量」的记忆给一点加分。
//
// 打分：词桥 = 共享稀词权重和 ÷ 10（一个稀桥 ≈ 0.5）；情绪桥 = 0.3 + 情感指纹显著度（+ 分流的小加成）。
// 每条都带 `桥`（词）和 `桥文`（给人看的话，会进注入）。
import { 切词 } from './memory.js'

/** 词桥：光靠「稀词」牵线，不看情绪。 */
function 算词桥(条目, 种子, 参 = {}) {
  const 上限 = Number.isFinite(Number(参.上限)) ? Math.max(1, Number(参.上限)) : 2
  const 门槛 = Number.isFinite(Number(参.门槛)) ? Number(参.门槛) : 0.3
  const 排除 = new Set(参.排除 || [])
  const 库 = 条目.length
  if (!库 || !种子.length) return []

  const 词们 = 条目.map((m) => 切词(m.text || ''))
  const df = new Map()
  for (const s of 词们) for (const w of s) df.set(w, (df.get(w) || 0) + 1)
  // 只有「稀词」能当桥：满库都有的词（大肥、调侃、意味…）牵不出有用的联想
  const 稀 = Number.isFinite(Number(参.稀)) ? Number(参.稀) : 5
  const 太常见 = (w) => (df.get(w) || 0) > 稀

  const 种子词 = new Map()
  const 桥文 = new Map()   // 桥词 → 它在种子记忆里的原句片段（二元组常是半个词，显示碎片很蠢）
  for (const m of 种子) {
    const 原 = String(m.text || '')
    for (const w of 切词(原)) {
      if (太常见(w)) continue
      种子词.set(w, Math.log(1 + 库 / Math.max(1, df.get(w) || 1)))
      if (!桥文.has(w)) {
        const i = 原.indexOf(w)
        if (i >= 0) 桥文.set(w, 原.slice(Math.max(0, i - 5), Math.min(原.length, i + w.length + 5)))
      }
    }
  }
  if (!种子词.size) return []

  const 出 = []
  条目.forEach((m, i) => {
    const id = m.id || String(m.text || '').slice(0, 20)
    if (排除.has(id)) return
    let 分 = 0
    let 桥 = ''
    let 桥重 = 0
    for (const w of 词们[i]) {
      const wgt = 种子词.get(w)
      if (!wgt) continue
      分 += wgt
      if (wgt > 桥重) { 桥重 = wgt; 桥 = w }
    }
    if (!分) return
    // 绝对权重和 ÷ 10：一个稀桥（df≈1 时权重约 5）≈ 0.5 分，两个 ≈ 1.0
    let 归一 = Math.min(1, 分 / 10)
    if (归一 < 门槛) return
    // 反差（2026-11-26 晚）：开心的时候，**同一件事**里「当时的难」会一起冒上来
    // （redemption 叙事 / relief 需要负向前件 / FAB 让疼褪掉只剩内容）。
    // 同题这件事词桥本来就保证了；这里只让它往前提一点，并说清为什么是这条。
    // ⚠ 记忆的情感指纹是「记这件事时的心境」，实测 198 条里一条负的都没有（都是 0.015~0.896），
    //   所以光看指纹这条桥几乎不会触发 —— 再加一条文字线索当兜底。
    let 类型 = '词'
    let 文 = '顺着「' + (桥文.get(桥) || 桥) + '」想起来的'
    if (参.反差桥 !== false && Number(参.P) > 0.15) {
      const aP = m.affect ? Number(m.affect.P) || 0 : 0
      const 显 = m.affect ? Math.max(Math.abs(aP), Math.abs(Number(m.affect.A) || 0)) : 0
      const 指纹够难 = aP < -0.15 && 显 >= 0.3
      const 文字够难 = /难|崩|哭|害怕|焦虑|失败|熬|累|糟|痛|委屈|孤单|后悔|生气|吵架|骂/.test(String(m.text || ''))
      if (指纹够难 || 文字够难) {
        归一 = Math.min(1, 归一 + 0.1)
        类型 = '反差'
        文 = '做到了，倒想起当时有多难'
      }
    }
    出.push({ 条: m, text: String(m.text || ''), 分: Math.round(归一 * 100) / 100, 桥, 桥文: 文, 类型 })
  })
  return 出.sort((a, b) => b.分 - a.分).slice(0, 上限)
}

/** 情绪桥：按此刻心境分流 —— 同号（心境一致）、修复（难过时想起暖的，可以不同题）。 */
function 算情绪桥(条目, 种子 = [], 参 = {}) {
  if (参.情绪桥 === false) return []
  const P = Number(参.P)
  if (!Number.isFinite(P) || Math.abs(P) <= 0.15) return []
  const 门槛显 = Number.isFinite(Number(参.显著)) ? Number(参.显著) : 0.35
  const 修复开 = 参.修复桥 !== false && P < -0.15
  const 已 = new Set(参.排除 || [])
  let 最佳 = null
  for (const m of 条目) {
    const id = m.id || String(m.text || '').slice(0, 20)
    if (已.has(id)) continue
    const a = m.affect
    if (!a) continue
    const aP = Number(a.P) || 0
    const 显 = Math.max(Math.abs(aP), Math.abs(Number(a.A) || 0))
    let 类型 = ''
    let 桥文 = ''
    if (aP !== 0 && Math.sign(aP) === Math.sign(P)) {
      // 同号：原样，阈值不放宽
      if (显 < 门槛显) continue
      类型 = '同号'
      桥文 = P < 0 ? '你此刻也难受' : '你此刻也开心'
    } else if (修复开 && aP > 0.15) {
      // 修复：难受时想起那时候的暖 —— 不要求同题（怀旧本来就不挑题），偏旧、偏重要的加分
      if (显 < 门槛显 - 0.05) continue
      类型 = '修复'
      桥文 = '难受的时候，想起了那时候的暖'
    } else continue
    let 分 = Math.min(1, 0.3 + 显)
    if (类型 === '修复') {
      const t = Date.parse(String(m.at ?? m.createdAt ?? ''))
      const 龄天 = Number.isFinite(t) ? (Date.now() - t) / 86400000 : 0
      if (龄天 > 30) 分 = Math.min(1, 分 + 0.05)
      if (Number(m.importance) >= 0.5) 分 = Math.min(1, 分 + 0.03)
    }
    if (!最佳 || 分 > 最佳.分) {
      最佳 = { 条: m, text: String(m.text || ''), 分: Math.round(分 * 100) / 100, 桥: 类型 === '同号' ? '心境' : 类型, 桥文, 类型: '情绪' }
    }
  }
  return 最佳 ? [最佳] : []
}

/**
 * 联想：词桥 + 情绪桥（同号 / 反差 / 修复）。
 * @param {Array} 条目 全部记忆
 * @param {Array} 种子 这一轮已经召回的 1~2 条
 * @param {{上限?: number, 门槛?: number, 排除?: string[], 稀?: number, P?: number, 情绪桥?: boolean,
 *          显著?: number, 反差桥?: boolean, 修复桥?: boolean, 话?: string}} 参
 */
export function 联想(条目 = [], 种子 = [], 参 = {}) {
  if (!Array.isArray(条目) || !条目.length) return []
  const 词桥 = 算词桥(条目, 种子 || [], 参)
  const 已鉴 = new Set([...(参.排除 || []), ...词桥.map((x) => x.条.id || String(x.text || '').slice(0, 20))])
  const 情绪桥 = 算情绪桥(条目, 种子 || [], { ...参, 排除: [...已鉴] })
  return [...词桥, ...情绪桥]
}
