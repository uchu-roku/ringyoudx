// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { auth, db, googleProvider } from './firebase'
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth'
import {
  addDoc, collection, onSnapshot, query, serverTimestamp
} from 'firebase/firestore'

// ===== 作業種別と推奨単位（選ぶと単位が自動セットされます） =====
const TASK_OPTIONS = [
  { v: '下刈り', unit: 'ha' },
  { v: '間伐',  unit: '本' },
  { v: '主伐',  unit: 'm³' },
  { v: '造林',  unit: '本' },
  { v: '路網整備', unit: 'm' },
  { v: '集材',  unit: 'm³' },
  { v: '造材',  unit: 'm³' },
  { v: '搬出',  unit: 'm³' },
  { v: '調査',  unit: 'ha' },
]
const WEATHER = ['晴','曇','雨','雪','その他']
const INCIDENT = ['無','軽微','事故']

type Tab = 'dashboard' | 'form'

// Firestoreのドキュメントを標準形に整える
function normalizeRows(input: any[]){
  return input.map(r=>{
    const dateSource = r.work_date ?? r.created_at ?? r.createdAt
    return {
      work_date: toDateString(dateSource),
      worker_id: r.worker_id ?? '',
      worker_name: r.worker_name ?? '',
      team: r.team ?? '',
      site_id: r.site_id ?? '',
      stand_id: r.stand_id ?? '',
      task_code: r.task_code ?? '',
      work_time_min: num(r.work_time_min),
      output_value: num(r.output_value),
      output_unit: normalizeUnit(r.output_unit),
      machine_id: r.machine_id ?? '',
      machine_time_min: num(r.machine_time_min),
      weather: r.weather ?? '',
      ky_check: bool(r.ky_check),
      incident: r.incident ?? '無',
      photo_1: r.photo_1 ?? '', photo_2: r.photo_2 ?? '', photo_3: r.photo_3 ?? '',
      note: r.note ?? '',
    }
  })
}
function toDateString(v:any){
  if (!v) return ''
  if (typeof v === 'string') return v.slice(0,10)
  if (typeof v === 'object' && 'seconds' in v){
    const d = new Date(v.seconds * 1000)
    return d.toISOString().slice(0,10)
  }
  try{ return new Date(v).toISOString().slice(0,10) }catch{ return '' }
}
function normalizeUnit(u:any){ const s=String(u??'').trim(); return s==='m3' ? 'm³' : s }
function num(v:any){ const n = Number(v); return isFinite(n) ? n : 0 }
function bool(v:any){ if(typeof v==='boolean') return v; const s=String(v??'').toLowerCase(); return ['true','1','yes','y','on','はい'].includes(s) }
function fmt(n:number, d=0){ return isFinite(n) ? n.toFixed(d) : '-' }
function short(s:string){ return s.length>6 ? s.slice(5) : s }
function fmtNum(n:number, d=0){ return isFinite(n) ? n.toFixed(d) : '-' }

