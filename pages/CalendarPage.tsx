import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Link2, Unlink } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { vacationApi } from '@/services/vacationApi'
import { getAuthHeaders } from '@/lib/authHeaders'
import { getErrorMessage, cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { VacationRequestStatus, VACATION_TYPES } from '@/types'
import type { VacationRequest } from '@/types'

interface OutlookEvent {
  id: string
  subject: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  isAllDay: boolean
  location?: { displayName?: string }
  organizer?: { emailAddress?: { name?: string } }
  categories?: string[]
}

type ViewMode = 'month' | 'week' | 'day'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const WD = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const WD_FULL = ['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье']
const HH = 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function fk(d: Date) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
}
function pd(s: string): Date { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d) }
function getMonday(d: Date): Date {
  const dt=new Date(d); const g=dt.getDay(); dt.setDate(dt.getDate()+(g===0?-6:1-g)); dt.setHours(0,0,0,0); return dt
}
function weekOf(d: Date): Date[] {
  const m=getMonday(d); return Array.from({length:7},(_,i)=>{const x=new Date(m);x.setDate(m.getDate()+i);return x})
}
function sameDay(a:Date,b:Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate() }
function toMins(iso:string) { const d=new Date(iso); return d.getHours()*60+d.getMinutes() }

const RED = '#FF3B30'
const BLUE = '#007AFF'
const GREEN = '#34C759'
const PURPLE = '#AF52DE'
const AMBER = '#FF9F0A'

const TX = 'var(--cal-tx)'
const TX2 = 'var(--cal-tx2)'
const TX3 = 'var(--cal-tx3)'
const BD = 'var(--cal-bd)'
const BL = 'var(--cal-bl)'
const WE_BG = 'var(--cal-cell)'
const EMPTY_BG = 'var(--cal-cell)'
const DASH = 'var(--cal-bl)'

