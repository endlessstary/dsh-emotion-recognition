// 情绪记忆 设置页 —— 情绪记忆模型 0.1
// 三个页签：心情（含记录）/ 记忆 / 设置（会话绑定 + 导出导入 + 心情设置 + 记忆设置）
// 顶部统一一个「看哪份」：默认看第一个活跃会话，可以下拉切换查看。
window.__ModuleLoader__.load({
  id: 'dsh-emotion-recognition',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const API = '/dsh-emotion-memory'

    const CSS = `
[data-em-wrap]{display:flex;flex-direction:column;gap:4px;font-size:13px;}
[data-em-topbar]{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;}
[data-em-tabs]{display:flex;gap:6px;}
[data-em-tab]{padding:5px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.25);background:transparent;cursor:pointer;font-size:12px;color:inherit;}
[data-em-tab][data-on]{background:rgba(90,140,255,.15);border-color:rgba(90,140,255,.5);}
[data-em-seg]{display:flex;width:100%;border:1px solid rgba(127,127,127,.25);border-radius:8px;overflow:hidden;margin-bottom:10px;}
[data-em-seg] > button{flex:1;padding:8px 12px;border:0;background:transparent;cursor:pointer;font-size:12px;color:inherit;}
[data-em-seg] > button + button{border-left:1px solid rgba(127,127,127,.25);}
[data-em-seg] > button[data-on]{background:rgba(90,140,255,.15);}
[data-em-hero]{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:12px;background:rgba(127,127,127,.08);border:1px solid transparent;}
[data-em-big]{font-size:22px;font-weight:600;}
[data-em-sub]{font-size:12px;opacity:.72;line-height:1.7;}
[data-em-sec]{display:flex;flex-direction:column;gap:8px;margin-top:20px;}
[data-em-h]{font-size:13px;font-weight:600;opacity:.85;}
[data-em-h2]{font-size:12px;font-weight:600;opacity:.7;margin-top:12px;}
[data-em-note]{font-size:12px;opacity:.7;line-height:1.7;}
[data-em-row]{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;padding:4px 0;}
[data-em-card]{display:flex;flex-direction:column;gap:5px;padding:10px 12px;border-radius:10px;background:rgba(127,127,127,.06);margin-bottom:8px;}
[data-em-sess]{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:10px;border:1px solid rgba(127,127,127,.22);margin-bottom:7px;cursor:pointer;}
[data-em-sess][data-on]{border-color:rgba(90,140,255,.55);background:rgba(90,140,255,.10);}
[data-em-bar]{height:6px;border-radius:3px;background:rgba(127,127,127,.18);overflow:visible;}
[data-em-fill]{height:100%;background:rgba(90,140,255,.72);border-radius:3px;}
/* 到了 80% 以上的情绪条会「呼吸」：光晕缓缓收缩、透明度起伏，颜色也跟着微微明暗 */
[data-em-fill][data-lit]{animation:em-breathe 3.6s ease-in-out infinite;}
@keyframes em-breathe{
  0%,100%{opacity:1;filter:brightness(var(--b0,1)) saturate(.95);box-shadow:0 0 7px var(--g1,transparent),0 0 16px var(--g2,transparent);}
  50%{opacity:.9;filter:brightness(var(--b1,1.1)) saturate(1.05);box-shadow:0 0 3px var(--g1,transparent),0 0 8px var(--g2,transparent);}
}
@media (prefers-reduced-motion: reduce){[data-em-fill][data-lit]{animation:none;}}
/* 关系三条轴：各自的"水色"，沿着条子慢慢流（2026-11-26） */
[data-em-fill][data-axis]{background-size:200% 100%;background-position:0% 50%;animation:em-flow 7s linear infinite;}
/* 亲近：0~70% 用「樱云粉 → 云水青 → 浅蓝 → 薄暮蓝」，71~100% 用「暖曦 → 橘粉 → 藕粉 → 雾蓝 → 碧霄」；
   两档上面都飘一层白云（跟着水一起流）。 */
[data-em-fill][data-axis="亲"]{
  background-image:linear-gradient(90deg,#EEB6C6 0%,#F2C6D3 14%,#9FDCE1 42%,#B6D4EE 70%,#B6BEE6 100%);
  /* 颜色层也跟着慢慢流：图比条子宽一倍，来回缓慢平移（反向交替，不会跳帧） */
  background-size:200% 100%;background-repeat:no-repeat;background-position:100% 50%;
  animation:em-drift 22s ease-in-out infinite alternate;position:relative;}
[data-em-fill][data-axis="亲"][data-hot]{
  background-image:linear-gradient(90deg,#F4BC8C 0%,#F7BE79 13%,#FBA187 26%,#FAA9B8 38%,#F9B3CD 50%,#E1DEEE 60%,#CFE3F6 72%,#A6D2EE 85%,#A6D2EE 100%);}
@keyframes em-drift{from{background-position:100% 50%;}to{background-position:0% 50%;}}
[data-em-wisp]{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit;
  background-image:
    radial-gradient(36px 130% at 30px 60%, rgba(255,255,255,.60) 0%, rgba(255,255,255,0) 70%),
    radial-gradient(26px 110% at 120px 40%, rgba(255,255,255,.50) 0%, rgba(255,255,255,0) 72%),
    radial-gradient(44px 150% at 210px 65%, rgba(255,255,255,.44) 0%, rgba(255,255,255,0) 70%);
  background-size:260px 100%,260px 100%,260px 100%;background-repeat:repeat-x;
  animation:em-wisp 11s linear infinite;}
/* 水流方向：（从左往右）白云从 -260px 走回 0，敌/信 的渐变从 200% 走回 0 */
@keyframes em-wisp{from{background-position:-260px 0,-260px 0,-260px 0;}to{background-position:0 0,0 0,0 0;}}
/* 敌视：把轴平均分成六格，左浅右深（岁岁给的六色），格与格之间留一点过渡；
   它没有「水流」——用暗色内影 + 极慢的内部涌动做「粘稠」感。 */
[data-em-fill][data-axis="敌"]{
  background-image:linear-gradient(90deg,
    #B21F29 0%,#B21F29 13.2%,
    #930510 20.2%,#930510 29.8%,
    #72090F 36.8%,#72090F 46.5%,
    #53080E 53.5%,#53080E 63.2%,
    #3D0B0D 70.2%,#3D0B0D 79.8%,
    #020101 86.8%,#020101 100%);
  background-size:calc(10000% / var(--w, 100)) 100%;background-repeat:no-repeat;background-position:0 0;animation:none;position:relative;
  /* 下垂感：上缘薄高光、下缘更重更宽的暗影，再加一点底部的投影 */
  border-radius:5px 5px 7px 7px;
  box-shadow:inset 0 1px 1px rgba(255,255,255,.20), inset 0 -3px 5px rgba(0,0,0,.46), 0 2px 3px rgba(0,0,0,.10);}
/* 内部涌动：只做很轻的明暗起伏（以前那层把左边压暗了，浅色区现在不加暗层） */
[data-em-goo]{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:.9;
  background-image:
    linear-gradient(90deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 28%, rgba(0,0,0,.08) 62%, rgba(0,0,0,.16) 100%),
    radial-gradient(42% 160% at 30% 50%, rgba(255,255,255,.12) 0%, rgba(255,255,255,0) 70%);
  background-size:100% 100%,180% 100%;background-repeat:no-repeat,repeat-x;
  animation:em-goo 48s ease-in-out infinite alternate;}
@keyframes em-goo{from{background-position:0 0,0 0;}to{background-position:0 0,-150px 0;}}
/* 信任：0~100% 全用浅金系五格，左浅右深、格间过渡（不再贴图片纹理） */
[data-em-fill][data-axis="信"]{
  background-image:linear-gradient(90deg,
    #F7E7C6 0%,#F7E7C6 17%,
    #F3D9A4 23%,#F3D9A4 37%,
    #EBCB86 43%,#EBCB86 57%,
    #E5B967 63%,#E5B967 77%,
    #D9A84A 83%,#D9A84A 100%);
  background-size:calc(10000% / var(--w, 100)) 100%;background-repeat:no-repeat;background-position:0 0;animation:none;position:relative;}
@keyframes em-flow{0%{background-position:200% 50%;}100%{background-position:0% 50%;}}
/* 信任轴的「流动」：一道柔和的金光从左往右扫过（不动色带，所以格子位置不会乱） */
[data-em-sheen]{position:absolute;inset:0;border-radius:inherit;pointer-events:none;mix-blend-mode:screen;
  background-image:linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,252,236,.55) 45%, rgba(255,255,255,0) 62%);
  background-size:200px 100%;background-repeat:no-repeat;
  animation:em-sheen 6.5s linear infinite;}
@keyframes em-sheen{from{background-position:-220px 0;}to{background-position:calc(100% + 220px) 0;}}
@media (prefers-reduced-motion: reduce){[data-em-fill][data-axis]{animation:none;}[data-em-wisp]{animation:none;}}
[data-em-bar="rel"]{height:10px;border-radius:5px;margin-bottom:0;overflow:visible;}
[data-em-meta]{font-size:11px;display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;}
[data-em-meta]>span{opacity:.6;}
/* 名字外面那个直边小方框：**整块底色**按「是哪条轴在给名字上色」来填（亲灰 / 信近黑 / 敌米白），
   里面的名字仍是那条轴的渐变字；字在框里居中。 */
[data-em-meta]>[data-name-box]{opacity:1;display:inline-flex;align-items:center;justify-content:center;
  padding:9px 9px;line-height:1;border:1px solid transparent;border-radius:8px;}
[data-name-box="亲"]{background-color:#26231E;animation:em-edge-cool 9s ease-in-out infinite alternate;}
[data-name-box="信"]{background-color:#26231E;animation:em-edge-gold 7s ease-in-out infinite alternate;}
[data-name-box="敌"]{background-color:#FFFEF8;}
[data-name-box=""]{background-color:rgba(127,127,127,.18);}
/* 方框的边「呼吸」：亲在青蓝和樱粉之间，信在柔金和浅金之间；敌的边色跟着分数走，不动 */
@keyframes em-edge-cool{from{border-color:#9FDCE1;}to{border-color:#F5C6D6;}}
@keyframes em-edge-gold{from{border-color:#D9A84A;}to{border-color:#F7E7C6;}}
/* 名字跟着最高的那条轴走：亲 / 信 用会流动的渐变字，敌 用解开的几格拼渐变 */
[data-name]{display:inline-block;font-weight:600;background-size:200% 100%;background-position:0% 50%;
  -webkit-background-clip:text;background-clip:text;padding:0;border:0;}
[data-name="亲"]{background-image:linear-gradient(90deg,#EEB6C6,#9FDCE1,#B6BEE6);animation:em-drift 16s ease-in-out infinite alternate;color:transparent;}
[data-name="亲"][data-hot]{background-image:linear-gradient(90deg,#F4BC8C,#FBA187,#F9B3CD,#CFE3F6,#A6D2EE);}
[data-name="信"]{background-image:linear-gradient(90deg,#F7E7C6,#EBCB86,#D9A84A,#F7E7C6);animation:em-drift 14s ease-in-out infinite alternate;color:transparent;}
[data-name="敌"]{background-image:none;}
[data-em-chip]{font-size:11px;padding:1px 7px;border-radius:99px;background:rgba(90,140,255,.14);}
[data-em-input]{padding:6px 9px;border-radius:8px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;font-size:12px;}
[data-em-num]{width:88px;padding:4px 8px;border-radius:7px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;font-size:12px;text-align:right;}
[data-em-btn]{padding:5px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;cursor:pointer;font-size:12px;}
[data-em-quote]{font-size:12px;padding:6px 10px;border-left:2px solid rgba(127,127,127,.3);opacity:.85;}
`

    const 取 = (p) => fetch(API + p).then((r) => r.json())

    function 数字(props) {
      const [v, setV] = React.useState(String(props.值 == null ? '' : props.值))
      React.useEffect(() => { setV(String(props.值 == null ? '' : props.值)) }, [props.值])
      return h('div', {},
        h('label', { 'data-em-row': '', style: { cursor: 'text' } },
          h('span', {}, props.名),
          h('input', {
            'data-em-num': '', type: 'number', step: props.步 || 0.05, value: v,
            onChange: (e) => setV(e.target.value),
            onBlur: () => { const n = Number(v); if (Number.isFinite(n) && n !== Number(props.值)) props.存(props.键, n) },
          })),
        props.说明 ? h('div', { 'data-em-note': '', style: { marginTop: -2, marginBottom: 4 } }, props.说明) : null)
    }

    function 文本(props) {
      const [v, setV] = React.useState(String(props.值 == null ? '' : props.值))
      React.useEffect(() => { setV(String(props.值 == null ? '' : props.值)) }, [props.值])
      return h('div', {},
        h('label', { 'data-em-row': '', style: { cursor: 'text' } },
          h('span', {}, props.名),
          h('input', {
            'data-em-input': '', type: 'text', value: v, placeholder: props.占位 || '',
            onChange: (e) => setV(e.target.value),
            onBlur: () => { if (String(v) !== String(props.值 == null ? '' : props.值)) props.存(props.键, String(v).trim()) },
          })),
        props.说明 ? h('div', { 'data-em-note': '', style: { marginTop: -2, marginBottom: 4 } }, props.说明) : null)
    }

    function 多久前(at) {
      const 分 = Math.max(0, Math.round((Date.now() - Number(at || 0)) / 60000))
      if (!at) return ''
      if (分 < 1) return '刚刚'
      if (分 < 60) return 分 + ' 分钟前'
      const 时 = Math.round(分 / 60)
      if (时 < 24) return 时 + ' 小时前'
      return Math.round(时 / 24) + ' 天前'
    }

    // 关系账：按人记（心情按会话，关系按人，全局存）
    function 关系页(props) {
      const st = props.st || {}
      const 条 = st.关系 || []
      const 百分 = (v) => Math.round(Number(v) * 100)
      // 名字的颜色跟着「最高的那条轴」走：亲/信 用渐变（会流动）；
      // 敌 用「已经解开的那几格」拼成的渐变（52% = 前三格，25% = 前两格）。
      const 敌档 = ['#B21F29', '#930510', '#72090F', '#53080E', '#3D0B0D', '#020101']
      // 信任改用图片里的金液纹路（见 CSS），不再分档配色
      const 敌名 = (v) => {
        const n = Math.min(6, Math.max(1, Math.ceil(v / 100 * 6)))
        if (n === 1) return { 'data-name': '敌', style: { color: 敌档[0], opacity: 1 } }
        const 站 = 敌档.slice(0, n).map((c, i) => c + ' ' + Math.round(i / (n - 1) * 100) + '%').join(',')
        return { 'data-name': '敌', style: { backgroundImage: 'linear-gradient(90deg,' + 站 + ')', color: 'transparent', opacity: 1 } }
      }
      const 信名 = () => ({ 'data-name': '信', style: { backgroundImage: 'linear-gradient(90deg,#F7E7C6,#EBCB86,#D9A84A)', color: 'transparent', opacity: 1 } })
      const 最高轴 = (r) => {
        const 组 = [['亲', 百分(r.亲)], ['敌', 百分(r.敌)], ['信', 百分(r.信)]]
        组.sort((a, b) => b[1] - a[1])
        return 组[0][1] > 0 ? 组[0] : ['', 0]
      }
      const 名字样式 = (r) => {
        const [轴, 值] = 最高轴(r)
        if (轴 === '敌') return 敌名(值)
        if (轴 === '信') return 信名(值)
        if (!轴) return {}
        return { 'data-name': 轴, 'data-hot': 轴 === '亲' && 值 >= 71 ? '' : undefined }
      }
      // 方框：底色按轴（钛金灰 / 近黑 / 米白），四条边用名字那条轴的主色，四角圆、四边留白一样
      const 框色 = { 亲: '#26231E', 信: '#26231E', 敌: '#FFFEF8' }
      const 边色 = (轴, 值) => {
        if (轴 === '信') return '#D9A84A'
        if (轴 === '亲') return 值 >= 71 ? '#FBA187' : '#9FDCE1'
        if (轴 === '敌') { const n = Math.min(6, Math.max(1, Math.ceil(值 / 100 * 6))); return 敌档[n - 1] }
        return 'rgba(127,127,127,.5)'
      }
      const 名字盒 = (r) => {
        const [轴, 值] = 最高轴(r)
        return h('span', { 'data-name-box': 轴 || '', style: { backgroundColor: 框色[轴] || 'rgba(127,127,127,.18)', borderColor: 轴 === '敌' ? 边色(轴, 值) : undefined } },
          h('span', 名字样式(r), (r.显示 || r.名) + (r.昵称 ? ' (' + r.名 + ')' : '')))
      }
      // 一条轴 = 名字在左上、分数在右上、条子在下（和「心情」的 14 条一个样子）
      const 轴行 = (key, 名, 值, 条子) => h('div', { key, style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('div', { 'data-em-row': '' }, h('span', {}, 名), h('span', {}, 百分(值) + '%')),
        条子)
      return h('div', { 'data-em-sec': '', style: { marginTop: 0 } },
        h('div', { 'data-em-hero': '' },
          h('div', { 'data-em-big': '' }, '关系列表'),
          h('div', { 'data-em-note': '' }, '「关系」默认为全局模式。'),
          h('div', { 'data-em-note': '' }, '「关系」分为三条轴，亲近、敌视与信任，前两轴之间的关联度可调，信任轴则完全独立。'),
          h('div', { 'data-em-note': '' }, '此为判定分寸之参考，而非令大肥鱼演戏')),
        ...(条.length
          ? 条.map((r) => h('div', { key: r.名, style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 } },
            h('div', { 'data-em-meta': '', style: { marginBottom: 2 } },
              名字盒(r),              r.最近 ? h('span', {}, 多久前(r.最近)) : null),
            轴行('亲', '亲近', r.亲,
              h('div', { 'data-em-bar': 'rel' },
                h('div', { 'data-em-fill': '', 'data-axis': '亲', 'data-hot': 百分(r.亲) >= 71 ? '' : undefined, style: { width: (百分(r.亲) <= 0 ? 0 : Math.max(2, 百分(r.亲))) + '%' } },
                  h('span', { 'data-em-wisp': '' })))),
            轴行('敌', '敌视', r.敌,
              h('div', { 'data-em-bar': 'rel' },
                h('div', { 'data-em-fill': '', 'data-axis': '敌', style: (() => { const v = Math.max(2, 百分(r.敌)); return { width: (百分(r.敌) <= 0 ? 0 : v) + '%', '--w': v } })() },
                  h('span', { 'data-em-goo': '' })))),
            轴行('信', '信任', r.信,
              h('div', { 'data-em-bar': 'rel' },
                h('div', { 'data-em-fill': '', 'data-axis': '信', style: (() => { const v = Math.max(2, 百分(r.信)); return { width: (百分(r.信) <= 0 ? 0 : v) + '%', '--w': v } })() },
                  h('span', { 'data-em-sheen': '' }))))))
          : [h('div', { 'data-em-note': '' }, '还没记下谁 —— 聊几轮就有了')]))
    }

    // 一条候选记忆：默认只显示分数，点「为什么」展开分项（2026-11-26，借鉴 dsh-noema 的 explain）
    function 候选行(props) {
      const c = props.c || {}
      const [开, set开] = React.useState(false)
      const 项 = c.项
      const 是联想 = Boolean(项 && 项.联想)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        h('div', { 'data-em-row': '', style: { gap: 6, alignItems: 'center' } },
          h('span', { 'data-em-chip': '', style: { background: c.命中 ? 'rgba(90,200,140,.22)' : 'rgba(127,127,127,.16)' } }, c.命中 ? '命中' : '未命中'),
          是联想 ? h('span', { 'data-em-chip': '', style: { background: 'rgba(160,120,220,.22)' } }, '联想') : null,
          h('span', {}, c.分 + '：' + c.text),
          项 ? h('button', { 'data-em-tab': '', style: { padding: '0 6px', fontSize: 11 }, onClick: () => set开(!开) }, 开 ? '收起' : '为什么') : null),
        开 && 项 && 项.联想
          ? h('div', { 'data-em-note': '', style: { marginLeft: 12 } },
            '联想：顺着「' + (c.桥文 || c.桥 || '某个词') + '」牵出来的（强度 ' + 项.联想 + '）')
          : 开 && 项
          ? h('div', { 'data-em-note': '', style: { marginLeft: 12 } },
            '新鲜 ' + 项.新鲜 + '×' + 项.权.新鲜 + '　重要 ' + 项.重要 + '×' + 项.权.重要
            + '　相关 ' + 项.相关 + '×' + 项.权.相关 + '　心境 ' + 项.一致 + '×' + 项.权.心境
            + '　→ 合计 ' + 项.合计
            + (c.来源 && c.来源.indexOf('向量') >= 0 ? '（向量也命中了 ' + (c.语义 || 0) + '）' : '（纯字面）')
            + '　门槛 ' + (props.门槛 || 0.45))
          : null)
    }
    function 记录页(props) {
      const [条, set条] = React.useState([])
      const [错, set错] = React.useState('')
      React.useEffect(() => {
        if (!props.会话) return
        取('/timeline?session=' + encodeURIComponent(props.会话))
          .then((j) => set条(j.条 || []))
          .catch((e) => set错((e && e.message) || '读不到'))
      }, [props.会话])
      return h('div', { 'data-em-sec': '' },
        h('div', { 'data-em-h': '' }, '记录'),
        h('div', { 'data-em-note': '' }, '一轮一条：原话、心情怎么变、想起了哪条记忆、判得有多确信。'),
        ...(条.length ? 条.map((t, i) => h('div', { key: i, 'data-em-card': '' },
          h('div', { 'data-em-meta': '' },
            h('span', {}, new Date(t.at).toLocaleString()),
            h('span', { 'data-em-chip': '' }, (t.词 || '—') + (t.前pad && t.pad ? '　P ' + t.前pad.P + '→' + t.pad.P + ' A ' + t.前pad.A + '→' + t.pad.A + ' D ' + t.前pad.D + '→' + t.pad.D : '　P' + t.pad.P + ' A' + t.pad.A + ' D' + t.pad.D)),
            h('span', {}, '精力 ' + t.精力),
            h('span', {}, '可信 ' + t.置信)),
          h('div', { 'data-em-quote': '' }, '原话：' + (t.原文 ? (t.原文.length > 120 ? t.原文.slice(0, 120) + '…' : t.原文) : '（没采到）')),
          h('div', {}, t.理由 || '—'),
          t.想起
            ? h('div', {},
              h('div', { 'data-em-meta': '' }, h('span', {}, t.想起.命中 ? '本轮命中' : '本轮未命中'), h('span', {}, t.想起.原因 || '')),
              (t.想起.候选 || []).length
                ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
                  ...(t.想起.候选 || []).map((c, k) => h(候选行, { key: k, c: c })))
                : h('div', { 'data-em-meta': '' }, '没有候选'))
            : h('div', { 'data-em-meta': '' }, '这轮没有真人发言，未查记忆'),
          h('div', { 'data-em-meta': '' },
            '评估：好 ' + t.评估.愿 + '　激起 ' + t.评估.激 + '　掌控 ' + t.评估.控 + '　意外 ' + t.评估.意外 + (t.评估.指向 ? '　指向 ' + t.评估.指向 : '') + (t.评估.关系权力 ? '　关系权力 ' + t.评估.关系权力 : ''))))
          : [h('div', { 'data-em-note': '', key: 'none' }, 错 ? ('读不到记录：' + 错) : '还没有记录')]))
    }

    // 生理状态词：她打了也不折算成情绪，只在界面上说明「暂不分析」。
    const 生理词 = ['累', '困', '饿', '乏', '倦', '疲惫', '困倦', '没精神', '熬夜', '撑不住', '酸痛', '头疼', '不舒服', '想睡',
      // 2026-11-26 补：犯困这类常见说法直接认成生理，不用等折算模型判一次
      '犯困', '好困', '困死', '睡不醒', '打瞌睡', '犯饿', '没力气', '乏力', '没劲', '头晕', '想躺着', '一动不动']
    // 情绪条的颜色：按 Plutchik 情绪轮的家族配色（joy 黄、anticipation 橙、trust 绿、surprise 青、
    // sadness 蓝、disgust 紫、anger 红；serenity/apprehension 等变体取同族的浅/深色）。
    const 情绪色 = {
        喜悦: '#FFD700', 乐观: '#FF9A3C', 放松: '#F8E7B9', 惊讶: '#4fb3c9',
        温和: '#D3C9BE', 依赖: '#EDB4C4', 无聊: '#9a9a9a', 悲伤: '#5b7fc4',
        恐惧: '#000000', 焦虑: '#FFB11B', 轻蔑: '#9575CD', 厌恶: '#5E4FA2',
        怨恨: '#a33c3c', 敌意: '#951322',
    }
    const 取色 = (词) => 情绪色[词] || 'rgba(90,140,255,.72)'
    // 情绪条的颜色（2026-11-26 晚，岁岁要的）：平时一律淡蓝；到 80% 起显出自己那一族的颜色，
    // 分数越高越亮（80% → 暗一点的本色，100% 及以上 → 最亮 + 原有的呼吸发光）。
    const 条色 = (词, 百分) => {
      const v = Math.max(0, Math.min(140, Number(百分) || 0))
      // 不到 80%：黑色斜杠（垫一层极淡的底，短条也看得见）
      if (v < 80) {
        return {
          backgroundColor: 'rgba(90,100,115,.10)',
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,.78) 0 1.5px, rgba(0,0,0,0) 1.5px 7px)',
        }
      }
      const t = Math.min(1, (v - 80) / 20)   // 80% → 0，100% 及以上 → 1
      const c = 取色(词)
      const 底亮 = 0.80 + t * 0.60
      // 变色之后往外冒一点微光（萤火虫那种）；呼吸时靠这几个变量动，别写死
      return {
        background: c,
        filter: 'brightness(' + 底亮.toFixed(2) + ') saturate(' + (0.90 + t * 0.35).toFixed(2) + ')',
        boxShadow: '0 0 ' + Math.round(4 + t * 4) + 'px ' + 半透明(c, 0.55) + ', 0 0 ' + Math.round(10 + t * 10) + 'px ' + 半透明(c, 0.30),
        '--b0': 底亮.toFixed(2),
        '--b1': (底亮 + 0.12).toFixed(2),
        '--g1': 半透明(c, 0.55),
        '--g2': 半透明(c, 0.30),
      }
    }
    // 卡片跟着变色（2026-11-26 晚，岁岁要的）：有情绪到 80% 时，卡片主体保持白，
    // 右上角透出那一族的颜色、边沿一条细线；多条（最多取 3 条）由浅到深做渐变。
    // 只变色，不发光、不呼吸（呼吸留给情绪条自己）。
    const 半透明 = (色, a) => {
      const s = String(色 || '').trim()
      if (s.charAt(0) === '#') {
        const h = s.slice(1)
        const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
        const r = parseInt(n.slice(0, 2), 16) || 0
        const g = parseInt(n.slice(2, 4), 16) || 0
        const b = parseInt(n.slice(4, 6), 16) || 0
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
      }
      if (/^rgba?\(/.test(s)) return s.replace(/,\s*[\d.]+\)$/, ',' + a + ')')
      return s
    }
    // 卡片右上角那片颜色：三个可调的数在设置页「卡片配色」里
    //   卡面色浓度（0~0.8，默认 0.36）· 卡片椭圆大小（px，默认 300）· 卡片过渡软度（0~1，默认 0.5）
    const 卡面 = (高们, 配 = {}) => {
      const 用 = (高们 || []).slice(0, 3)   // 分数高的在前 = 最贴角落、最浓的那层
      if (!用.length) return null
      const 取数 = (v, 默, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : 默)
      const 浓 = 取数(配.卡面色浓度, 0.36, 0, 0.8)
      const 大小 = 取数(配.卡片椭圆大小, 300, 60, 900)
      const 软 = 取数(配.卡片过渡软度, 0.5, 0, 1)
      const 比1 = 0.8 - 0.6 * 软   // 中间停靠点的不透明度比例：越软，中间越淡
      const 比2 = 0.3 - 0.3 * 软
      // 以右上角为圆心做椭圆：边界是一条向外凸的弧 —— 一眼看不出三角形，过渡也更自然。
      // 分数越低的层，椭圆越大、越淡。
      const 图 = 用.map(([词, v], i) => {
        const t = Math.min(1, (Number(v) - 80) / 20)
        const a = Math.min(浓, 浓 * (0.5 + t * 0.5)) * (1 - i * 0.2)
        const 宽 = Math.round(大小 * (1 + i * 0.5))
        const 高 = Math.round(大小 * 0.55 * (1 + i * 0.58))
        const c = 取色(词)
        return 'radial-gradient(ellipse ' + 宽 + 'px ' + 高 + 'px at 100% 0%, ' +
          半透明(c, a.toFixed(2)) + ' 0%, ' +
          半透明(c, (a * 比1).toFixed(2)) + ' 40%, ' +
          半透明(c, (a * 比2).toFixed(2)) + ' 70%, ' +
          半透明(c, 0) + ' 100%)'
      })
      const 主 = 用[0][0]
      return {
        backgroundColor: '#ffffff',
        backgroundImage: 图.join(', '),
        borderColor: 半透明(取色(主), 0.7),
      }
    }
    // 她自己的词 → 14 个通道（2026-11-25 重写，按文献不再是拍脑袋的系数）。
    //
    // 依据一：Plutchik 情绪轮（1980/2001）的 8 个基本情绪 + 组合规则。
    //   14 通道 ↔ 基本情绪的对应：
    //     喜悦=joy；乐观=anticipation；放松=joy 的低强度(serenity)；惊讶=surprise；
    //     依赖/温和=trust；悲伤=sadness；恐惧=fear；焦虑=fear 的高唤醒(apprehension)；
    //     厌恶=disgust；敌意=anger；轻蔑=disgust+anger；怨恨=anger 的长期化；
    //     无聊=低唤醒（Plutchik 没有对应的基本情绪，只能算「低唤醒」）。
    //   组合规则（直接照 Plutchik）：爱=joy+trust；轻蔑=disgust+anger；失望=sadness+surprise；
    //   敬畏=fear+surprise；悔恨=sadness+disgust。
    //
    // 依据二：大连理工情感词汇本体库的 7 大类 21 小类（乐/好/怒/哀/惧/恶/惊）。
    //   每个词的归类按它来，例如「安心」是「乐」下的小类 PE（安心：踏实、宽心、定心丸），
    //   所以安心 = trust + 低唤醒 joy，落到「放松 + 依赖」。
    //
    // 生理状态（累、困、饿……）不在此表，之后单独列。
    const 近义 = {
      // 乐（PA 快乐）＝ joy
      开心: { 喜悦: 1 }, 高兴: { 喜悦: 1 }, 快乐: { 喜悦: 1 }, 喜悦: { 喜悦: 1 },
      // 乐（PE 安心）＝ trust + serenity
      安心: { 放松: 0.6, 依赖: 0.4 }, 平静: { 放松: 1 }, 松: { 放松: 1 }, 踏实: { 放松: 0.6, 依赖: 0.4 },
      // 好（相信/喜爱/祝愿）＝ trust 系
      相信: { 依赖: 0.7, 温和: 0.3 }, 信任: { 依赖: 1 }, 喜爱: { 喜悦: 0.5, 依赖: 0.5 }, 爱: { 喜悦: 0.5, 依赖: 0.5 },
      感动: { 温和: 0.5, 依赖: 0.3, 喜悦: 0.2 }, 满足: { 乐观: 0.5, 放松: 0.4 },
      // 期待＝anticipation
      期待: { 乐观: 1 }, 盼望: { 乐观: 0.8, 依赖: 0.2 }, 希望: { 乐观: 1 },
      // 惊＝surprise；好奇＝anticipation + surprise
      好奇: { 乐观: 0.5, 惊讶: 0.5 }, 惊奇: { 惊讶: 1 }, 惊讶: { 惊讶: 1 },
      // 哀（悲伤/失望/疚/思）
      难过: { 悲伤: 1 }, 伤心: { 悲伤: 1 }, 悲伤: { 悲伤: 1 }, 哭: { 悲伤: 1 },
      失望: { 悲伤: 0.6, 惊讶: 0.2 }, 委屈: { 悲伤: 0.6, 恐惧: 0.2 },
      孤单: { 悲伤: 0.7, 无聊: 0.2 },
      想念: { 依赖: 0.6, 悲伤: 0.3 }, 思念: { 依赖: 0.6, 悲伤: 0.3 }, 想: { 依赖: 0.6, 悲伤: 0.3 },
      // 惧（恐惧/慌/羞）
      害怕: { 恐惧: 1 }, 恐惧: { 恐惧: 1 }, 紧张: { 焦虑: 1 }, 焦虑: { 焦虑: 1 },
      担心: { 焦虑: 0.8, 恐惧: 0.2 }, 慌: { 焦虑: 0.8, 恐惧: 0.2 },
      害羞: { 依赖: 0.4, 温和: 0.3, 焦虑: 0.2 },
      // 怒（angry）：Plutchik 的强度分级里 annoyance（烦）是 anger 的低强度（annoyance→anger→rage）；
      // 大连理工词库把「烦闷」归在「恶」类（NE）；中文的「烦」常夹一点焦躁，所以
      // 烦 = 敌意(anger) 0.5 + 厌恶(disgust/恶) 0.25 + 焦虑 0.25。
      生气: { 敌意: 1 }, 愤怒: { 敌意: 1 },
      烦: { 敌意: 0.5, 厌恶: 0.25, 焦虑: 0.25 }, 烦躁: { 敌意: 0.5, 厌恶: 0.25, 焦虑: 0.25 },
      心烦: { 敌意: 0.5, 厌恶: 0.25, 焦虑: 0.25 }, 烦闷: { 敌意: 0.4, 厌恶: 0.4, 焦虑: 0.2 },
      // 恶（厌恶/轻蔑/怨恨/嫉妒）
      讨厌: { 厌恶: 1 }, 厌恶: { 厌恶: 1 },
      看不起: { 轻蔑: 0.7, 厌恶: 0.3 }, 轻蔑: { 轻蔑: 1 },
      恨: { 怨恨: 0.5, 敌意: 0.5 }, 怨恨: { 怨恨: 1 },
      嫉妒: { 怨恨: 0.4, 悲伤: 0.3, 敌意: 0.2 },
      // 没有 Plutchik 基本情绪对应的低唤醒
      无聊: { 无聊: 1 },
      // 其他
      得意: { 乐观: 0.5, 喜悦: 0.3 },
    }
    // 把她的词按表拆到 14 个通道；表里没有的词，若本身就是通道名就直接算。
    // 一个词怎么折算：全局词表（插件折算过、带 类/通道）→ 内置近义表 → 本身就是通道名
    function 取映射(词, 通道, 词表) {
      const 条 = 词表 && 词表[词]
      if (条 && typeof 条 === 'object') {
        if (条.类 === '生理') return null
        const 通 = 条.通道 || (条.类 ? null : 条)   // 新格式 / 旧格式
        if (通 && Object.keys(通).length) return 通
      }
      return 近义[词] || (通道.includes(词) ? { [词]: 1 } : null)
    }
    // 这个词是不是生理状态（硬编码那批 + 折算模型判定为生理的）
    function 是生理(词, 词表) {
      if (生理词.includes(词)) return true
      const 条 = 词表 && 词表[词]
      return Boolean(条 && 条.类 === '生理')
    }
    function 折算到通道(她分, 通道, 词表) {
      const 结果 = {}
      for (const [词, 分] of Object.entries(她分 || {})) {
        const v = Number(分) || 0
        if (v <= 0) continue
        const 映射 = 取映射(词, 通道, 词表)
        if (!映射) continue
        for (const [通, 系数] of Object.entries(映射)) {
          if (!通道.includes(通)) continue
          结果[通] = (结果[通] || 0) + v * 系数
        }
      }
      return 结果
    }

    function 心情页(props) {
      const st = props.st
      const 混 = (st && st.混合) || []
      // 2026-11-25：心情分两栏——「客观」是插件按 OCC 评估算出的 PAD，「主观」是她自己用 emo_mood 写的一句话 + 自评分。
      const [面, set面] = React.useState('主观')
      const 自 = st && st.self
      const 通道 = Object.keys((st && st.强度) || {})
      const 她分 = (自 && 自.scores && typeof 自.scores === 'object') ? 自.scores : {}
      const 她词 = Object.keys(她分).filter((词) => Number(她分[词]) > 0).sort((a, b) => Number(她分[b]) - Number(她分[a]))
      const 折算后 = 折算到通道(她分, 通道, (st && st.词表) || {})
      // 三种来源都没对上的词：单独列出来，别让它们凭空消失
      const 未对上 = 她词.filter((词) => !取映射(词, 通道, (st && st.词表) || {}) && !是生理(词, (st && st.词表) || {}))
      // 不归一：情绪各自独立，加起来不必是 100%。折算值 ×10 就是百分比（可能超过 100，那是真的强）。
      const 强度 = (词) => Math.round((折算后[词] || 0) * 10)
      const 排序 = 通道.slice().sort((a, b) => (折算后[b] || 0) - (折算后[a] || 0))
      // 到 80% 的情绪（给卡片变色用），分数高的在前
      const 主观高们 = 排序.map((词) => [词, 强度(词)]).filter(([, v]) => v >= 80).sort((a, b) => b[1] - a[1])
      const 合计 = 她词.reduce((a, 词) => a + Number(她分[词]), 0)
      const 生理分 = 她词.filter((词) => 是生理(词, (st && st.词表) || {}))
      const 生理提示 = 生理分.length
        ? ('（' + 生理分.map((词) => 词 + ' ' + 她分[词]).join('、') + ' 属生理状态，暂不分析）')
        : ''
      const 主观页 = h('div', {},
        h('div', { 'data-em-hero': '', style: 卡面(主观高们, st && st.配置) || undefined },
          h('div', { 'data-em-big': '' }, 她词.length ? String(她词[0]) : '还没打分'),
          h('div', { 'data-em-sub': '' }, 她词.length
            ? ('她自己的主观评分（0~10，各算各的）：' + 她词.map((词) => 词 + ' ' + 她分[词]).join(' / '))
            : '她还没给自己打过分。用 emo_mood 写心情时带上 scores，这里就有了。'),
          h('div', { 'data-em-sub': '' }, 她词.length
            ? ('情绪分析：' + (排序.filter((词) => 强度(词) > 0).map((词) => 词 + ' ' + 强度(词) + '%').join(' / ') || '（没对上任何通道）'))
            : ''),
          生理提示 ? h('div', { 'data-em-note': '' }, 生理提示) : null,
          未对上.length ? h('div', { 'data-em-note': '' }, '这些词还未收录于情绪分析档案：' + 未对上.join('、') + '（插件会尝试分析，若成功便记录进档案之中）') : null),
        h('div', { 'data-em-sec': '' },
          h('div', { 'data-em-h': '' }, '14 项情绪 —— 主观评分分析'),
          ...(排序.length
            ? 排序.map((词) => {
              const v = 强度(词)
              return h('div', { key: 词, style: { display: 'flex', flexDirection: 'column', gap: 3 } },
                h('div', { 'data-em-row': '' }, h('span', {}, 词), h('span', {}, v + '%')),
                h('div', { 'data-em-bar': '' },
                  h('div', { 'data-em-fill': '', 'data-full': v >= 100 ? '' : undefined, 'data-lit': v >= 80 ? '' : undefined, style: { width: (v <= 0 ? 0 : Math.max(1, Math.min(100, v))) + '%', ...条色(词, v) } })))
            })
            : [h('div', { 'data-em-note': '' }, '还没有状态')])))
      const 客观条们 = Object.entries((st && st.强度) || {}).sort((a, b) => b[1] - a[1])
      // 到 80% 的情绪（给卡片变色用），分数高的在前
      const 客观高们 = 客观条们.map(([k, v]) => [k, Math.round(Number(v) * 100)]).filter(([, v]) => v >= 80).sort((a, b) => b[1] - a[1])
      const 客观页 = h('div', {},
        h('div', { 'data-em-hero': '', style: 卡面(客观高们, st && st.配置) || undefined },
          h('div', { 'data-em-big': '' }, (混[0] && 混[0][0]) || '平常'),
          h('div', { 'data-em-sub': '' }, (st && st.行) || '还没有状态'),
          h('div', { 'data-em-sub': '' }, 混.length
            ? '成分：' + 混.map((x) => x[0] + ' ' + Math.round(x[1] * 100) + '%').join(' / ')
            : '还没有成形的情绪'),
          h('div', { 'data-em-sub': '' }, '派生：' + (Object.entries((st && st.派生) || {})
            .filter(([, v]) => Number(v) > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => k + ' ' + Math.round(Number(v) * 100) + '%')
            .join('　') || '无'))),

        h('div', { 'data-em-sec': '' },
          h('div', { 'data-em-h': '' }, '14 项情绪 —— 系统客观评分'),
          ...客观条们.map((pair) =>
            h('div', { key: pair[0], style: { display: 'flex', flexDirection: 'column', gap: 3 } },
              h('div', { 'data-em-row': '' }, h('span', {}, pair[0]), h('span', {}, Math.round(Number(pair[1]) * 100) + '%')),
              h('div', { 'data-em-bar': '' },
                h('div', { 'data-em-fill': '', 'data-full': Math.round(Number(pair[1]) * 100) >= 100 ? '' : undefined, 'data-lit': Math.round(Number(pair[1]) * 100) >= 80 ? '' : undefined, style: { width: (Math.round(Number(pair[1]) * 100) <= 0 ? 0 : Math.max(1, Math.round(Number(pair[1]) * 100))) + '%', ...条色(pair[0], Math.round(Number(pair[1]) * 100)) } }))))))
      return h('div', {},
        h('div', { 'data-em-seg': '' },
          h('button', { 'data-on': 面 === '主观' ? '' : undefined, onClick: () => set面('主观') }, '主观'),
          h('button', { 'data-on': 面 === '客观' ? '' : undefined, onClick: () => set面('客观') }, '客观')),
        ...(面 === '主观' ? [主观页] : [客观页]))
    }

    function 记忆页(props) {
      const [q, setQ] = React.useState('')
      const [条, set条] = React.useState([])
      const [总, set总] = React.useState(0)
      const [偏, set偏] = React.useState(0)
      const [忙, set忙] = React.useState(false)
      const 拉 = (起, 词, 覆盖) => {
        set忙(true)
        return 取('/memories?limit=20&offset=' + 起 + '&q=' + encodeURIComponent(词 || '') + '&session=' + encodeURIComponent(props.会话 || ''))
          .then((j) => { set总(j.总 || 0); set偏(起); set条((旧) => (覆盖 ? (j.条 || []) : 旧.concat(j.条 || []))) })
          .finally(() => set忙(false))
      }
      React.useEffect(() => { if (props.会话) 拉(0, '', true) }, [props.会话])
      return h('div', {},
        h('div', { 'data-em-sec': '', style: { marginTop: 0 } },
          h('div', { 'data-em-h': '' }, '记忆（共 ' + 总 + ' 条）'),
          h('input', {
            'data-em-input': '', style: { width: '100%' }, placeholder: '搜关键词，回车', value: q,
            onChange: (e) => setQ(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') 拉(0, e.target.value, true) },
          })),
        h('div', { 'data-em-sec': '' },
          ...条.map((m) => h('div', { key: m.id, 'data-em-card': '' },
            h('div', {}, m.text),
            h('div', { 'data-em-meta': '' },
              h('span', { 'data-em-chip': '' }, '重要 ' + (Math.round(Number(m.重要度 || 0) * 100) / 100)),
              h('span', { 'data-em-chip': '' }, '新鲜 ' + Math.round(Number(m.新鲜度 || 0) * 100) + '%'),
              h('span', { 'data-em-chip': '' }, '想起 ' + (m.想起次数 || 0) + ' 次'),
              h('span', {}, '存入 ' + (m.年龄天 != null ? m.年龄天 + ' 天前' : '—'))),
            h('div', { 'data-em-meta': '' },
              h('span', {}, new Date(m.at || Date.now()).toLocaleString()),
              m.类别 ? h('span', {}, m.类别) : null,
              m.最近想起 ? h('span', {}, '最近想起 ' + new Date(m.最近想起).toLocaleString()) : null),
            h('div', { 'data-em-meta': '' },
              m.affect
                ? h('span', { 'data-em-chip': '' }, '当时：' + (m.affect.词 || '—') + ' P' + m.affect.P + ' A' + m.affect.A + ' D' + m.affect.D + (m.affect.lastMood ? '　最近想起：' + m.affect.lastMood : ''))
                : h('span', {}, '（没有指纹）'),
              (m.tags || []).slice(0, 4).map((t) => h('span', { key: t }, '#' + t))))),
          h('div', { style: { display: 'flex', gap: 8, marginTop: 6 } },
            h('button', { 'data-em-btn': '', disabled: 忙, onClick: () => 拉(偏 + 20, q, false) }, 忙 ? '读着…' : '再往前看 20 条'))))
    }

    function 设置页(props) {
      const st = props.st
      const 刷新 = props.刷新
      const 配 = (st && st.配置) || {}
      const [会话, set会话] = React.useState([])
      const [保存错, set保存错] = React.useState('')
      React.useEffect(() => {
        let 活 = true
        const 拉 = () => 取('/sessions').then((j) => { if (活) set会话(j.条 || []) }).catch(() => {})
        拉()
        const t = setInterval(拉, 15000)
        return () => { 活 = false; clearInterval(t) }
      }, [])
      const 存 = (补丁) => fetch(API + '/config', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(补丁),
      }).then((r) => r.json()).then((j) => { if (!j || j.ok !== true) throw new Error('服务端没接受'); set保存错(''); 刷新() })
        .catch((e) => set保存错('没保存上：' + ((e && e.message) || '原因不明')))
      const 改 = (k, v) => 存({ [k]: v })
      const 绑 = (st && st.绑定列表) || (Array.isArray(配.绑定会话) ? 配.绑定会话 : (配.绑定会话 ? [配.绑定会话] : []))
      const 指 = props.会话

      return h('div', {},
        h('div', { 'data-em-sec': '', style: { marginTop: 0 } },
          h('div', { 'data-em-h': '' }, '会话绑定'),
          h('div', { 'data-em-note': '' }, '绑全部会话，或只绑指定的几个。绑定时只有这些会话会注入、判定、写记忆；每张卡片右边的导出各自生成一份文件。',
          h('div', { 'data-em-note': '' }, '当前状态：模式 ' + (配.绑定模式 || '全部') + '　会话 ' + 会话.length + ' 个　已勾选 ' + 绑.length + ' 个')),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '绑全部会话'),
            h('input', { type: 'radio', name: 'em-bind', checked: 配.绑定模式 !== '指定', onChange: () => 存({ 绑定模式: '全部' }) })),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '只绑勾选的会话'),
            h('input', { type: 'radio', name: 'em-bind', checked: 配.绑定模式 === '指定', onChange: () => 存({ 绑定模式: '指定' }) })),
          ...(配.绑定模式 !== '指定'
            ? [
              h('div', { key: 'all', 'data-em-note': '' }, '现在绑全部会话：所有会话都会注入、判定、写记忆。'),
              h('div', { key: 'allbtn', style: { marginTop: 6 } },
                h('button', { 'data-em-btn': '', onClick: () => { window.open(API + '/export', '_blank') } }, '导出全部')),
            ]
            : (会话.length
              ? 会话.map((x) => {
                const 勾了 = 绑.includes(x.id)
                return h('div', { key: x.id, 'data-em-sess': '', 'data-on': 勾了 ? '' : undefined },
                  h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 } },
                    h('input', {
                      type: 'checkbox', checked: 勾了,
                      onChange: (e) => {
                        const 新列 = e.target.checked ? [...绑, x.id] : 绑.filter((y) => y !== x.id)
                        存({ 绑定会话: 新列 })
                      },
                    }),
                    h('span', {}, (x.title || x.id.slice(0, 8)) + (x.id === (st && st.key) ? '（当前）' : ''))),
                  h('div', { style: { display: 'flex', gap: 6 } },
                    h('button', {
                      'data-em-btn': '', style: { padding: '3px 8px' },
                      onClick: (e) => { e.stopPropagation(); window.open(API + '/export?session=' + encodeURIComponent(x.id), '_blank') },
                    }, '导出'),
                    h('label', { 'data-em-btn': '', style: { padding: '3px 8px', cursor: 'pointer' } },
                      '导入',
                      h('input', {
                        type: 'file', accept: 'application/json', style: { display: 'none' },
                        onChange: async (e) => {
                          const f = e.target.files && e.target.files[0]
                          if (!f) return
                          try {
                            const 文本 = await f.text()
                            const r = await fetch(API + '/import?session=' + encodeURIComponent(x.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: 文本 })
                            const j = await r.json()
                            set保存错('导入到 ' + (x.title || x.id.slice(0, 8)) + '：会话 ' + (j.导入会话 || 0) + ' 份，记忆 ' + (j.导入记忆 || 0) + ' 条')
                            刷新()
                          } catch (err) { set保存错('导入失败：' + ((err && err.message) || '原因不明')) }
                        },
                      })))
                )
              })
              : [h('div', { key: 'none', 'data-em-note': '' }, '没读到正在跑的会话')])),
          h('div', { 'data-em-note': '' }, 保存错)),

        h('div', { 'data-em-sec': '' },
          h('div', { 'data-em-h': '' }, '心情设置'),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '每轮注入心境'),
            h('input', { type: 'checkbox', checked: 配.注入 !== false, onChange: (e) => 存({ 注入: e.target.checked }) })),
          h('div', { 'data-em-h2': '' }, '基线'),
          h(数字, { 键: '基线P', 名: '基线 P（效价）', 值: 配.基线P, 存: 改, 说明: '没事的时候，效价往这里回；越大越容易觉得舒服' }),
          h(数字, { 键: '基线A', 名: '基线 A（唤醒）', 值: 配.基线A, 存: 改, 说明: '没事的时候，唤醒往这里回；负值表示偏安静' }),
          h(数字, { 键: '基线D', 名: '基线 D（掌控）', 值: 配.基线D, 存: 改, 说明: '没事的时候，掌控感往这里回；正=略占上风，负=略被动' }),
          h('div', { 'data-em-h2': '' }, '回落（每 5 分钟一轮的比例）'),
          h(数字, { 键: '弛豫P', 名: 'P 回落', 值: 配.弛豫P, 存: 改, 说明: '每 5 分钟向基线回落的比例；越大，情绪散得越快' }),
          h(数字, { 键: '弛豫A', 名: 'A 回落', 值: 配.弛豫A, 存: 改, 说明: '同上，作用于唤醒轴；唤醒本来就散得最快' }),
          h(数字, { 键: '弛豫D', 名: 'D 回落', 值: 配.弛豫D, 存: 改, 说明: '同上，作用于掌控轴' }),
          h(数字, { 键: '强度衰减', 名: '通道强度衰减', 值: 配.强度衰减, 存: 改, 说明: '每轮把 14 个通道的强度乘 (1−这个数)；越大越健忘' }),
          h(数字, { 键: '读出阈值', 名: '读出阈值', 值: 配.读出阈值, 存: 改, 说明: '通道强度超过它才算进"成分"；调低更容易出现混合情绪' }),
          h('div', { 'data-em-h2': '' }, '精力'),
          h(数字, { 键: '精力初值', 名: '新会话起始精力', 值: 配.精力初值, 步: 1, 存: 改, 说明: '新会话第一次出现时有多少精力' }),
          h(数字, { 键: '精力每小时掉', 名: '醒着每小时 −', 值: 配.精力每小时掉, 步: 1, 存: 改, 说明: '醒着时每小时扣多少；越大越容易累' }),
          h(数字, { 键: '睡眠回复', 名: '跨夜睡一觉 +', 值: 配.睡眠回复, 步: 1, 存: 改, 说明: '跨过凌晨且间隔够久，算睡一觉，回多少' }),
          h(数字, { 键: '闲置回复', 名: '闲着每小时 +', 值: 配.闲置回复, 步: 1, 存: 改, 说明: '一小时以上没动静，按歇着算，每小时回多少' }),
          h(数字, { 键: '小憩回复', 名: '小憩每小时 +', 值: 配.小憩回复, 步: 1, 存: 改, 说明: '半小时到一小时没动静的回复速度' }),
          h(数字, { 键: '每轮扣', 名: '每聊一轮 −', 值: 配.每轮扣, 步: 1, 存: 改, 说明: '每聊一轮额外扣多少；和"每小时掉"叠加' }),
          h('div', { 'data-em-h2': '' }, '判定（省调用）'),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '事务性轮次不调判定模型'),
            h('input', { type: 'checkbox', checked: 配.快评跳过 !== false, onChange: (e) => 存({ 快评跳过: e.target.checked }) })),
          h('div', { 'data-em-note': '' }, '只有「整句是应答」或「整句只有图/表情」、并且她自己那轮也只回了一两句时，才跳过判定；两边任何一边有情绪信号就照旧判。表情包的名字会以 [表情:名字] 送给判定模型当线索。'),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '注入里说「旁人看得出什么」'),
            h('input', { type: 'checkbox', checked: 配.掩饰层 !== false, onChange: (e) => 存({ 掩饰层: e.target.checked }) })),
          h('div', { 'data-em-note': '' }, '关掉：注入里只写「内心」是什么；开着会多一句「显露于外的许是…」，只是描述，不是要她演。'),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '关系账（按人记暖度）'),
            h('input', { type: 'checkbox', checked: 配.关系账 !== false, onChange: (e) => 存({ 关系账: e.target.checked }) })),
          h('div', { 'data-em-note': '' }, '记「跟这个人处得怎么样」，只给判定当分寸参考（熟人说的话更进得去）；情绪场本身仍按会话。「不记感情场合」默认空 = 全局一本账（改插件也算关系的一部分），填了场合名那个场合才只更新最近/次数。'),
          h(文本, {
            键: '主人名字', 名: '主人名字（QQ 昵称）', 值: 配.主人名字, 存: 改, 占位: '比如 endlessstary',
            说明: '只有名字对得上才认作主人：起点暖度更高、判定里能称「主人」。空着 = 谁都不当主人 —— 宁可不认，也别认错（私聊不等于主人）。',
          }),
          h(文本, {
            键: '主人账号', 名: '主人账号（渠道:编号，逗号分隔）',
            值: Array.isArray(配.主人账号) ? 配.主人账号.join(', ') : String(配.主人账号 || ''),
            存: (k, v) => 改(k, String(v).split(/[,，\s]+/).filter(Boolean)),
            占位: '比如 qq:123456',
            说明: '认主人优先看这个，不看昵称（昵称会重名、也能随时改）。QQ 填 qq:你的QQ号；微信将来填 wechat:wxid。命中就当主人，账上的名字固定成「主人名字」，改昵称也不会另起一条。',
          }),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '把「眼前这人」写进每轮注入'),
            h('input', { type: 'checkbox', checked: 配.关系进注入 === true, onChange: (e) => 存({ 关系进注入: e.target.checked }) })),
          h('div', { 'data-em-note': '' }, '默认关：注入已经够长了，先只让判定知道。'),          h('div', { 'data-em-h2': '' }, '三根轴的耦合'),
          h(数字, { 键: '正向消退敌意', 名: '好相处 → 敌意消退', 值: 配.正向消退敌意, 存: 改, 说明: '一次正面互动让敌意退多少；0 = 敌意完全不动（各走各的——喜欢她做的饭，不该抵消她昨天骂你）' }),
          h(数字, { 键: '负向折扣亲近', 名: '被惹 → 亲近折扣', 值: 配.负向折扣亲近, 存: 改, 说明: '一次负面互动让亲近掉多少；0 = 亲近完全不动' }),          h('div', { 'data-em-h2': '' }, '遗忘'),
          h(数字, { 键: '关系半衰天', 名: '多久淡一半（天）', 值: 配.关系半衰天, 步: 5, 存: 改, 说明: '多久没说话，亲近/敌视就掉到离中性一半；敌意掉得慢 2.5 倍（记仇比记好持久）' }),
          h(数字, { 键: '关系信半衰天', 名: '信任淡一半（天）', 值: 配.关系信半衰天, 步: 10, 存: 改, 说明: '信任掉得比亲近慢——它是靠时间攒的' }),
          h(数字, { 键: '关系归档天', 名: '多久没说话才淡忘（天）', 值: 配.关系归档天, 步: 10, 存: 改, 说明: '超过这么多天、而且已经淡了的，标成淡忘（数据留着，再说一句话就回来）；主人永不被淡忘' }),
          h(数字, { 键: '关系归档强度', 名: '淡到什么程度才淡忘', 值: 配.关系归档强度, 存: 改, 说明: '离中性多近才算「已经淡了」；越小越严格' }),
          h(数字, { 键: '最多连续跳过', 名: '最多连着跳几轮', 值: 配.最多连续跳过, 步: 1, 存: 改, 说明: '连着跳过这么多轮后，下一轮一定判一次，免得心情飘太久没人管' })),
        h('div', { 'data-em-sec': '' },
          h('div', { 'data-em-h': '' }, '卡片配色'),
          h('div', { 'data-em-note': '' }, '心情页顶部那张卡：有情绪到 80% 时会从右上角透出那一族的颜色。这三项只管卡片，不管情绪条本身。'),
          h(数字, { 键: '卡面色浓度', 名: '颜色浓度（0~0.8）', 值: 配.卡面色浓度, 步: 0.02, 存: 改, 说明: '最深能到多浓；默认 0.36。太浓会压住上面的字' }),
          h(数字, { 键: '卡片椭圆大小', 名: '角落光晕大小（px）', 值: 配.卡片椭圆大小, 步: 20, 存: 改, 说明: '右上角那片椭圆的宽度；默认 300。小 = 收得更紧，大 = 铺得更开' }),
          h(数字, { 键: '卡片过渡软度', 名: '过渡软度（0~1）', 值: 配.卡片过渡软度, 步: 0.05, 存: 改, 说明: '0 = 边缘干脆、看得出弧形；1 = 化得很开、几乎没有边界；默认 0.5' })),
        h('div', { 'data-em-sec': '' },
          h('div', { 'data-em-h': '' }, '记忆设置'),
          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '按关键词想起旧记忆'),
            h('input', { type: 'checkbox', checked: 配.记忆注入 !== false, onChange: (e) => 存({ 记忆注入: e.target.checked }) })),          h('label', { 'data-em-row': '', style: { cursor: 'pointer' } },
            h('span', {}, '联想（顺着想起的事再摸一跳）'),
            h('input', { type: 'checkbox', checked: 配.联想 !== false, onChange: (e) => 存({ 联想: e.target.checked }) })),
          h('div', { 'data-em-note': '' }, '这轮想起的事里那些少见的词，会牵出另一件相关的事（记录页会标「联想」，说明是顺着什么想起来的）。'),
          h(数字, { 键: '联想门槛', 名: '联想门槛', 值: 配.联想门槛, 存: 改, 说明: '共享稀词的权重到多少才算联得上；调高更矜持，调低更发散' }),
          (() => {
            // hooks 必须在任何 return 之前，顺序不能变（上一版在这里写反了，整个设置页白屏）
            const [就绪, set就绪] = React.useState(null)
            const [日志, set日志] = React.useState('')
            const [装着, set装着] = React.useState(false)
            React.useEffect(() => { fetch('/dsh-emotion-memory/api/env').then((r) => r.json()).then(set就绪).catch(() => {}) }, [])
            React.useEffect(() => {
              if (!装着) return undefined
              const t = setInterval(() => {
                fetch('/dsh-emotion-memory/api/env/log').then((r) => r.json()).then((j) => set日志(j.文本 || '')).catch(() => {})
              }, 1200)
              return () => clearInterval(t)
            }, [装着])
            const 装 = () => {
              set装着(true)
              fetch('/dsh-emotion-memory/api/env/install', { method: 'POST' }).then((r) => r.json()).then((j) => {
                if (!j.ok) { set日志('起不来：' + (j.error || '')); set装着(false) }
              }).catch(() => { set日志('请求失败'); set装着(false) })
            }
            if (!就绪) return null
            return h('div', {},
              h('div', { 'data-cg-note': '' }, '依赖：' + (就绪.依赖 && 就绪.依赖.装了 ? '已装' : '没装') + '　模型：' + (就绪.模型 && 就绪.模型.就绪 ? '已就绪' : '没下')),
              h('button', { 'data-cg-tab': '', onClick: 装, style: { marginTop: 6 } }, 装着 ? '正在装…' : '装依赖 + 下模型'),
              (装着 || 日志) ? h('pre', {
                style: {
                  marginTop: 8, padding: '10px 12px', borderRadius: 10, maxHeight: 220, overflow: 'auto',
                  background: 'rgba(127,127,127,.12)', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                },
              }, 日志 || '等待输出…') : null)
          })(),
          h('label', { 'data-cg-row': '' }, h('span', {}, '语义检索（本地小模型）'),
            h('input', { type: 'checkbox', checked: 配.向量检索 !== false, onChange: (e) => 改('向量检索', e.target.checked) })),
          h('div', { 'data-cg-note': '' }, '打开后字面没命中、但意思相近的也能想起来；模型没装好会自动只用字面。'),
          h(数字, { 键: '记忆门槛', 名: '命中门槛', 值: 配.记忆门槛, 存: 改, 说明: '检索分低于它就不注入；调低更爱想起，但容易想起不相干' }),
          h(数字, { 键: '一次想起几条', 名: '一次想起几条（1–5）', 值: 配.一次想起几条, 步: 1, 存: 改, 说明: '一轮最多注入几条记忆，上限 5' }),
          h(数字, { 键: '重复间隔分钟', 名: '同一条多久内不重复（分钟）', 值: 配.重复间隔分钟, 步: 1, 存: 改, 说明: '同一条记忆在这个时间内不重复想起' }),
          h(数字, { 键: '每天记忆上限', 名: '每天最多想起（0 = 不限）', 值: 配.每天记忆上限, 步: 1, 存: 改, 说明: '一天最多想起几次；0 = 不限' }),
          h(数字, { 键: '半衰期天', 名: '新鲜度半衰期（天）', 值: 配.半衰期天, 步: 1, 存: 改, 说明: '新鲜度多久掉一半；越大越偏爱旧记忆' }),
          h('div', { 'data-em-h2': '' }, '检索打分权重'),
          h('div', { 'data-em-note': '' }, '四个权重决定"想起谁"。调大相关 = 只认字面对得上；调大新鲜 = 偏爱最近；调大重要 = 老账本优先。'),
          h(数字, { 键: '权重新鲜', 名: '新鲜', 值: 配.权重新鲜, 存: 改, 说明: '越近的越值钱（配合上面的半衰期）' }),
          h(数字, { 键: '权重重要', 名: '重要', 值: 配.权重重要, 存: 改, 说明: '写入时定的重要度' }),
          h(数字, { 键: '权重相关', 名: '相关', 值: 配.权重相关, 存: 改, 说明: '字面重合度；调低就会想起不相干的' }),
          h(数字, { 键: '权重心境', 名: '心境一致', 值: 配.权重心境, 存: 改, 说明: '编码时的心情和现在像不像' }),
          h(数字, { 键: '访问加成', 名: '访问加成', 值: 配.访问加成, 存: 改, 说明: '每被想起一次，重要度临时加多少（不改存量值）' }),
          h(数字, { 键: '遗忘天数', 名: '多久没想起算老（天）', 值: 配.遗忘天数, 步: 10, 存: 改, 说明: '超过这么多天、又没被想起的，进入"已遗忘"' }),
          h(数字, { 键: '遗忘重要阈值', 名: '重要度高于此不忘', 值: 配.遗忘重要阈值, 步: 0.1, 存: 改, 说明: '重要度高于它的不遗忘' }),
          h(数字, { 键: '派生阈值', 名: '派生情绪注入阈值', 值: 配.派生阈值, 步: 0.05, 存: 改, 说明: '派生情绪（委屈/吃醋等）超过它才在注入里补一句' })))
    }

    function Panel() {
      const [st, setSt] = React.useState(null)
      const [页, set页] = React.useState('mood')
      const [会话, set会话] = React.useState('')
      const [列表, set列表] = React.useState([])

      React.useEffect(() => {
        取('/sessions').then((j) => {
          const 条 = j.条 || []
          set列表(条)
          set会话((旧) => 旧 || (条[0] && 条[0].id) || '')
        }).catch(() => {})
      }, [])

      React.useEffect(() => {
        if (!会话) return
        let 活 = true
        const 跑 = () => 取('/state?session=' + encodeURIComponent(会话)).then((j) => { if (活) setSt(j) }).catch(() => {})
        跑()
        const t = setInterval(跑, 15000)
        return () => { 活 = false; clearInterval(t) }
      }, [会话])

      const 刷新 = () => { if (会话) 取('/state?session=' + encodeURIComponent(会话)).then(setSt).catch(() => {}) }
      const 页签 = [['mood', '心情'], ['rel', '关系'], ['mem', '记忆'], ['log', '记录'], ['cfg', '设置']]
      const 绑定模式 = st && st.配置 && st.配置.绑定模式
      const 绑定列表 = (st && st.绑定列表) || []
      // 绑定了但一个都没勾时，仍然列全部 —— 否则下拉空、三个页签全空白
      const 可看 = 绑定模式 === '指定' && 绑定列表.length
        ? 列表.filter((x) => 绑定列表.includes(x.id))
        : 列表
      // 会话不在可看范围里就切到第一个
      React.useEffect(() => {
        if (!可看.length) return
        if (!可看.some((x) => x.id === 会话)) set会话(可看[0].id)
      }, [可看.map((x) => x.id).join(','), 会话])
      const 当前 = 列表.find((x) => x.id === 会话) || {}
      const 当前名 = 当前.title || (会话 ? 会话.slice(0, 8) : '（没有会话）')

      return h('div', { 'data-em-wrap': '' },
        h('div', { 'data-em-topbar': '' },
          h('div', { 'data-em-tabs': '' }, 页签.map((x) =>
            h('button', { key: x[0], 'data-em-tab': '', 'data-on': 页 === x[0] ? '' : undefined, onClick: () => set页(x[0]) }, x[1]))),
          h('select', {
            'data-em-input': '', style: { width: 220 }, value: 会话,
            onChange: (e) => set会话(e.target.value),
          },
            ...可看.map((x) => h('option', { key: x.id, value: x.id }, (x.title || x.id.slice(0, 8)) + (x.id === (st && st.key) ? '（当前）' : ''))))),
        页 === 'mood' ? h(心情页, { st: st, 会话: 会话 }) : null,
        页 === 'rel' ? h(关系页, { st: st }) : null,
        页 === 'mem' ? h(记忆页, { 会话: 会话 }) : null,
        页 === 'log' ? h(记录页, { 会话: 会话 }) : null,
        页 === 'cfg' ? h(设置页, { st: st, 刷新: 刷新, 会话: 会话 }) : null)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-emotion-memory')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-emotion-memory: css')
        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'emotion-memory', order: 41, label: '情绪记忆' },
          () => h(Panel),
        ))
      },
    }
  },
})