// KPI集計（前回と同じロジック）
function computeKPI(rows: ReturnType<typeof normalizeRows>){
  const count = rows.length
  const workerHours = rows.reduce((a,r)=>a + (r.work_time_min||0)/60, 0)
  const machineHours = rows.reduce((a,r)=>a + (r.machine_time_min||0)/60, 0)
  const kyCount = rows.reduce((a,r)=>a + (r.ky_check?1:0), 0)
  const incidentLight = rows.reduce((a,r)=>a + (r.incident==='軽微'?1:0), 0)
  const incidentSevere = rows.reduce((a,r)=>a + (r.incident==='事故'?1:0), 0)
  const kyRate = count>0 ? kyCount / count : 0

  const outByUnit = new Map<string, number>()
  for(const r of rows){
    const u = (r.output_unit||'').trim()
    if(!u) continue
    outByUnit.set(u, (outByUnit.get(u)||0) + (r.output_value||0))
  }
  const units = [...outByUnit.keys()]
  const singleUnit = units.length===1 ? units[0] : null
  const totalOutputLabel = units.length===0 ? '-' :
    (units.length===1 ? `${fmtNum(outByUnit.get(units[0])||0,1)} ${units[0]}`
                      : units.map(u=>`${fmtNum(outByUnit.get(u)||0,1)} ${u}`).join(' / '))
  const productivity = singleUnit && workerHours>0 ? (outByUnit.get(singleUnit)||0)/workerHours : NaN
  const productivityLabel = singleUnit && isFinite(productivity) ? `${productivity.toFixed(2)} ${singleUnit}/人時` : '-'

  const byDay = new Map<string, {out:number, hours:number}>()
  for(const r of rows){
    const key = r.work_date || ''
    if(!key) continue
    const cur = byDay.get(key) || {out:0, hours:0}
    if(singleUnit){ cur.out += (r.output_unit===singleUnit ? (r.output_value||0) : 0) }
    cur.hours += (r.work_time_min||0)/60
    byDay.set(key, cur)
  }
  const dailySeries = [...byDay.entries()]
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([d,v])=> ({label:d, value: singleUnit ? v.out : v.hours}))

  type SiteAgg = {
    key: string; days: number; workerHours: number; machineHours: number;
    outByUnit: Map<string,number>; kyRate: number; incidentLight: number; incidentSevere: number; count: number
  }
  const bySiteMap = new Map<string, SiteAgg>()
  const daySetBySite = new Map<string, Set<string>>()
  for(const r of rows){
    const key = r.site_id || '(未設定)'
    const s = bySiteMap.get(key) || {
      key, days:0, workerHours:0, machineHours:0, outByUnit:new Map(), kyRate:0, incidentLight:0, incidentSevere:0, count:0
    }
    s.workerHours += (r.work_time_min||0)/60
    s.machineHours += (r.machine_time_min||0)/60
    s.count += 1
    if (r.ky_check) s.kyRate += 1
    if (r.incident==='軽微') s.incidentLight += 1
    if (r.incident==='事故') s.incidentSevere += 1
    const u = (r.output_unit||'').trim()
    if(u) s.outByUnit.set(u, (s.outByUnit.get(u)||0) + (r.output_value||0))
    bySiteMap.set(key, s)
    const ds = daySetBySite.get(key) || new Set<string>()
    if (r.work_date) ds.add(r.work_date)
    daySetBySite.set(key, ds)
  }
  const bySite = [...bySiteMap.values()].map(s=>{
    const units2 = [...s.outByUnit.keys()]
    const outLabel = units2.length===0 ? '-' :
      (units2.length===1 ? `${fmtNum(s.outByUnit.get(units2[0])||0,1)} ${units2[0]}`
                         : units2.map(u=>`${fmtNum(s.outByUnit.get(u)||0,1)} ${u}`).join(' / '))
    const prod = (singleUnit && s.workerHours>0) ? ( (s.outByUnit.get(singleUnit)||0) / s.workerHours ) : NaN
    return {
      key: s.key,
      days: (daySetBySite.get(s.key)?.size)||0,
      workerHours: s.workerHours,
      machineHours: s.machineHours,
      outputLabel: outLabel,
      productivityLabel: (singleUnit && isFinite(prod)) ? `${prod.toFixed(2)} ${singleUnit}/人時` : '-',
      kyRate: s.count>0 ? s.kyRate/s.count : 0,
      incidentLight: s.incidentLight,
      incidentSevere: s.incidentSevere
    }
  })
  const bySiteSeries = bySite.map(s=>{
    const m = s.productivityLabel.match(/^([\d.]+)/)
    const v = m ? Number(m[1]) : 0
    return {label: s.key, value: v}
  })
  const workerSet = new Set(rows.map(r=>r.worker_id || r.worker_name).filter(Boolean))
  const teamSet = new Set(rows.map(r=>r.team).filter(Boolean))
  const siteSet = new Set(rows.map(r=>r.site_id).filter(Boolean))

  return {
    count, workerHours, machineHours, kyCount, kyRate,
    incidentLight, incidentSevere,
    totalOutputLabel, productivityLabel, singleUnit,
    dailySeries, bySite, bySiteSeries,
    workerCount: workerSet.size, teamCount: teamSet.size, siteCount: siteSet.size,
  }
}

