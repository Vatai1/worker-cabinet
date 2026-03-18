import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import {
  ArrowLeft, Plus, Trash2, Pencil, Check, X, Loader2,
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as CollapseRight,
  CheckCircle2, Clock, CircleDot, CalendarDays, LayoutGrid, Layers,
} from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const getAuthHeaders = () => {
  const s = localStorage.getItem('auth-storage')
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s) { try { const { state } = JSON.parse(s); if (state?.token) h['Authorization'] = `Bearer ${state.token}` } catch {} }
  return h
}

// ── Types ──────────────────────────────────────────────────────────────────

type ViewMode     = 'months' | 'quarters'
type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed'
type Priority     = 'low' | 'medium' | 'high'

interface RoadmapRow  { id: string; title: string; color: string; order_index: number }
interface RoadmapTask {
  id: string; row_id: string; title: string; description?: string
  start_month: string; end_month: string
  status: 'pending' | 'in_progress' | 'completed'
  color?: string; priority: Priority; is_milestone: boolean
}
interface ProjectInfo { id: string; name: string; start_date?: string; end_date?: string }

// ── Config ─────────────────────────────────────────────────────────────────

const TASK_COLORS = [
  '#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6',
]

const PRIORITY_CFG: Record<Priority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Низкий',  color: '#22c55e', bg: 'bg-green-100 text-green-700' },
  medium: { label: 'Средний', color: '#f59e0b', bg: 'bg-amber-100 text-amber-700' },
  high:   { label: 'Высокий', color: '#ef4444', bg: 'bg-red-100   text-red-700'   },
}

const STATUS_CFG = {
  pending:     { label: 'Ожидает',  Icon: Clock,        dot: 'bg-slate-400' },
  in_progress: { label: 'В работе', Icon: CircleDot,    dot: 'bg-blue-500'  },
  completed:   { label: 'Завершён', Icon: CheckCircle2, dot: 'bg-emerald-500'},
}

const CELL_W = { months: 80, quarters: 200 } as const
const ROW_H        = 64
const HEADER_H     = 44
const MIN_LABEL_W  = 140
const MAX_LABEL_W  = 320
// Approximate px per character in text-sm font
const CHAR_W       = 8

// ── Helpers ────────────────────────────────────────────────────────────────

function mk(y: number, m: number) { return `${y}-${String(m).padStart(2,'0')}` }
function parseMK(k: string) { const [y,m]=k.split('-'); return {year:+y,month:+m} }

function monthParts(key: string) {
  const {year,month}=parseMK(key)
  const d = new Date(year,month-1,1)
  return {
    mon: d.toLocaleDateString('ru-RU',{month:'short'}).replace('.',''),
    yr:  `${year}`,
  }
}

function qk(y: number, q: number) { return `${y}-Q${q}` }
function monthToQ(monthKey: string) { const {year,month}=parseMK(monthKey); return qk(year,Math.ceil(month/3)) }

function genMonths(start: string, end: string): string[] {
  const arr: string[]=[]; let {year,month}=parseMK(start); const e=parseMK(end)
  while (year<e.year||(year===e.year&&month<=e.month)) { arr.push(mk(year,month)); if(++month>12){month=1;year++} }
  return arr
}

function genQuarters(start: string, end: string): string[] {
  const arr: string[]=[]; const {year:sy,month:sm}=parseMK(start); const {year:ey,month:em}=parseMK(end)
  let year=sy,q=Math.ceil(sm/3); const endQ=Math.ceil(em/3)
  while (year<ey||(year===ey&&q<=endQ)) { arr.push(qk(year,q)); if(++q>4){q=1;year++} }
  return arr
}


function taskSpan(task: RoadmapTask, cols: string[], mode: ViewMode): {s:number;e:number}|null {
  if (mode==='months') {
    const s=cols.indexOf(task.start_month), e=cols.indexOf(task.end_month)
    if (s===-1&&e===-1) return null
    return {s:s===-1?0:s, e:e===-1?cols.length-1:e}
  }
  const sq=monthToQ(task.start_month), eq=monthToQ(task.end_month)
  const s=cols.indexOf(sq), e=cols.indexOf(eq)
  if (s===-1&&e===-1) return null
  return {s:s===-1?0:s, e:e===-1?cols.length-1:e}
}

