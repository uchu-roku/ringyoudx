// App.tsx
import React, { useEffect, useMemo, useState } from 'react'

type Row = {
  work_date: string
  worker_id: string
  worker_name: string
  team: string
  site_id: string
  stand_id: string
  task_code: string
  work_time_min: number
  output_value: number
  output_unit: string
  machine_id: string
  machine_time_min: number
  weather: string
  ky_check: boolean
  incident: string
  photo_1: string
  photo_2: string
  photo_3: string
  note: string
}

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

const header = [
  'work_date','worker_id','worker_name','team','site_id','stand_id',
  'task_code','work_time_min','output_value','output_unit',
  'machine_id','machine_time_min','weather','ky_check','incident',
  'photo_1','photo_2','photo_3','note'
]

// ====== CSV UTIL ======
function csvEscape(val: unknown){
  if (val == null) return ''
  const s = String(val)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s
}
function toCSV(rows: Row[]){
  const head = header.map(csvEscape).join(',')
  const body = rows.map(r => header.map(k => csvEscape((r as any)[k])).join(',')).join('\n')
  return '\ufeff' + head + '\n' + body // Excel向けにBOM付与
}
function parseCSV(text: string): string[][] {
  // 小さめのCSV向け：簡易ステートマシン（ダブルクォート対応）
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i=0; i<text.length; i++){
    const c = text[i]
    if (inQuotes){
      if (c === '"'){
        if (text[i+1] === '"'){ field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else {
      if (c === '"'){ inQuotes = true }
      else if (c === ','){ row.push(field); field = '' }
      else if (c === '\n'){ row.push(field); out.push(row); row = []; field = '' }
      else if (c === '\r'){ /* skip */ }
      else { field += c }
    }
  }
  if (field.length || row.length){ row.push(field); out.push(row) }
  return out
}
function toBool(s: string){
  const v = (s || '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'y' || v === 'yes' || v === 'on' || v === 'はい'
}
function toNum(s: string){ const n = Number(s); return isFinite(n) ? n : 0 }

// ====== APP ======
export default function App(){
  const [tab, setTab] = useState<'form'|'dashboard'>('form')
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState<Row>({
    work_date: new Date().toISOString().slice(0,10),
    worker_id: '', worker_name: '', team: '',
    site_id: '', stand_id: '',
    task_code: '間伐', work_time_min: 0,
    output_value: 0, output_unit: '本',
    machine_id: '', machine_time_min: 0,
    weather: '晴', ky_check: false, incident: '無',
    photo_1:'', photo_2:'', photo_3:'', note:''
  })

  // ローカル保存
  useEffect(()=>{
    const saved = localStorage.getItem('worklog_rows_v1')
    if (saved){
      try{ setRows(JSON.parse(saved)) }catch{}
    }
  },[])
  useEffect(()=>{
    localStorage.setItem('worklog_rows_v1', JSON.stringify(rows))
  },[rows])

  function onTaskChange(task: string){
    const t = TASK_OPTIONS.find(x => x.v === task)
    setForm(p => ({...p, task_code: task, output_unit: t ? t.unit : p.output_unit}))
  }
  function addRow(){
    if(!form.work_date || !form.worker_name || !form.task_code){
      alert('作業日・作業員名・作業種別は必須です')
      return
    }
    setRows(prev => [...prev, {...form}])
  }
  function clearForm(){
    setForm(p => ({...p,
      site_id:'', stand_id:'', output_value:0, work_time_min:0,
      machine_id:'', machine_time_min:0, note:'',
      photo_1:'', photo_2:'', photo_3:''
    }))
  }
  function downloadCSV(){
    const blob = new Blob([toCSV(rows)], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `worklog_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }
  async function importCSV(file: File){
    const text = await file.text()
    const table = parseCSV(text)
    if (!table.length) return
    let cols = table[0]
    if (cols[0]?.charCodeAt(0) === 0xFEFF){ cols[0] = cols[0].slice(1) } // BOM
    const idx = header.map(h => cols.indexOf(h))
    const bad = idx.some(i => i < 0)
    if (bad) { alert('ヘッダーが一致しません。まず本アプリのCSV出力を使ってください。'); return }
    const parsed: Row[] = table.slice(1).filter(r => r.length>1).map(r => ({
      work_date: r[idx[0]]||'',
      worker_id: r[idx[1]]||'',
      worker_name: r[idx[2]]||'',
      team: r[idx[3]]||'',
      site_id: r[idx[4]]||'',
      stand_id: r[idx[5]]||'',
      task_code: r[idx[6]]||'',
      work_time_min: toNum(r[idx[7]]),
      output_value: toNum(r[idx[8]]),
      output_unit: r[idx[9]]||'',
      machine_id: r[idx[10]]||'',
      machine_time_min: toNum(r[idx[11]]),
      weather: r[idx[12]]||'',
      ky_check: toBool(r[idx[13]]||''),
      incident: r[idx[14]]||'',
      photo_1: r[idx[15]]||'',
      photo_2: r[idx[16]]||'',
      photo_3: r[idx[17]]||'',
      note: r[idx[18]]||'',
    }))
    setRows(parsed)
    setTab('dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold">林業DX – 作業日報 & 経営ダッシュボード</h1>
          <nav className="flex gap-2">
            <button onClick={()=>setTab('form')}
              className={`px-3 py-1.5 rounded-xl border ${tab==='form'?'bg-black text-white':'bg-white'}`}>入力フォーム</button>
            <button onClick={()=>setTab('dashboard')}
              className={`px-3 py-1.5 rounded-xl border ${tab==='dashboard'?'bg-black text-white':'bg-white'}`}>ダッシュボード</button>
          </nav>
        </header>

        {tab==='form' ? (
          <FormPane
            rows={rows} setRows={setRows}
            form={form} setForm={setForm}
            onTaskChange={onTaskChange}
            addRow={addRow} clearForm={clearForm}
            downloadCSV={downloadCSV}
            importCSV={importCSV}
          />
        ) : (
          <DashboardPane rows={rows} importCSV={importCSV} />
        )}
      </div>
    </div>
  )
}

// ====== 入力フォーム ======
function FormPane(props:{
  rows: Row[], setRows: (fn: any)=>void
  form: Row, setForm: (fn: any)=>void
  onTaskChange: (task: string)=>void
  addRow: ()=>void, clearForm: ()=>void
  downloadCSV: ()=>void
  importCSV: (f: File)=>Promise<void>
}){
  const {rows, form, setForm, onTaskChange, addRow, clearForm, downloadCSV, importCSV} = props
  const timePresets = [120, 240, 360, 480]

  return (
    <>
      <p className="text-gray-600">追加→「CSVダウンロード」で出力（Excel雛形の「日報_raw」に貼り付け可）。ダッシュボードは同一画面のタブで閲覧できます。</p>

      <div className="bg-white rounded-2xl shadow p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">作業日</span>
          <input type="date" className="border rounded-md p-2"
            value={form.work_date} onChange={e=>setForm({...form, work_date:e.target.value})}/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">作業員ID</span>
          <input className="border rounded-md p-2" placeholder="W0123"
            value={form.worker_id} onChange={e=>setForm({...form, worker_id:e.target.value})}/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">作業員名</span>
          <input className="border rounded-md p-2" placeholder="佐藤 太郎"
            value={form.worker_name} onChange={e=>setForm({...form, worker_name:e.target.value})}/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">班</span>
          <input className="border rounded-md p-2" placeholder="A班"
            value={form.team} onChange={e=>setForm({...form, team:e.target.value})}/>
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-sm text-gray-500">現場ID/名称</span>
          <input className="border rounded-md p-2" placeholder="S-24-KAMI"
            value={form.site_id} onChange={e=>setForm({...form, site_id:e.target.value})}/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">林班/小班ID</span>
          <input className="border rounded-md p-2" placeholder="B05-2"
            value={form.stand_id} onChange={e=>setForm({...form, stand_id:e.target.value})}/>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">作業種別</span>
          <select className="border rounded-md p-2" value={form.task_code}
            onChange={e=>onTaskChange(e.target.value)}>
            {TASK_OPTIONS.map(t => <option key={t.v} value={t.v}>{t.v}</option>)}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-sm text-gray-500">作業時間（分）</span>
            <input type="number" className="border rounded-md p-2" min={0} step={10}
              value={form.work_time_min}
              onChange={e=>setForm({...form, work_time_min:Number(e.target.value)})}/>
          </label>
          <div className="flex gap-2">
            {timePresets.map(m => (
              <button key={m} className="px-2 py-1 border rounded-md text-sm"
                onClick={()=>setForm({...form, work_time_min:m})}>{m/60}h</button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-2">
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-sm text-gray-500">成果量</span>
            <input type="number" className="border rounded-md p-2" min={0} step={0.1}
              value={form.output_value}
              onChange={e=>setForm({...form, output_value:Number(e.target.value)})}/>
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
          <span className="text-sm text-gray-500">使用機械ID/名称</span>
          <input className="border rounded-md p-2" placeholder="EXC-01"
            value={form.machine_id} onChange={e=>setForm({...form, machine_id:e.target.value})}/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">機械稼働（分）</span>
          <input type="number" className="border rounded-md p-2" min={0} step={10}
            value={form.machine_time_min}
            onChange={e=>setForm({...form, machine_time_min:Number(e.target.value)})}/>
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
          <span className="text-sm text-gray-500">写真（URL/ID） 最大3つ</span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="border rounded-md p-2" placeholder="photo_1"
              value={form.photo_1} onChange={e=>setForm({...form, photo_1:e.target.value})}/>
            <input className="border rounded-md p-2" placeholder="photo_2"
              value={form.photo_2} onChange={e=>setForm({...form, photo_2:e.target.value})}/>
            <input className="border rounded-md p-2" placeholder="photo_3"
              value={form.photo_3} onChange={e=>setForm({...form, photo_3:e.target.value})}/>
          </div>
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-sm text-gray-500">備考</span>
          <textarea className="border rounded-md p-2" rows={3}
            value={form.note} onChange={e=>setForm({...form, note:e.target.value})}/>
        </label>

        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={addRow}>追加</button>
          <button className="px-4 py-2 rounded-xl border" onClick={clearForm}>クリア</button>
          <button className="px-4 py-2 rounded-xl border" onClick={downloadCSV} disabled={rows.length===0}>
            CSVダウンロード（{rows.length}件）
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-gray-500">CSVインポート</span>
            <input type="file" accept=".csv,text/csv" onChange={e=>e.target.files?.[0] && importCSV(e.target.files[0])}/>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">入力済みデータ（プレビュー）</h2>
          <span className="text-sm text-gray-500">ヘッダー：{header.join(', ')}</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                {header.map(h => <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length===0
                ? <tr><td className="p-2 text-gray-500" colSpan={header.length}>まだデータがありません。上のフォームから追加してください。</td></tr>
                : rows.map((r, idx) => (
                    <tr key={idx} className="border-t">
                      {header.map(h => <td key={h} className="p-2 whitespace-nowrap">{String((r as any)[h] ?? '')}</td>)}
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ====== KPI集計 & ダッシュボード ======
function DashboardPane({rows, importCSV}:{rows: Row[], importCSV:(f:File)=>Promise<void>}){
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
        <label className="ml-auto bg-white border rounded-xl px-3 py-2 text-sm flex items-center gap-2">
          <span className="text-gray-500">CSVインポート</span>
          <input type="file" accept=".csv,text/csv" onChange={e=>e.target.files?.[0] && importCSV(e.target.files[0])}/>
        </label>
      </div>

      {/* KPI Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <KpiCard title="総成果量" value={kpi.totalOutputLabel}/>
        <KpiCard title="労働時間（人時）" value={fmtNum(kpi.workerHours,1)}/>
        <KpiCard title="機械稼働（時間）" value={fmtNum(kpi.machineHours,1)}/>
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
                   data={kpi.dailySeries}
                   maxHeight={120}
        />
        <ChartCard title="現場別 生産性"
                   data={kpi.bySiteSeries}
                   maxHeight={120}
        />
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
                  <td className="p-2 text-right">{fmtNum(s.workerHours,1)}</td>
                  <td className="p-2 text-right">{fmtNum(s.machineHours,1)}</td>
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

function fmtNum(n:number, d=0){ return isFinite(n) ? n.toFixed(d) : '-' }

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
  // 超簡易SVGバー（依存なし）
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
function short(s:string){ return s.length>6 ? s.slice(5) : s }

// ====== 集計ロジック ======
function computeKPI(rows: Row[]){
  const count = rows.length
  const workerHours = rows.reduce((a,r)=>a + (r.work_time_min||0)/60, 0)
  const machineHours = rows.reduce((a,r)=>a + (r.machine_time_min||0)/60, 0)
  const kyCount = rows.reduce((a,r)=>a + (r.ky_check?1:0), 0)
  const incidentLight = rows.reduce((a,r)=>a + (r.incident==='軽微'?1:0), 0)
  const incidentSevere = rows.reduce((a,r)=>a + (r.incident==='事故'?1:0), 0)
  const kyRate = count>0 ? kyCount / count : 0

  // 単位別の成果量
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

  // 日別
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

  // 現場別
  type SiteAgg = {
    key: string
    days: number
    workerHours: number
    machineHours: number
    outByUnit: Map<string,number>
    kyRate: number
    incidentLight: number
    incidentSevere: number
    count: number
  }
  const bySiteMap = new Map<string, SiteAgg>()
  const daySetBySite = new Map<string, Set<string>>()
  for(const r of rows){
    const key = r.site_id || '(未設定)'
    const s = bySiteMap.get(key) || {
      key, days:0, workerHours:0, machineHours:0,
      outByUnit:new Map(), kyRate:0, incidentLight:0, incidentSevere:0, count:0
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

  // 現場別シリーズ（生産性）
  const bySiteSeries = bySite.map(s=>{
    const m = s.productivityLabel.match(/^([\d.]+)/)
    const v = m ? Number(m[1]) : 0
    return {label: s.key, value: v}
  })

  // 人・班・現場
  const workerSet = new Set(rows.map(r=>r.worker_id || r.worker_name).filter(Boolean))
  const teamSet = new Set(rows.map(r=>r.team).filter(Boolean))
  const siteSet = new Set(rows.map(r=>r.site_id).filter(Boolean))

  return {
    count, workerHours, machineHours, kyCount, kyRate,
    incidentLight, incidentSevere,
    totalOutputLabel,
    productivityLabel,
    singleUnit,
    dailySeries,
    bySite,
    bySiteSeries,
    workerCount: workerSet.size,
    teamCount: teamSet.size,
    siteCount: siteSet.size,
  }
}