export default function App(){
  const [user, setUser] = useState<User|null>(null)
  const [allRows, setAllRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string| null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')

  // 認証状態
  useEffect(()=> onAuthStateChanged(auth, u=> setUser(u)),[])

  // Firestore購読（コレクション：reports）
  useEffect(()=>{
    setLoading(true); setError(null)
    const qy = query(collection(db, 'reports'))
    const unsub = onSnapshot(qy, snap=>{
      setAllRows(snap.docs.map(d => d.data()))
      setLoading(false)
    }, e=>{ console.error(e); setError(e.message); setLoading(false) })
    return () => unsub()
  },[])

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold">林業DX – 経営ダッシュボード（Firestore）</h1>
          <div className="flex items-center gap-2">
            <button onClick={()=>setTab('dashboard')}
              className={`px-3 py-1.5 rounded-xl border ${tab==='dashboard'?'bg-black text-white':'bg-white'}`}>ダッシュボード</button>
            <button onClick={()=>setTab('form')}
              className={`px-3 py-1.5 rounded-xl border ${tab==='form'?'bg-black text-white':'bg-white'}`}>入力フォーム</button>
            {user
              ? (<>
                  <span className="text-sm text-gray-600">{user.displayName || user.email}</span>
                  <button className="px-3 py-1.5 rounded-xl border bg-white" onClick={()=>signOut(auth)}>ログアウト</button>
                </>)
              : (<button className="px-3 py-1.5 rounded-xl border bg-white" onClick={()=>signInWithPopup(auth, googleProvider)}>Googleでログイン</button>)
            }
          </div>
        </header>

        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-sm text-gray-600">
            データソース：Firestore <code>reports</code>（{loading ? '読込中…' : `${allRows.length} 件`}）
            {error && <span className="ml-2 text-red-600">※ {error}</span>}
          </div>
        </div>

        {!loading && !error && (
          tab==='dashboard'
            ? <DashboardPane rows={normalizeRows(allRows)} />
            : <FormPane onSaved={()=>setTab('dashboard')} />
        )}
      </div>
    </div>
  )
}