function getTodayX(cols: string[], mode: ViewMode, cw: number): number|null {
  const now=new Date()
  if (mode==='months') {
    const cur=mk(now.getFullYear(),now.getMonth()+1)
    const idx=cols.indexOf(cur); if(idx===-1) return null
    const day=now.getDate(), days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate()
    return idx*cw+(day/days)*cw
  }
  const curQ=monthToQ(mk(now.getFullYear(),now.getMonth()+1))
  const idx=cols.indexOf(curQ); if(idx===-1) return null
  const qMonth=now.getMonth()%3, day=now.getDate()
  const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate()
  return idx*cw+((qMonth+day/days)/3)*cw
}

// ── Task Modal ─────────────────────────────────────────────────────────────

function TaskModal({ rows, cols, mode, task, defaultRowId, defaultStartCol, onSave, onClose }: {
  rows: RoadmapRow[]; cols: string[]; mode: ViewMode
  task?: RoadmapTask; defaultRowId?: string; defaultStartCol?: string
  onSave: (d: Omit<RoadmapTask,'id'>) => void; onClose: () => void
}) {
  const defMonth = defaultStartCol
    ? (mode==='months' ? defaultStartCol : cols.find(c=>monthToQ(c)===defaultStartCol) ?? cols[0])
    : cols[0] ?? ''

  const [title,setTitle]         = useState(task?.title||'')
  const [desc,setDesc]           = useState(task?.description||'')
  const [rowId,setRowId]         = useState(task?.row_id||defaultRowId||(rows[0]?.id??''))
  const [startM,setStartM]       = useState(task?.start_month||defMonth)
  const [endM,setEndM]           = useState(task?.end_month||defMonth)
  const [status,setStatus]       = useState<RoadmapTask['status']>(task?.status||'pending')
  const [color,setColor]         = useState(task?.color||TASK_COLORS[0])
  const [priority,setPriority]   = useState<Priority>(task?.priority||'medium')
  const [isMilestone,setIsMile]  = useState(task?.is_milestone||false)

  const allMonths = mode==='months' ? cols : genMonths(
    /* derive months from quarters */
    (() => { const {year,month:_}=parseMK(cols[0]+''); return mk(year,(Math.ceil(_/1)-1)*3+1) })(),
    (() => { const last=cols[cols.length-1]; const [y,q]=last.split('-Q'); return mk(+y,+q*3) })()
  )

  // For milestone, start = end
  useEffect(() => { if(isMilestone) setEndM(startM) }, [isMilestone, startM])

  const submit=(e:React.FormEvent)=>{
    e.preventDefault()
    if(!title.trim()||!rowId||!startM||!endM) return
    onSave({row_id:rowId,title:title.trim(),description:desc,start_month:startM,end_month:isMilestone?startM:endM,status,color,priority,is_milestone:isMilestone})
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:`${color}22`}}>
              {isMilestone
                ? <span style={{color}} className="text-lg leading-none">◆</span>
                : <Layers className="h-4 w-4" style={{color}}/>}
            </div>
            <h3 className="font-semibold">{task ? 'Редактировать задачу' : 'Новая задача'}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4"/>
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Milestone toggle */}
          <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/50 transition-colors">
            <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${isMilestone?'bg-primary':'bg-muted-foreground/30'}`}
              onClick={()=>setIsMile(!isMilestone)}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isMilestone?'translate-x-4':''}`}/>
            </div>
            <div>
              <div className="text-sm font-medium">Веха (Milestone)</div>
              <div className="text-xs text-muted-foreground">Ключевая точка без длительности</div>
            </div>
          </label>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Название *</label>
            <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Название задачи"
              className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus/>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Описание</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Описание (необязательно)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              rows={2}/>
          </div>

          {/* Row + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Задача *</label>
              <select value={rowId} onChange={e=>setRowId(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                {rows.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Статус</label>
              <select value={status} onChange={e=>setStatus(e.target.value as RoadmapTask['status'])}
                className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="pending">Ожидает</option>
                <option value="in_progress">В работе</option>
                <option value="completed">Завершён</option>
              </select>
            </div>
          </div>

          {/* Period */}
          {!isMilestone ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">С месяца *</label>
                <select value={startM} onChange={e=>{setStartM(e.target.value);if(e.target.value>endM)setEndM(e.target.value)}}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                  {allMonths.map(m=>{const{mon,yr}=monthParts(m);return<option key={m} value={m}>{mon} {yr}</option>})}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">По месяц *</label>
                <select value={endM} onChange={e=>setEndM(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                  {allMonths.filter(m=>m>=startM).map(m=>{const{mon,yr}=monthParts(m);return<option key={m} value={m}>{mon} {yr}</option>})}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Месяц вехи *</label>
              <select value={startM} onChange={e=>setStartM(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                {allMonths.map(m=>{const{mon,yr}=monthParts(m);return<option key={m} value={m}>{mon} {yr}</option>})}
              </select>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Приоритет</label>
            <div className="flex gap-2">
              {(['low','medium','high'] as Priority[]).map(p=>(
                <button type="button" key={p} onClick={()=>setPriority(p)}
                  className={`flex-1 h-8 rounded-lg text-xs font-medium border-2 transition-all ${priority===p?'border-current '+PRIORITY_CFG[p].bg:'border-transparent bg-muted hover:bg-muted/80'}`}
                  style={priority===p?{borderColor:PRIORITY_CFG[p].color}:{}}>
                  {PRIORITY_CFG[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Цвет</label>
            <div className="flex gap-2 flex-wrap">
              {TASK_COLORS.map(c=>(
                <button type="button" key={c} onClick={()=>setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color===c?'scale-125 border-foreground':'border-transparent hover:scale-110'}`}
                  style={{backgroundColor:c}}/>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Отмена</Button>
            <Button type="submit" size="sm" disabled={!title.trim()||(!isMilestone&&startM>endM)}>
              <Check className="h-4 w-4 mr-1"/>
              {task?'Сохранить':'Добавить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Row header ─────────────────────────────────────────────────────────────

function RowHeader({ row, tasks, collapsed, canManage, onToggle, onRename, onDelete }: {
  row: RoadmapRow; tasks: RoadmapTask[]; collapsed: boolean; canManage: boolean
  onToggle: ()=>void; onRename: (id:string,t:string)=>void; onDelete: (id:string)=>void
}) {
  const [editing,setEditing] = useState(false)
  const [val,setVal]         = useState(row.title)
  const inputRef             = useRef<HTMLInputElement>(null)

  useEffect(()=>{ if(editing) inputRef.current?.focus() },[editing])

  const commit=()=>{ if(val.trim()) onRename(row.id,val.trim()); setEditing(false) }

  const done   = tasks.filter(t=>t.status==='completed').length
  const total  = tasks.length
  const pct    = total>0 ? Math.round(done/total*100) : 0

  return (
    <div className="flex items-center gap-2 px-2 h-full group/row-hdr min-w-0">
      {/* Collapse toggle */}
      <button onClick={onToggle} className="p-0.5 rounded hover:bg-muted transition-colors shrink-0">
        {collapsed
          ? <CollapseRight className="h-3.5 w-3.5 text-muted-foreground"/>
          : <ChevronDown   className="h-3.5 w-3.5 text-muted-foreground"/>}
      </button>

      {/* Color dot */}
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:row.color}}/>

      {/* Title */}
      {editing ? (
        <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape'){setVal(row.title);setEditing(false)}}}
          className="flex-1 min-w-0 text-sm bg-transparent border-b border-primary focus:outline-none"/>
      ) : (
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{row.title}</span>
      )}

      {/* Progress badge */}
      {total>0 && !editing && (
        <span className="text-[10px] font-semibold shrink-0 opacity-60">{done}/{total}</span>
      )}

      {/* Actions */}
      {canManage && !editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover/row-hdr:opacity-100 transition-opacity shrink-0">
          <button onClick={()=>setEditing(true)} className="p-1 rounded hover:bg-muted" title="Переименовать">
            <Pencil className="h-3 w-3 text-muted-foreground"/>
          </button>
          <button onClick={()=>onDelete(row.id)} className="p-1 rounded hover:bg-destructive/10" title="Удалить">
            <Trash2 className="h-3 w-3 text-destructive"/>
          </button>
        </div>
      )}

      {/* Mini progress bar at bottom */}
      {total>0 && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{width:`${pct}%`}}/>
        </div>
      )}
    </div>
  )
}

// ── Task bar ───────────────────────────────────────────────────────────────

function TaskBar({ task, span, cw, rowColor, onClick, onDelete, onStatusCycle }: {
  task: RoadmapTask; span:{s:number;e:number}; cw:number; rowColor:string
  onClick:()=>void; onDelete:()=>void; onStatusCycle:()=>void
}) {
  const barColor  = task.color || rowColor
  const pCfg      = PRIORITY_CFG[task.priority||'medium']
  const sCfg      = STATUS_CFG[task.status]
  const isDone    = task.status==='completed'

  if (task.is_milestone) {
    const cx = span.s * cw + cw/2
    return (
      <div style={{position:'absolute',left:cx-12,top:10,width:24,height:24,zIndex:2}}
        title={task.title} onClick={onClick} className="cursor-pointer group/ms">
        <div style={{
          width:24,height:24,transform:'rotate(45deg)',
          backgroundColor:barColor,borderRadius:3,
          boxShadow:`0 2px 8px ${barColor}66`,
          opacity:isDone?0.6:1,
          transition:'transform 0.15s',
        }} className="group-hover/ms:scale-125"/>
        <div className="absolute top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium"
          style={{color:barColor,maxWidth:cw-4,overflow:'hidden',textOverflow:'ellipsis'}}>
          {task.title}
        </div>
      </div>
    )
  }

  const width  = (span.e-span.s+1)*cw - 6
  const left   = span.s*cw + 3
  const StatusIcon = sCfg.Icon

  return (
    <div
      className="absolute flex items-center group/tb cursor-pointer overflow-hidden select-none"
      style={{
        left, top:10, width, height:ROW_H-22,
        borderRadius:8,
        background:`linear-gradient(135deg, ${barColor}ee 0%, ${barColor}bb 100%)`,
        borderLeft:`3px solid ${pCfg.color}`,
        boxShadow:`0 1px 4px ${barColor}44`,
        opacity:isDone?0.7:1,
        zIndex:1,
      }}
      onClick={onClick}
      title={`${task.title}${task.description?'\n'+task.description:''}\n${PRIORITY_CFG[task.priority||'medium'].label} приоритет`}
    >
      {/* Completed overlay */}
      {isDone && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-white/10 text-5xl font-black">✓</div>
        </div>
      )}

      {/* Status icon */}
      <div className="ml-2 shrink-0 opacity-80">
        <StatusIcon className="h-3.5 w-3.5 text-white"/>
      </div>

      {/* Title */}
      <span className="text-white text-xs font-semibold mx-1.5 truncate flex-1">{task.title}</span>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/tb:opacity-100 transition-opacity mr-1 shrink-0">
        <button className="p-1 rounded hover:bg-black/20" onClick={e=>{e.stopPropagation();onStatusCycle()}} title="Сменить статус">
          <CircleDot className="h-3 w-3 text-white"/>
        </button>
        <button className="p-1 rounded hover:bg-black/20" onClick={e=>{e.stopPropagation();onDelete()}} title="Удалить">
          <X className="h-3 w-3 text-white"/>
        </button>
      </div>
    </div>
  )
}

// ── Column header cell ─────────────────────────────────────────────────────

function ColHeader({ label, sub, isCurrent, cw }: { label:string; sub?:string; isCurrent:boolean; cw:number }) {
  return (
    <div className={`shrink-0 flex flex-col items-center justify-center border-r border-border/40 transition-colors
      ${isCurrent?'bg-primary/10 text-primary':'text-muted-foreground'}`}
      style={{width:cw,minWidth:cw,height:HEADER_H}}>
      <span className="text-xs font-semibold leading-tight">{label}</span>
      {sub && <span className="text-[10px] opacity-60 leading-tight">{sub}</span>}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export function ProjectRoadmap() {
  const { id } = useParams<{id:string}>()
  useAuthStore()

  const [project,setProject]   = useState<ProjectInfo|null>(null)
  const [rows,setRows]         = useState<RoadmapRow[]>([])
  const [tasks,setTasks]       = useState<RoadmapTask[]>([])
  const [loading,setLoading]   = useState(true)

  const [viewMode,setViewMode]     = useState<ViewMode>('months')
  const [statusFilter,setFilter]   = useState<StatusFilter>('all')
  const [collapsed,setCollapsed]   = useState<Set<string>>(new Set())
  const [cols,setCols]             = useState<string[]>([])
  const [rangeStart,setRangeStart] = useState('')
  const [rangeEnd,setRangeEnd]     = useState('')

  const [modal,setModal] = useState<{task?:RoadmapTask;defaultRowId?:string;defaultStartCol?:string}|null>(null)
  const [addingRow,setAddingRow]   = useState(false)
  const [newRowTitle,setNewRowTitle] = useState('')

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    if (!id) return; setLoading(true)
    try {
      const [pR,rR,tR] = await Promise.all([
        fetch(`${API_BASE_URL}/projects/${id}`,              {headers:getAuthHeaders()}),
        fetch(`${API_BASE_URL}/projects/${id}/roadmap/rows`, {headers:getAuthHeaders()}),
        fetch(`${API_BASE_URL}/projects/${id}/roadmap/tasks`,{headers:getAuthHeaders()}),
      ])
      const [p,r,t] = await Promise.all([pR.json(),rR.json(),tR.json()])
      setProject(p)
      setRows(Array.isArray(r)?r:[])
      setTasks(Array.isArray(t)?t:[])
      const now = new Date()
      const s = p.start_date?.slice(0,7) || mk(now.getFullYear(),1)
      const e = p.end_date?.slice(0,7)   || mk(now.getFullYear(),12)
      setRangeStart(s); setRangeEnd(e)
    } finally { setLoading(false) }
  }

  useEffect(()=>{ fetchAll() },[id])

  useEffect(()=>{
    if (!rangeStart||!rangeEnd||rangeStart>rangeEnd) return
    setCols(viewMode==='months' ? genMonths(rangeStart,rangeEnd) : genQuarters(rangeStart,rangeEnd))
  },[rangeStart,rangeEnd,viewMode])

  const cw = CELL_W[viewMode]

  // ── Label column width (auto from longest task title) ────────────────────

  const labelW = useMemo(() => {
    const maxLen = rows.reduce((m, r) => Math.max(m, r.title.length), 6)
    return Math.min(MAX_LABEL_W, Math.max(MIN_LABEL_W, maxLen * CHAR_W + 60))
  }, [rows])

  // ── Stats ────────────────────────────────────────────────────────────────

  const totalTasks = tasks.length
  const doneTasks  = tasks.filter(t=>t.status==='completed').length
  const inpTasks   = tasks.filter(t=>t.status==='in_progress').length
  const highPrio   = tasks.filter(t=>t.priority==='high'&&t.status!=='completed').length

  // ── Filtered tasks ───────────────────────────────────────────────────────

  const visibleTasks = statusFilter==='all' ? tasks : tasks.filter(t=>t.status===statusFilter)

  // ── Row ops ──────────────────────────────────────────────────────────────

  const addRow = async () => {
    if (!newRowTitle.trim()||!id) return
    const res = await fetch(`${API_BASE_URL}/projects/${id}/roadmap/rows`,{
      method:'POST',headers:getAuthHeaders(),
      body:JSON.stringify({title:newRowTitle.trim(),color:TASK_COLORS[rows.length%TASK_COLORS.length]}),
    })
    if (res.ok) { const row=await res.json(); setRows(p=>[...p,row]); setNewRowTitle(''); setAddingRow(false) }
  }

  const renameRow = async (rowId:string,title:string) => {
    if (!id) return
    const res = await fetch(`${API_BASE_URL}/projects/${id}/roadmap/rows/${rowId}`,{
      method:'PUT',headers:getAuthHeaders(),body:JSON.stringify({title}),
    })
    if (res.ok) { const u=await res.json(); setRows(p=>p.map(r=>r.id===rowId?u:r)) }
  }

  const deleteRow = async (rowId:string) => {
    if (!id||!confirm('Удалить строку и все её задачи?')) return
    const res = await fetch(`${API_BASE_URL}/projects/${id}/roadmap/rows/${rowId}`,{method:'DELETE',headers:getAuthHeaders()})
    if (res.ok) { setRows(p=>p.filter(r=>r.id!==rowId)); setTasks(p=>p.filter(t=>t.row_id!==rowId)) }
  }

  // ── Task ops ─────────────────────────────────────────────────────────────

  const saveTask = async (data:Omit<RoadmapTask,'id'>) => {
    if (!id) return
    if (modal?.task) {
      const res = await fetch(`${API_BASE_URL}/projects/${id}/roadmap/tasks/${modal.task.id}`,{
        method:'PUT',headers:getAuthHeaders(),body:JSON.stringify(data),
      })
      if (res.ok) { const u=await res.json(); setTasks(p=>p.map(t=>t.id===modal.task!.id?u:t)) }
    } else {
      const res = await fetch(`${API_BASE_URL}/projects/${id}/roadmap/tasks`,{
        method:'POST',headers:getAuthHeaders(),body:JSON.stringify(data),
      })
      if (res.ok) { const task=await res.json(); setTasks(p=>[...p,task]) }
    }
    setModal(null)
  }

  const deleteTask = async (taskId:string) => {
    if (!id||!confirm('Удалить задачу?')) return
    const res = await fetch(`${API_BASE_URL}/projects/${id}/roadmap/tasks/${taskId}`,{method:'DELETE',headers:getAuthHeaders()})
    if (res.ok) setTasks(p=>p.filter(t=>t.id!==taskId))
  }

  const cycleStatus = async (task:RoadmapTask) => {
    const next:{[k:string]:RoadmapTask['status']} = {pending:'in_progress',in_progress:'completed',completed:'pending'}
    const ns = next[task.status]
    const res = await fetch(`${API_BASE_URL}/projects/${id}/roadmap/tasks/${task.id}`,{
      method:'PUT',headers:getAuthHeaders(),body:JSON.stringify({status:ns}),
    })
    if (res.ok) { const u=await res.json(); setTasks(p=>p.map(t=>t.id===task.id?u:t)) }
  }

  // ── Range ────────────────────────────────────────────────────────────────

  const shiftMonth=(key:string,d:number)=>{
    let {year,month}=parseMK(key); month+=d
    while(month>12){month-=12;year++} while(month<1){month+=12;year--}
    return mk(year,month)
  }

  const shift=(n:number)=>{
    const step = viewMode==='months' ? 3 : 12
    setRangeStart(prev=>prev?shiftMonth(prev,n*step):prev)
    setRangeEnd(prev=>prev?shiftMonth(prev,n*step):prev)
  }

  const todayX = getTodayX(cols,viewMode,cw)

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-primary"/>
    </div>
  )

  const totalW = labelW + cols.length * cw

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to={`/projects/${id}`}>
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4"/>К проекту
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{project?.name} — Дорожная карта</h1>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {totalTasks > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {label:'Всего задач',  val:totalTasks, color:'text-foreground',      bg:'bg-muted/50'},
            {label:'Завершено',    val:doneTasks,  color:'text-emerald-600',      bg:'bg-emerald-50 dark:bg-emerald-950/30'},
            {label:'В работе',     val:inpTasks,   color:'text-blue-600',         bg:'bg-blue-50 dark:bg-blue-950/30'},
            {label:'Высокий приор.',val:highPrio,  color:'text-red-600',          bg:'bg-red-50 dark:bg-red-950/30'},
          ].map(({label,val,color,bg})=>(
            <div key={label} className={`${bg} rounded-xl p-3 flex items-center gap-3`}>
              <span className={`text-2xl font-bold ${color}`}>{val}</span>
              <span className="text-xs text-muted-foreground leading-tight">{label}</span>
            </div>
          ))}
        </div>
      )}
      {totalTasks > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{width:`${totalTasks>0?Math.round(doneTasks/totalTasks*100):0}%`}}/>
          </div>
          <span className="text-xs text-muted-foreground font-medium w-10 text-right">
            {totalTasks>0?Math.round(doneTasks/totalTasks*100):0}%
          </span>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View mode */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button onClick={()=>setViewMode('months')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
              ${viewMode==='months'?'bg-primary text-white':'hover:bg-muted'}`}>
            <CalendarDays className="h-3.5 w-3.5"/>Месяцы
          </button>
          <button onClick={()=>setViewMode('quarters')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border
              ${viewMode==='quarters'?'bg-primary text-white':'hover:bg-muted'}`}>
            <LayoutGrid className="h-3.5 w-3.5"/>Кварталы
          </button>
        </div>

        {/* Period */}
        <input type="month" value={rangeStart} onChange={e=>setRangeStart(e.target.value)}
          className="h-8 px-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"/>
        <span className="text-muted-foreground text-sm">—</span>
        <input type="month" value={rangeEnd} min={rangeStart} onChange={e=>setRangeEnd(e.target.value)}
          className="h-8 px-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"/>
        <button onClick={()=>shift(-1)} className="p-1.5 rounded-lg border border-input hover:bg-muted" title="Назад">
          <ChevronLeft className="h-4 w-4"/>
        </button>
        <button onClick={()=>shift(1)}  className="p-1.5 rounded-lg border border-input hover:bg-muted" title="Вперёд">
          <ChevronRight className="h-4 w-4"/>
        </button>

        {/* Status filter */}
        <div className="flex rounded-lg border border-border overflow-hidden ml-auto">
          {(['all','pending','in_progress','completed'] as StatusFilter[]).map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l first:border-0 border-border
                ${statusFilter===f?'bg-primary text-white':'hover:bg-muted'}`}>
              {f==='all'?'Все':STATUS_CFG[f as keyof typeof STATUS_CFG].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Gantt table ── */}
      <div className="rounded-xl border border-border bg-card overflow-auto shadow-sm">
        <div style={{minWidth:totalW}}>

          {/* Column headers */}
          <div className="flex border-b border-border sticky top-0 bg-card z-20" style={{height:HEADER_H}}>
            <div className="shrink-0 flex items-center px-3 text-xs font-semibold text-muted-foreground border-r border-border"
              style={{width:labelW,minWidth:labelW}}>
              Задача
            </div>
            {cols.map(c=>{
              const isCur = viewMode==='months'
                ? c===mk(new Date().getFullYear(),new Date().getMonth()+1)
                : c===monthToQ(mk(new Date().getFullYear(),new Date().getMonth()+1))
              if (viewMode==='months') {
                const {mon,yr}=monthParts(c)
                return <ColHeader key={c} label={mon} sub={yr} isCurrent={isCur} cw={cw}/>
              }
              const [y,q]=c.split('-Q')
              return <ColHeader key={c} label={`Q${q}`} sub={`'${String(y).slice(2)}`} isCurrent={isCur} cw={cw}/>
            })}
          </div>

          {/* Rows */}
          {rows.length===0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground flex-col gap-3">
              <Layers className="h-12 w-12 opacity-20"/>
              <p>Добавьте первую строку, чтобы начать</p>
            </div>
          ) : rows.map(row=>{
            const rowTasks = visibleTasks.filter(t=>t.row_id===row.id)
            const isCollapsed = collapsed.has(row.id)

            return (
              <div key={row.id}>
                {/* Row header strip */}
                <div className={`flex border-b transition-colors
                  ${isCollapsed?'border-border/30 bg-muted/20':'border-border/50'}`}
                  style={{minHeight:ROW_H}}>

                  {/* Label */}
                  <div className="shrink-0 border-r border-border relative"
                    style={{width:labelW,minWidth:labelW,minHeight:ROW_H}}>
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{backgroundColor:row.color}}/>
                    <RowHeader row={row} tasks={tasks.filter(t=>t.row_id===row.id)}
                      collapsed={isCollapsed} canManage={true}
                      onToggle={()=>setCollapsed(s=>{ const n=new Set(s); n.has(row.id)?n.delete(row.id):n.add(row.id); return n })}
                      onRename={renameRow} onDelete={deleteRow}/>
                  </div>

                  {/* Grid cells + tasks */}
                  {!isCollapsed && (
                    <div className="relative flex-1 flex" style={{height:ROW_H}}>
                      {/* Today line */}
                      {todayX!==null && (
                        <div className="absolute top-0 bottom-0 w-0.5 bg-orange-400/70 z-10 pointer-events-none"
                          style={{left:todayX}}/>
                      )}

                      {/* Grid */}
                      {cols.map(c=>{
                        const isCur = viewMode==='months'
                          ? c===mk(new Date().getFullYear(),new Date().getMonth()+1)
                          : c===monthToQ(mk(new Date().getFullYear(),new Date().getMonth()+1))
                        return (
                          <div key={c}
                            className={`shrink-0 border-r border-border/25 cursor-pointer hover:bg-primary/5 transition-colors ${isCur?'bg-primary/5':''}`}
                            style={{width:cw,minWidth:cw,height:ROW_H}}
                            onClick={()=>setModal({defaultRowId:row.id,defaultStartCol:c})}
                            title={`Добавить задачу`}/>
                        )
                      })}

                      {/* Task bars */}
                      {rowTasks.map(task=>{
                        const sp=taskSpan(task,cols,viewMode)
                        if (!sp) return null
                        return (
                          <TaskBar key={task.id} task={task} span={sp} cw={cw} rowColor={row.color}
                            onClick={()=>setModal({task})}
                            onDelete={()=>deleteTask(task.id)}
                            onStatusCycle={()=>cycleStatus(task)}/>
                        )
                      })}
                    </div>
                  )}

                  {/* Collapsed: show compact task pills */}
                  {isCollapsed && (
                    <div className="flex-1 flex items-center px-3 gap-2 flex-wrap py-2">
                      {rowTasks.slice(0,8).map(t=>(
                        <span key={t.id} onClick={()=>setModal({task:t})}
                          className="text-xs px-2 py-0.5 rounded-full text-white cursor-pointer hover:opacity-80"
                          style={{backgroundColor:t.color||row.color}}>
                          {t.is_milestone?'◆ ':''}{t.title}
                        </span>
                      ))}
                      {rowTasks.length>8 && <span className="text-xs text-muted-foreground">+{rowTasks.length-8}</span>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Add row */}
          <div className="flex border-t border-border/50">
            <div className="px-3 py-2" style={{width:labelW,minWidth:labelW}}>
              {addingRow ? (
                <div className="flex items-center gap-1">
                  <input type="text" value={newRowTitle} onChange={e=>setNewRowTitle(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')addRow();if(e.key==='Escape'){setAddingRow(false);setNewRowTitle('')}}}
                    placeholder="Название строки"
                    className="flex-1 min-w-0 h-7 px-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus/>
                  <button onClick={addRow} className="p-1 rounded hover:bg-muted text-primary"><Check className="h-3.5 w-3.5"/></button>
                  <button onClick={()=>{setAddingRow(false);setNewRowTitle('')}} className="p-1 rounded hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground"/></button>
                </div>
              ) : (
                <button onClick={()=>setAddingRow(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="h-3.5 w-3.5"/>Добавить строку
                </button>
              )}
            </div>
            <div className="flex-1"/>
          </div>
        </div>
      </div>

      {/* ── Legend / hints ── */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-500"/>{STATUS_CFG.completed.label}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-500"/>{STATUS_CFG.in_progress.label}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-slate-400"/>{STATUS_CFG.pending.label}</span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-3.5 rounded-sm" style={{backgroundColor:PRIORITY_CFG.high.color}}/>Высокий</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-3.5 rounded-sm" style={{backgroundColor:PRIORITY_CFG.medium.color}}/>Средний</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-3.5 rounded-sm" style={{backgroundColor:PRIORITY_CFG.low.color}}/>Низкий</span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1"><span style={{color:'#f97316'}}>◆</span>Веха</span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1"><span className="w-0.5 h-4 inline-block bg-orange-400 rounded"/>Сегодня</span>
        {todayX===null && <span className="text-orange-500">сегодня вне диапазона</span>}
      </div>

      {/* ── Modal ── */}
      {modal!==null && (
        <TaskModal rows={rows} cols={cols} mode={viewMode}
          task={modal.task} defaultRowId={modal.defaultRowId} defaultStartCol={modal.defaultStartCol}
          onSave={saveTask} onClose={()=>setModal(null)}/>
      )}
    </div>
  )
}