export function CalendarPage() {
  const user = useAuthStore(s => s.user)
  const now = new Date()
  const [view, setView] = useState<ViewMode>('week')
  const [focus, setFocus] = useState(new Date())
  const [miniMonth, setMiniMonth] = useState(new Date())
  const [vacations, setVacations] = useState<VacationRequest[]>([])
  const [outlookEvents, setOutlookEvents] = useState<OutlookEvent[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outlookConnected, setOutlookConnected] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedDate, setSelectedDate] = useState(fk(now))
  const [syncing, setSyncing] = useState(false)
  const [showVac, setShowVac] = useState(true)
  const [showPend, setShowPend] = useState(true)
  const [showOL, setShowOL] = useState(true)
  const [slideDir, setSlideDir] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeVac = useMemo(() => vacations.filter(v => v.status===VacationRequestStatus.APPROVED||v.status===VacationRequestStatus.ON_APPROVAL), [vacations])

  const vacByDate = useMemo(() => {
    const m: Record<string,VacationRequest[]> = {}
    for (const v of activeVac) {
      const s=pd(v.startDate), e=pd(v.endDate)
      for (let d=new Date(s); d<=e; d.setDate(d.getDate()+1)) {
        const k=fk(d); if(!m[k]) m[k]=[]; if(!m[k].some(x=>x.id===v.id)) m[k].push(v)
      }
    }
    return m
  }, [activeVac])

  const olByDate = useMemo(() => {
    const m: Record<string,OutlookEvent[]> = {}
    for (const ev of outlookEvents) {
      const k=ev.isAllDay?ev.start.dateTime.split('T')[0]:fk(new Date(ev.start.dateTime))
      if(!m[k]) m[k]=[]; m[k].push(ev)
    }
    return m
  }, [outlookEvents])

  const olTimed = useMemo(() => {
    const m: Record<string,OutlookEvent[]> = {}
    for (const ev of outlookEvents) { if(ev.isAllDay) continue; const k=fk(new Date(ev.start.dateTime)); if(!m[k]) m[k]=[]; m[k].push(ev) }
    return m
  }, [outlookEvents])

  const fetchVac = useCallback(async () => { if(!user) return; try { setVacations(await vacationApi.getUserRequests(user.id)) } catch(e:unknown) { setError(getErrorMessage(e)) } }, [user])
  const fetchOLStatus = useCallback(async () => { try { const r=await fetch(API_BASE_URL+'/calendar/status',{headers:getAuthHeaders()}); if(r.ok) setOutlookConnected((await r.json()).connected) } catch{} }, [])
  const fetchOLEvents = useCallback(async () => {
    if(!outlookConnected) return
    try {
      const rs=view==='month'?new Date(focus.getFullYear(),focus.getMonth(),1):getMonday(focus)
      const re=view==='month'?new Date(focus.getFullYear(),focus.getMonth()+1,0):(()=>{const d=new Date(rs);d.setDate(d.getDate()+6);return d})()
      const r=await fetch(API_BASE_URL+'/calendar/events?start='+encodeURIComponent(rs.toISOString())+'&end='+encodeURIComponent(re.toISOString()),{headers:getAuthHeaders()})
      if(r.ok) setOutlookEvents(await r.json())
    } catch{}
  }, [focus,view,outlookConnected])

  useEffect(()=>{ setLoading(true); Promise.all([fetchVac(),fetchOLStatus()]).finally(()=>setLoading(false)) },[fetchVac,fetchOLStatus])
  useEffect(()=>{ if(outlookConnected) fetchOLEvents() },[outlookConnected,fetchOLEvents])
  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=7*HH-8 },[view,focus])

  const connectOL = async () => { try { const r=await fetch(API_BASE_URL+'/calendar/auth/url',{headers:getAuthHeaders()}); if(!r.ok) throw new Error('Ошибка'); window.location.href=(await r.json()).url } catch(e:unknown){setError(getErrorMessage(e))} }
  const disconnectOL = async () => { try { await fetch(API_BASE_URL+'/calendar/disconnect',{method:'DELETE',headers:getAuthHeaders()}); setOutlookConnected(false); setOutlookEvents([]) } catch{} }
  const doSync = async () => { setSyncing(true); await Promise.all([fetchVac(),fetchOLEvents()]); setSyncing(false) }

  const nav = (dir: -1|1) => {
    setSlideDir(dir); setAnimKey(k=>k+1)
    const d=new Date(focus)
    if(view==='day') d.setDate(d.getDate()+dir)
    else if(view==='week') d.setDate(d.getDate()+7*dir)
    else d.setMonth(d.getMonth()+dir)
    setFocus(d); setSelectedDate(fk(d))
  }
  const goToday = () => { setSlideDir(0); setAnimKey(k=>k+1); setFocus(new Date()); setMiniMonth(new Date()); setSelectedDate(fk(new Date())) }

  const weekDays = useMemo(()=>weekOf(focus),[focus])
  const todayKey = fk(now)
  const nowTop = (now.getHours()+now.getMinutes()/60)*HH

  const title = view==='month'
    ? MONTHS[focus.getMonth()]+' '+focus.getFullYear()
    : view==='week'
      ? (()=>{
          const s=weekDays[0],e=weekDays[6]
          if(s.getMonth()===e.getMonth()) return s.getDate()+' — '+e.getDate()+' '+MONTHS_GEN[s.getMonth()]+' '+s.getFullYear()
          if(s.getFullYear()===e.getFullYear()) return s.getDate()+' '+MONTHS_GEN[s.getMonth()]+' — '+e.getDate()+' '+MONTHS_GEN[e.getMonth()]+' '+s.getFullYear()
          return s.getDate()+' '+MONTHS_GEN[s.getMonth()]+' '+s.getFullYear()+' — '+e.getDate()+' '+MONTHS_GEN[e.getMonth()]+' '+e.getFullYear()
        })()
      : focus.getDate()+' '+MONTHS_GEN[focus.getMonth()]+' '+focus.getFullYear()+', '+WD_FULL[(focus.getDay()+6)%7]

  const items = (dk:string) => [
    ...(showVac ? (vacByDate[dk]||[]).filter(v=>v.status===VacationRequestStatus.APPROVED).map(v=>({key:v.id,label:VACATION_TYPES[v.vacationType]?.name?.split(' ').slice(0,2).join(' ')||'Отпуск',bg:GREEN})) : []),
    ...(showPend ? (vacByDate[dk]||[]).filter(v=>v.status===VacationRequestStatus.ON_APPROVAL).map(v=>({key:v.id,label:VACATION_TYPES[v.vacationType]?.name?.split(' ').slice(0,2).join(' ')||'Отпуск',bg:AMBER})) : []),
    ...(showOL ? (olByDate[dk]||[]).filter(e=>e.isAllDay).map(ev=>({key:ev.id,label:ev.subject,bg:BLUE})) : []),
  ]

  const timed = (dk:string) => showOL ? (olTimed[dk]||[]) : []

  const animName = slideDir===0?'calFade':slideDir>0?'calSlideL':'calSlideR'

  const mini = () => {
    const y=miniMonth.getFullYear(), m=miniMonth.getMonth(), dim=new Date(y,m+1,0).getDate()
    const fd=(new Date(y,m,1).getDay()+6)%7
    const prevDim=new Date(y,m,0).getDate()
    return (
      <div style={{padding:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <button onClick={()=>setMiniMonth(new Date(y,m-1,1))} className="cmn"><ChevronLeft size={14}/></button>
          <span style={{fontSize:13,fontWeight:700,color:TX,letterSpacing:'-0.01em'}}>{MONTHS[m]} {y}</span>
          <button onClick={()=>setMiniMonth(new Date(y,m+1,1))} className="cmn"><ChevronRight size={14}/></button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
          {WD.map(d=><div key={d} style={{textAlign:'center',fontSize:10,fontWeight:600,color:TX2,letterSpacing:'0.04em',paddingBottom:6}}>{d}</div>)}
          {Array.from({length:fd}).map((_,i)=><button key={'p'+i} className="cmc" style={{color:TX3,opacity:0.3}}>{prevDim-fd+i+1}</button>)}
          {Array.from({length:dim},(_,i)=>i+1).map(day=>{
            const dk=y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')
            const isT=dk===todayKey, isS=dk===selectedDate
            const has=(vacByDate[dk]?.length||0)+(olByDate[dk]?.length||0)>0
            return (
              <button key={day} onClick={()=>{setFocus(new Date(y,m,day));setSelectedDate(dk)}} className="cmc"
                style={isT&&!isS?{background:RED,color:'#fff',fontWeight:700}:isS?{boxShadow:'0 0 0 2px '+BLUE,fontWeight:600,color:TX}:has?{fontWeight:600,color:TX}:{color:TX2}}>
                {day}
                {has&&!isT&&!isS&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:'50%',background:BLUE}}/>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const sidebar = () => {
    if(!sidebarOpen) return null
    return (
      <div className="cs">
        {mini()}
        <div className="css">
          <div className="csl">КАЛЕНДАРИ</div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {[
              {on:showVac,set:()=>setShowVac(!showVac),col:GREEN,lbl:'Отпуска'},
              {on:showPend,set:()=>setShowPend(!showPend),col:PURPLE,lbl:'На согласовании'},
              ...(outlookConnected?[{on:showOL,set:()=>setShowOL(!showOL),col:BLUE,lbl:'Outlook'}]:[]),
            ].map(t=>(
              <div key={t.lbl} className="ctr" onClick={t.set}>
                <div className="ctt" style={{background:t.on?t.col:TX3}}>
                  <div className="cth" style={{transform:t.on?'translateX(14px)':'translateX(0)'}}/>
                </div>
                <div style={{width:8,height:8,borderRadius:2,background:t.col,flexShrink:0}}/>
                <span style={{fontSize:12,color:TX}}>{t.lbl}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="css">
          <div className="csl">OUTLOOK</div>
          {outlookConnected ? (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:GREEN}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:GREEN,display:'inline-block'}}/> Синхронизировано
              </div>
              <button onClick={doSync} className="cob">Синхронизировать сейчас</button>
              <button onClick={disconnectOL} className="cob cob2"><Unlink size={12}/> Отключить</button>
            </div>
          ) : (
            <button onClick={connectOL} className="coc"><Link2 size={14}/> Подключить</button>
          )}
        </div>
      </div>
    )
  }

  const monthView = () => {
    const y=focus.getFullYear(), m=focus.getMonth(), dim=new Date(y,m+1,0).getDate()
    const fd=(new Date(y,m,1).getDay()+6)%7
    const cells: (number|null)[] = []
    for(let i=0;i<fd;i++) cells.push(null)
    for(let d=1;d<=dim;d++) cells.push(d)
    return (
      <div className="cm ca" key={animKey} style={{animationName:animName}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
          {WD.map(d=><div key={d} style={{padding:'10px 0',textAlign:'center',fontSize:11,fontWeight:600,color:TX2,letterSpacing:'0.06em',borderBottom:'1px solid '+BD}}>{d.toUpperCase()}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
          {cells.map((day,idx)=>{
            if(day===null) return <div key={'e'+idx} style={{minHeight:100,borderBottom:'1px solid '+BL,borderRight:'1px solid '+BL,background:EMPTY_BG}}/>
            const dk=y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')
            const isT=dk===todayKey, isS=dk===selectedDate, we=idx%7>=5
            const it=items(dk)
            return (
              <div key={dk} onClick={()=>{setFocus(new Date(y,m,day));setSelectedDate(dk);setView('day')}} className="cmc2" style={{background:we?WE_BG:undefined}}>
                <div style={{display:'flex',justifyContent:'center',marginBottom:4}}>
                  <span style={{fontSize:14,fontWeight:isT?700:500,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:isT?RED:'transparent',color:isT?'#fff':isS?BLUE:TX,boxShadow:isS&&!isT?'0 0 0 2px '+BLUE:'none'}}>{day}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:1}}>
                  {it.slice(0,3).map(i=><div key={i.key} className="cp" style={{background:i.bg}}>{i.label}</div>)}
                  {it.length>3&&<div style={{fontSize:10,color:TX2,paddingLeft:4}}>+{it.length-3}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const timedGrid = (days: Date[]) => {
    const multi=days.length>1, hasT=days.some(d=>sameDay(d,now))
    return (
      <div className="cm ct ca" key={animKey} style={{animationName:animName}}>
        <div style={{flexShrink:0,borderBottom:'1px solid '+BD}}>
          <div style={{display:'flex'}}>
            <div style={{width:52,flexShrink:0}}/>
            {days.map(day=>{
              const dk=fk(day), isT=dk===todayKey, dow=(day.getDay()+6)%7, we=dow>=5
              return (
                <div key={dk} style={{flex:1,textAlign:'center',padding:'8px 0',borderLeft:'1px solid '+BL,background:we?WE_BG:undefined}}>
                  {multi&&<div style={{fontSize:10,fontWeight:600,color:TX2,letterSpacing:'0.04em'}}>{WD[dow]}</div>}
                  <div style={{display:'flex',justifyContent:'center'}}>
                    <span style={{fontSize:14,fontWeight:isT?700:500,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:isT?RED:'transparent',color:isT?'#fff':TX}}>{day.getDate()}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{display:'flex',borderTop:'1px solid '+BL}}>
            <div style={{width:52,flexShrink:0}}/>
            {days.map(day=>{
              const dk=fk(day), dow=(day.getDay()+6)%7, we=dow>=5, it=items(dk)
              return (
                <div key={dk} style={{flex:1,borderLeft:'1px solid '+BL,padding:'2px 4px 4px',display:'flex',flexDirection:'column',gap:1,background:we?WE_BG:undefined}}>
                  {it.slice(0,3).map(i=><div key={i.key} className="cp" style={{background:i.bg}}>{i.label}</div>)}
                  {it.length>3&&<div style={{fontSize:9,color:TX2}}>+{it.length-3}</div>}
                </div>
              )
            })}
          </div>
        </div>
        <div ref={scrollRef} style={{flex:1,overflowY:'auto'}}>
          <div style={{display:'flex',position:'relative',height:24*HH}}>
            <div style={{width:52,flexShrink:0,position:'relative'}}>
              {HOURS.map(h=><div key={h} style={{position:'absolute',right:10,fontSize:10,color:TX2,marginTop:-7,top:h*HH}}>{h===0?'':String(h).padStart(2,'0')+':00'}</div>)}
            </div>
            {days.map(day=>{
              const dk=fk(day), dow=(day.getDay()+6)%7, we=dow>=5
              const te=timed(dk), isT=sameDay(day,now)
              return (
                <div key={dk} style={{flex:1,position:'relative',borderLeft:'1px solid '+BL,background:we?WE_BG:undefined}}>
                  {HOURS.map(h=><div key={h} style={{position:'absolute',left:0,right:0,borderTop:'1px solid '+BL,top:h*HH}}/>)}
                  {HOURS.map(h=><div key={'h'+h} style={{position:'absolute',left:0,right:0,borderTop:'1px dashed '+DASH,top:h*HH+HH/2}}/>)}
                  {te.map(ev=>{
                    const sm=toMins(ev.start.dateTime), em=toMins(ev.end.dateTime)
                    const top=(sm/60)*HH, height=Math.max(((em-sm)/60)*HH,22)
                    return (
                      <div key={ev.id} className="cte" style={{top,height,background:BLUE}}>
                        <div style={{fontSize:11,fontWeight:500,lineHeight:'16px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ev.subject}</div>
                        {height>30&&<div style={{fontSize:9,opacity:0.7,marginTop:2}}>
                          {new Date(ev.start.dateTime).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} — {new Date(ev.end.dateTime).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
                        </div>}
                      </div>
                    )
                  })}
                  {isT&&hasT&&(
                    <div style={{position:'absolute',left:0,right:0,top:nowTop,zIndex:20,pointerEvents:'none'}}>
                      <div style={{display:'flex',alignItems:'center'}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:RED,marginLeft:-3.5,flexShrink:0}}/>
                        <div style={{height:1.5,flex:1,background:RED}}/>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cr">
      <style>{CSS}</style>
      <div className="ch">
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="cib">
            <ChevronDown size={14} style={{color:TX2,transition:'transform 0.2s',transform:sidebarOpen?'rotate(180deg)':'rotate(0)'}}/>
          </button>
          <button onClick={()=>nav(-1)} className="cib"><ChevronLeft size={18}/></button>
          <button onClick={goToday} className="ctb">Сегодня</button>
          <button onClick={()=>nav(1)} className="cib"><ChevronRight size={18}/></button>
          <h1 className="cti">{title}</h1>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className="cts">
            {(['month','week','day'] as ViewMode[]).map(m=>(
              <button key={m} onClick={()=>{setView(m);setAnimKey(k=>k+1);setSlideDir(0)}}
                className={cn('cta',view===m&&'ctaa')}>
                {m==='month'?'Месяц':m==='week'?'Неделя':'День'}
              </button>
            ))}
          </div>
          <button onClick={doSync} className="cib" disabled={syncing}>
            <RefreshCw size={15} className={cn(syncing&&'cspin')}/>
          </button>
        </div>
      </div>
      {error&&<div style={{margin:'8px 16px',padding:'8px 12px',borderRadius:8,border:'1px solid rgba(255,59,48,0.3)',background:'rgba(255,59,48,0.08)',fontSize:12,color:RED}}>{error}</div>}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {sidebar()}
        {view==='month'&&monthView()}
        {view==='week'&&timedGrid(weekDays)}
        {view==='day'&&timedGrid([focus])}
      </div>
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
:root{
  --cal-bg:#F5F5F7;--cal-surface:#FFFFFF;--cal-surface-h:#F0F0F2;
  --cal-tx:#1D1D1F;--cal-tx2:#6E6E73;--cal-tx3:#AEAEB2;
  --cal-bd:rgba(0,0,0,0.08);--cal-bl:rgba(0,0,0,0.05);
  --cal-hover:rgba(0,0,0,0.03);--cal-cell:rgba(0,0,0,0.02);
  --cal-toggled-thumb:#fff;--cal-pill-shadow:rgba(0,0,0,0.1);
}
.dark{
  --cal-bg:#0A0A0F;--cal-surface:#14141A;--cal-surface-h:#1C1C24;
  --cal-tx:#F5F5F7;--cal-tx2:#6E6E73;--cal-tx3:#48484A;
  --cal-bd:rgba(255,255,255,0.06);--cal-bl:rgba(255,255,255,0.04);
  --cal-hover:rgba(255,255,255,0.04);--cal-cell:rgba(255,255,255,0.015);
  --cal-toggled-thumb:#fff;--cal-pill-shadow:rgba(0,0,0,0.3);
}
.cr{display:flex;flex-direction:column;height:calc(100vh - 80px);background:var(--cal-bg);color:var(--cal-tx);font-family:'Inter',system-ui,sans-serif;animation:cfi .3s ease-out}
.ch{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--cal-bd);flex-shrink:0}
.cib{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:var(--cal-tx2);cursor:pointer;transition:all .15s}
.cib:hover{background:var(--cal-surface-h);color:var(--cal-tx)}
.cib:disabled{opacity:.4;cursor:default}
.ctb{font-size:12px;font-weight:500;color:var(--cal-tx2);background:none;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;transition:all .15s}
.ctb:hover{background:var(--cal-surface-h);color:var(--cal-tx)}
.cti{font-size:18px;font-weight:700;letter-spacing:-.02em;margin-left:8px;color:var(--cal-tx)}
.cts{display:flex;background:var(--cal-surface);border-radius:8px;padding:2px;border:1px solid var(--cal-bd)}
.cta{font-size:11px;font-weight:500;padding:5px 14px;border-radius:6px;border:none;background:transparent;color:var(--cal-tx2);cursor:pointer;transition:all .2s}
.cta:hover{color:var(--cal-tx)}
.ctaa{background:var(--cal-surface-h);color:var(--cal-tx);font-weight:600}
.cs{width:260px;flex-shrink:0;border-right:1px solid var(--cal-bd);background:var(--cal-surface);overflow-y:auto}
.css{padding:12px 16px;border-top:1px solid var(--cal-bd)}
.csl{font-size:11px;font-weight:600;color:var(--cal-tx2);letter-spacing:.05em;margin-bottom:8px}
.cmn{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:var(--cal-tx2);cursor:pointer;transition:all .15s}
.cmn:hover{background:var(--cal-surface-h);color:var(--cal-tx)}
.cmc{position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:50%;border:none;background:transparent;cursor:pointer;margin:1px auto;transition:all .15s}
.cmc:hover{background:var(--cal-hover)}
.ctr{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:6px;cursor:pointer;transition:background .15s;user-select:none}
.ctr:hover{background:var(--cal-hover)}
.ctt{width:30px;height:16px;border-radius:8px;position:relative;transition:background .25s;flex-shrink:0}
.cth{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--cal-toggled-thumb);transition:transform .25s cubic-bezier(.4,0,.2,1)}
.cob{font-size:11px;color:var(--cal-tx2);background:none;border:1px solid var(--cal-bd);padding:5px 10px;border-radius:6px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:4px;width:fit-content}
.cob:hover{background:var(--cal-surface-h);color:var(--cal-tx);border-color:var(--cal-bd)}
.cob2{color:var(--cal-tx3);border-color:transparent}
.cob2:hover{color:#FF3B30}
.coc{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:#007AFF;background:none;border:none;cursor:pointer;padding:8px 0;transition:all .2s}
.coc:hover{text-shadow:0 0 20px rgba(0,122,255,0.25)}
.cm{flex:1;overflow:auto}
.ct{display:flex;flex-direction:column;overflow:hidden}
.cmc2{min-height:100px;border-bottom:1px solid var(--cal-bl);border-right:1px solid var(--cal-bl);padding:6px;cursor:pointer;transition:background .15s}
.cmc2:hover{background:var(--cal-hover)}
.cp{font-size:11px;line-height:16px;padding:0 6px;border-radius:4px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:transform .15s;box-shadow:0 1px 2px var(--cal-pill-shadow)}
.cp:hover{transform:scale(1.02)}
.cte{position:absolute;left:3px;right:3px;border-radius:6px;padding:4px 8px;overflow:hidden;z-index:10;color:#fff;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 2px 8px var(--cal-pill-shadow)}
.cte:hover{transform:scale(1.02);box-shadow:0 4px 12px var(--cal-pill-shadow)}
.cspin{animation:csp .8s linear infinite}
.ca{animation-duration:.25s;animation-timing-function:ease-out;animation-fill-mode:both}
@keyframes cfi{from{opacity:0}to{opacity:1}}
@keyframes calFade{from{opacity:0}to{opacity:1}}
@keyframes calSlideL{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
@keyframes calSlideR{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:translateX(0)}}
@keyframes csp{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@media(max-width:1024px){.cs{display:none}}
`