// ===== 入力フォーム（Firestoreに直接追加） =====
function FormPane({onSaved}:{onSaved:()=>void}){
  const today = new Date().toISOString().slice(0,10)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string>('')

  const [form, setForm] = useState({
    work_date: today,
    worker_id: '', worker_name: '', team: '',
    site_id: '', stand_id: '',
    task_code: '間伐',
    work_time_min: 0,
    output_value: 0,
    output_unit: '本',
    machine_id: '', machine_time_min: 0,
    weather: '晴', ky_check: true, incident: '無',
    photo_1:'', photo_2:'', photo_3:'', note:''
  })

  // 作業種別→単位 自動反映
  function onTaskChange(task: string){
    const t = TASK_OPTIONS.find(x => x.v === task)
    setForm(p => ({...p, task_code: task, output_unit: t ? t.unit : p.output_unit}))
  }

  async function save(){
    if (!form.work_date || !form.site_id || !form.task_code){
      setMsg('作業日・現場・作業種別は必須です'); return
    }
    setSaving(true); setMsg('')
    try{
      // Firestore: reports に追加（work_date は文字列、created_at はサーバ時刻）
      const payload = {
        ...form,
        work_time_min: Number(form.work_time_min)||0,
        output_value: Number(form.output_value)||0,
        machine_time_min: Number(form.machine_time_min)||0,
        output_unit: normalizeUnit(form.output_unit),
        created_at: serverTimestamp(),
      }
      await addDoc(collection(db, 'reports'), payload)
      setMsg('保存しました。ダッシュボードへ切り替えます。')
      onSaved()
    }catch(e:any){
      console.error(e)
      setMsg('保存に失敗しました：' + (e?.message || e))
    }finally{
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <p className="md:col-span-2 text-gray-600 text-sm">
        入力すると Firestore <code>reports</code> に登録され、ダッシュボードへリアルタイム反映されます。
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">作業日</span>
        <input type="date" className="border rounded-md p-2"
          value={form.work_date} onChange={e=>setForm({...form, work_date:e.target.value})}/>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">現場ID/名称</span>
        <input className="border rounded-md p-2" placeholder="SITE-001"
          value={form.site_id} onChange={e=>setForm({...form, site_id:e.target.value})}/>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">林班/小班ID（任意）</span>
        <input className="border rounded-md p-2" placeholder="B05-2"
          value={form.stand_id} onChange={e=>setForm({...form, stand_id:e.target.value})}/>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">作業種別</span>
        <select className="border rounded-md p-2" value={form.task_code} onChange={e=>onTaskChange(e.target.value)}>
          {TASK_OPTIONS.map(t => <option key={t.v} value={t.v}>{t.v}</option>)}
        </select>
      </label>

      <div className="flex items-end gap-2">
        <label className="flex-1 flex flex-col gap-1">
          <span className="text-sm text-gray-500">作業時間（分）</span>
          <input type="number" className="border rounded-md p-2" min={0} step={10}
            value={form.work_time_min} onChange={e=>setForm({...form, work_time_min:Number(e.target.value)})}/>
        </label>
        <label className="flex-1 flex flex-col gap-1">
          <span className="text-sm text-gray-500">成果量</span>
          <input type="number" className="border rounded-md p-2" min={0} step={0.1}
            value={form.output_value} onChange={e=>setForm({...form, output_value:Number(e.target.value)})}/>
        </label>
        <label className="w-28 flex flex-col gap-1">
          <span className="text-sm text-gray-500">単位</span>
          <select className="border rounded-md p-2" value={form.output_unit}
            onChange={e=>setForm({...form, output_unit:e.target.value})}>
            <option>ha</option><option>本</option><option>m³</option><option>m</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">使用機械ID/名称（任意）</span>
        <input className="border rounded-md p-2" placeholder="HL-04"
          value={form.machine_id} onChange={e=>setForm({...form, machine_id:e.target.value})}/>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">機械稼働（分）（任意）</span>
        <input type="number" className="border rounded-md p-2" min={0} step={10}
          value={form.machine_time_min} onChange={e=>setForm({...form, machine_time_min:Number(e.target.value)})}/>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">天候</span>
        <select className="border rounded-md p-2" value={form.weather}
          onChange={e=>setForm({...form, weather:e.target.value})}>
          {WEATHER.map(w => <option key={w}>{w}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={form.ky_check}
          onChange={e=>setForm({...form, ky_check:e.target.checked})}/>
        <span className="text-sm text-gray-700">KY実施</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">インシデント</span>
        <select className="border rounded-md p-2" value={form.incident}
          onChange={e=>setForm({...form, incident:e.target.value})}>
          {INCIDENT.map(i => <option key={i}>{i}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="text-sm text-gray-500">備考（任意）</span>
        <textarea className="border rounded-md p-2" rows={3}
          value={form.note} onChange={e=>setForm({...form, note:e.target.value})}/>
      </label>

      <div className="md:col-span-2 flex items-center gap-3">
        <button disabled={saving}
          className={`px-4 py-2 rounded-xl ${saving?'bg-gray-300':'bg-black text-white'}`}
          onClick={save}>{saving ? '保存中…' : '保存してダッシュボードへ'}</button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
    </div>
  )
}

// ===== ダッシュボード（そのまま） =====
function DashboardPane({rows}:{rows: ReturnType<typeof normalizeRows>}){
  const monthStr = new Date().toISOString().slice(0,7)
  const [task, setTask] = useState<string>('すべて')
  const [month, setMonth] = useState<string>(monthStr)

  const filtered = useMemo(()=>{
    const [y,m] = month.split('-').map(Number)
    return rows.filter(r=>{
      if (!r.work_date) return false
      const dt = new Date(r.work_date+'T00:00:00')
      const okMonth = dt.getFullYear()===y && (dt.getMonth()+1)===m
      const okTask = task==='すべて' || r.task_code===task
      return okMonth && okTask
    })
  },[rows, task, month])

  const kpi = useMemo(()=>computeKPI(filtered),[filtered])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-white border rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-500">月</span>
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="border rounded-md p-1"/>
        </div>
        <div className="bg-white border rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-500">作業種別</span>
          <select value={task} onChange={e=>setTask(e.target.value)} className="border rounded-md p-1">
            <option>すべて</option>
            {TASK_OPTIONS.map(t=> <option key={t.v} value={t.v}>{t.v}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <KpiCard title="総成果量" value={kpi.totalOutputLabel}/>
        <KpiCard title="労働時間（人時）" value={fmt(kpi.workerHours,1)}/>
        <KpiCard title="機械稼働（時間）" value={fmt(kpi.machineHours,1)}/>
        <KpiCard title="生産性（成果／人時）" value={kpi.productivityLabel}/>
        <KpiCard title="機械稼働率（機械h/人h）" value={kpi.workerHours>0? (kpi.machineHours/kpi.workerHours).toFixed(2):'-'}/>
        <KpiCard title="KY実施率" value={(kpi.kyRate*100).toFixed(0)+'%'} sub={kpi.kyCount+' / '+kpi.count+'件'}/>
        <KpiCard title="インシデント（軽微）" value={String(kpi.incidentLight)}/>
        <KpiCard title="インシデント（事故）" value={String(kpi.incidentSevere)}/>
        <KpiCard title="作業員数 / 班数 / 現場数" value={`${kpi.workerCount}人 / ${kpi.teamCount}班 / ${kpi.siteCount}現場`}/>
      </div>

      {/* 簡易チャート */}
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title={kpi.singleUnit ? `日別成果量（${kpi.singleUnit}）` : '日別作業時間（人時）'}
                   data={kpi.dailySeries} maxHeight={120}/>
        <ChartCard title="現場別 生産性" data={kpi.bySiteSeries} maxHeight={120}/>
      </div>

      {/* 現場別テーブル */}
      <div className="bg-white rounded-2xl shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">現場別サマリー</h2>
          <span className="text-sm text-gray-500">{filtered.length} 件</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-2">現場</th>
                <th className="text-right p-2">作業日数</th>
                <th className="text-right p-2">人時</th>
                <th className="text-right p-2">機械h</th>
                <th className="text-right p-2">成果量</th>
                <th className="text-right p-2">生産性</th>
                <th className="text-right p-2">KY率</th>
                <th className="text-right p-2">軽微</th>
                <th className="text-right p-2">事故</th>
              </tr>
            </thead>
            <tbody>
              {kpi.bySite.map(s=>(
                <tr key={s.key} className="border-t">
                  <td className="p-2">{s.key || '-'}</td>
                  <td className="p-2 text-right">{s.days}</td>
                  <td className="p-2 text-right">{fmt(s.workerHours,1)}</td>
                  <td className="p-2 text-right">{fmt(s.machineHours,1)}</td>
                  <td className="p-2 text-right">{s.outputLabel}</td>
                  <td className="p-2 text-right">{s.productivityLabel}</td>
                  <td className="p-2 text-right">{(s.kyRate*100).toFixed(0)}%</td>
                  <td className="p-2 text-right">{s.incidentLight}</td>
                  <td className="p-2 text-right">{s.incidentSevere}</td>
                </tr>
              ))}
              {kpi.bySite.length===0 && (
                <tr><td colSpan={9} className="p-2 text-gray-500">該当データがありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function KpiCard({title, value, sub}:{title:string, value:string, sub?:string}){
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function ChartCard({title, data, maxHeight}:{title:string, data:{label:string, value:number}[], maxHeight:number}){
  const max = Math.max(1, ...data.map(d=>d.value))
  const barW = 20, gap = 8
  const width = data.length * (barW + gap) + gap
  const height = maxHeight
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-sm text-gray-500 mb-2">{title}</div>
      {data.length===0 ? <div className="text-sm text-gray-400">データなし</div> : (
        <svg width="100%" viewBox={`0 0 ${width} ${height+20}`}>
          {data.map((d, i)=>{
            const h = Math.max(0, (d.value / max) * height)
            const x = gap + i*(barW+gap)
            const y = height - h
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={h} fill="#0ea5e9" />
                <text x={x+barW/2} y={height+14} textAnchor="middle" fontSize="9" fill="#64748b">{short(d.label)}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
