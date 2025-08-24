import React, { useState } from 'react'

const TASK_OPTIONS = [
  { v: '下刈り', unit: 'ha' },
  { v: '間伐', unit: '本' },
  { v: '主伐', unit: 'm³' },
  { v: '造林', unit: '本' },
  { v: '路網整備', unit: 'm' },
  { v: '集材', unit: 'm³' },
  { v: '造材', unit: 'm³' },
  { v: '搬出', unit: 'm³' },
  { v: '調査', unit: 'ha' },
]
const WEATHER = ['晴','曇','雨','雪','その他']
const INCIDENT = ['無','軽微','事故']

const header = [
  'work_date','worker_id','worker_name','team','site_id','stand_id',
  'task_code','work_time_min','output_value','output_unit',
  'machine_id','machine_time_min','weather','ky_check','incident',
  'photo_1','photo_2','photo_3','note'
]

function csvEscape(val: unknown){
  if (val == null) return ''
  const s = String(val)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s
}
function toCSV(rows: any[]){
  const head = header.map(csvEscape).join(',')
  const body = rows.map(r => header.map(k => csvEscape((r as any)[k])).join(',')).join('\n')
  return '\ufeff' + head + '\n' + body // Excel向けにBOM付与
}

export default function App(){
  const [rows, setRows] = useState<any[]>([])
  const [form, setForm] = useState<any>({
    work_date: new Date().toISOString().slice(0,10),
    worker_id: '',
    worker_name: '',
    team: '',
    site_id: '',
    stand_id: '',
    task_code: '間伐',
    work_time_min: 0,
    output_value: 0,
    output_unit: '本',
    machine_id: '',
    machine_time_min: 0,
    weather: '晴',
    ky_check: false,
    incident: '無',
    photo_1: '',
    photo_2: '',
    photo_3: '',
    note: '',
  })

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
    a.href = url
    a.download = `worklog_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const timePresets = [120, 240, 360, 480]

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold">作業日報 入力フォーム</h1>
        <p className="text-gray-600">
          追加→「CSVダウンロード」で出力し、Excel雛形の「日報_raw」に貼り付けます。
        </p>

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
      </div>
    </div>
  )
}
