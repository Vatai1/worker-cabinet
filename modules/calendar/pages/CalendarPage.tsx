import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Link2, Unlink, X, MapPin, Clock, User, Tag, Users, Globe, Lock, Eye, ExternalLink, Calendar, AlertCircle, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { VacationRequestStatus, VACATION_TYPES } from '@/shared/types'
import type { VacationRequest } from '@/shared/types'

interface OutlookEvent {
  id: string
  _changeKey?: string
  subject: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  isAllDay: boolean
  location?: { displayName?: string; address?: string }
  organizer?: { emailAddress?: { name?: string; address?: string } }
  categories?: string[]
  body?: { content?: string; contentType?: string }
  bodyPreview?: string
  attendees?: Array<{ emailAddress?: { name?: string; address?: string }; type?: string; status?: { response?: string } }>
  webLink?: string
  sensitivity?: string
  importance?: string
  responseStatus?: { response?: string }
  recurrence?: { pattern?: { type?: string; daysOfWeek?: string; interval?: number; month?: number; dayOfMonth?: number; firstDayOfWeek?: string }; range?: { type?: string; startDate?: string; endDate?: string; numberOfOccurrences?: number } }
  source?: 'graph' | 'ews'
  createdDateTime?: string
  lastModifiedDateTime?: string
  isCancelled?: boolean
  isOrganizer?: boolean
  onlineMeetingUrl?: string
  onlineMeeting?: { joinUrl?: string; conferenceId?: string; tollNumber?: string; quickDial?: string; phones?: Array<{ number?: string; type?: string }> }
  reminderMinutesBeforeStart?: number
  isReminderOn?: boolean
  responseRequested?: boolean
  showAs?: string
  type?: string
  hasAttachments?: boolean
  attachments?: Array<{ name?: string; size?: number; contentType?: string; isInline?: boolean }>
  iCalUId?: string
  seriesMasterId?: string
  transactionId?: string
  calendar?: { name?: string }
  isMeeting?: boolean
  duration?: string
  meetingRequestWasSent?: boolean
  allowNewTimeProposal?: boolean
  isResponseRequested?: boolean
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
  const [ewsConnected, setEwsConnected] = useState(false)
  const [showEwsModal, setShowEwsModal] = useState(false)
  const [ewsForm, setEwsForm] = useState({ url: '', username: '', password: '', domain: '' })
  const [ewsError, setEwsError] = useState<string | null>(null)
  const [ewsSaving, setEwsSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedDate, setSelectedDate] = useState(fk(now))
  const [syncing, setSyncing] = useState(false)
  const [showVac, setShowVac] = useState(true)
  const [showPend, setShowPend] = useState(true)
  const [showOL, setShowOL] = useState(true)
  const [slideDir, setSlideDir] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{x:number,y:number,event:OutlookEvent|{key:string,label:string,bg:string,vacation?:VacationRequest}}|null>(null)
  const [detailEvent, setDetailEvent] = useState<{type:'event'|'vacation',data:any}|null>(null)
  const [ewsBodyLoading, setEwsBodyLoading] = useState(false)
  const [showMeta, setShowMeta] = useState(false)

  useEffect(() => {
    if (!detailEvent || detailEvent.type !== 'event') return
    const ev = detailEvent.data as OutlookEvent
    if (ev.source !== 'ews' || !ev.id) return
    if (ev.body?.content) return
    setEwsBodyLoading(true)
    fetch(API_BASE_URL + '/calendar/ews/event-body/' + encodeURIComponent(ev.id) + (ev._changeKey ? '?ck=' + encodeURIComponent(ev._changeKey) : ''), { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : ({} as Record<string, unknown>))
      .then((data: Record<string, unknown>) => {
        if (data.body || data.attendees) {
          setDetailEvent(prev => prev ? { ...prev, data: { ...prev.data, body: data.body || prev.data.body, attendees: data.attendees || prev.data.attendees } } : null)
        }
      })
      .catch(() => {})
      .finally(() => setEwsBodyLoading(false))
  }, [detailEvent?.type, (detailEvent?.data as OutlookEvent | undefined)?.id, (detailEvent?.data as OutlookEvent | undefined)?.source])

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
  const fetchOLStatus = useCallback(async () => {
    try {
      const r = await fetch(API_BASE_URL+'/calendar/status',{headers:getAuthHeaders()})
      if(r.ok) {
        const data = await r.json()
        setOutlookConnected(data.graphConnected || false)
        setEwsConnected(data.ewsConnected || false)
        if(data.ewsConfig) setEwsForm(f=>({...f, url:data.ewsConfig.url, username:data.ewsConfig.username, domain:data.ewsConfig.domain||''}))
      }
    } catch{}
  }, [])
  const fetchOLEvents = useCallback(async () => {
    if(!outlookConnected && !ewsConnected) return
    try {
      const rs=view==='month'?new Date(focus.getFullYear(),focus.getMonth(),1):getMonday(focus)
      const re=view==='month'?new Date(focus.getFullYear(),focus.getMonth()+1,0):(()=>{const d=new Date(rs);d.setDate(d.getDate()+6);return d})()
      const r=await fetch(API_BASE_URL+'/calendar/events?start='+encodeURIComponent(rs.toISOString())+'&end='+encodeURIComponent(re.toISOString()),{headers:getAuthHeaders()})
      if(r.ok) setOutlookEvents(await r.json())
    } catch{}
  }, [focus,view,outlookConnected,ewsConnected])

  useEffect(()=>{ setLoading(true); Promise.all([fetchVac(),fetchOLStatus()]).finally(()=>setLoading(false)) },[fetchVac,fetchOLStatus])
  useEffect(()=>{ if(outlookConnected||ewsConnected) fetchOLEvents() },[outlookConnected,ewsConnected,fetchOLEvents])
  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=7*HH-8 },[view,focus])

  const connectOL = async () => { try { const r=await fetch(API_BASE_URL+'/calendar/auth/url',{headers:getAuthHeaders()}); if(!r.ok) throw new Error('Ошибка'); window.location.href=(await r.json()).url } catch(e:unknown){setError(getErrorMessage(e))} }
  const disconnectOL = async () => { try { await fetch(API_BASE_URL+'/calendar/disconnect',{method:'DELETE',headers:getAuthHeaders()}); setOutlookConnected(false); setOutlookEvents([]) } catch{} }
  const doSync = async () => { setSyncing(true); await Promise.all([fetchVac(),fetchOLEvents()]); setSyncing(false) }

  const connectEws = async () => {
    setEwsSaving(true); setEwsError(null)
    try {
      const r = await fetch(API_BASE_URL+'/calendar/ews/connect',{
        method:'POST',
        headers:{...getAuthHeaders(),'Content-Type':'application/json'},
        body:JSON.stringify(ewsForm),
      })
      const data = await r.json()
      if(!r.ok) throw new Error(data.error||'Ошибка подключения')
      setEwsConnected(true); setShowEwsModal(false)
      fetchOLEvents()
    } catch(e:unknown){setEwsError(getErrorMessage(e))}
    finally{setEwsSaving(false)}
  }

  const disconnectEws = async () => {
    try { await fetch(API_BASE_URL+'/calendar/ews/disconnect',{method:'DELETE',headers:getAuthHeaders()}); setEwsConnected(false); setEwsForm({url:'',username:'',password:'',domain:''}) } catch{}
  }

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
    ...(showVac ? (vacByDate[dk]||[]).filter(v=>v.status===VacationRequestStatus.APPROVED).map(v=>({key:v.id,label:VACATION_TYPES[v.vacationType]?.name?.split(' ').slice(0,2).join(' ')||'Отпуск',bg:GREEN,vacation:v})) : []),
    ...(showPend ? (vacByDate[dk]||[]).filter(v=>v.status===VacationRequestStatus.ON_APPROVAL).map(v=>({key:v.id,label:VACATION_TYPES[v.vacationType]?.name?.split(' ').slice(0,2).join(' ')||'Отпуск',bg:AMBER,vacation:v})) : []),
    ...(showOL ? (olByDate[dk]||[]).filter(e=>e.isAllDay).map(ev=>({key:ev.id,label:ev.subject,bg:BLUE})) : []),
  ]

  const timed = (dk:string) => showOL ? (olTimed[dk]||[]) : []

  const animName = slideDir===0?'calFade':slideDir>0?'calSlideL':'calSlideR'

  useEffect(()=>{
    if(!ctxMenu) return
    const close=(e:MouseEvent)=>{if(!(e.target as HTMLElement)?.closest?.('.cctx'))setCtxMenu(null)}
    const closeKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setCtxMenu(null)}
    document.addEventListener('click',close)
    document.addEventListener('keydown',closeKey)
    return ()=>{document.removeEventListener('click',close);document.removeEventListener('keydown',closeKey)}
  },[ctxMenu])

  const fmtEvTime = (iso:string) => {
    try { return new Date(iso).toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}) } catch { return iso }
  }
  const fmtEvDate = (iso:string) => {
    try { return new Date(iso).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}) } catch { return iso }
  }

  const mini = () => {
    const y=miniMonth.getFullYear(), m=miniMonth.getMonth(), dim=new Date(y,m+1,0).getDate()
    const fd=(new Date(y,m,1).getDay()+6)%7
    const prevDim=new Date(y,m,0).getDate()
    return (
      <div style={{padding:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <button onClick={()=>setMiniMonth(new Date(y,m-1,1))} className="cmn"><ChevronLeft size={14}/></button>
          <span style={{fontSize:13,fontWeight:700,color:TX,letterSpacing:'-0.01em'}}>{MONTHS[m]} {y}</span>
          <button onClick={()=>setMiniMonth(new Date(y,m+1,1))} className="cmn"><ChevronRight size={14}/></button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
          {WD.map(d=><div key={d} style={{textAlign:'center',fontSize:10,fontWeight:600,color:TX2,letterSpacing:'0.04em',paddingBottom:8}}>{d}</div>)}
          {Array.from({length:fd}).map((_,i)=><button key={'p'+i} className="cmc" style={{color:TX3,opacity:0.3}}>{prevDim-fd+i+1}</button>)}
          {Array.from({length:dim},(_,i)=>i+1).map(day=>{
            const dk=y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')
            const isT=dk===todayKey, isS=dk===selectedDate
            const has=(vacByDate[dk]?.length||0)+(olByDate[dk]?.length||0)>0
            return (
              <button key={day} onClick={()=>{setFocus(new Date(y,m,day));setSelectedDate(dk)}} className="cmc"
                style={isT&&!isS?{boxShadow:'0 0 0 2px '+RED,color:RED,fontWeight:600}:isS?{background:'hsl(var(--primary) / 0.12)',fontWeight:600,color:'hsl(var(--primary))'}:has?{fontWeight:600,color:TX}:{color:TX2}}>
                {day}
                {has&&!isT&&!isS&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:'50%',background:BLUE}}/>}
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
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {[
              {on:showVac,set:()=>setShowVac(!showVac),col:GREEN,lbl:'Отпуска'},
              {on:showPend,set:()=>setShowPend(!showPend),col:PURPLE,lbl:'На согласовании'},
              ...(outlookConnected||ewsConnected?[{on:showOL,set:()=>setShowOL(!showOL),col:BLUE,lbl:ewsConnected?'Exchange':'Outlook'}]:[]),
            ].map(t=>(
              <div key={t.lbl} className="ctr" onClick={t.set}>
                <div className="ctt" style={{background:t.on?t.col:TX3}}>
                  <div className="cth" style={{transform:t.on?'translateX(16px)':'translateX(0)'}}/>
                </div>
                <div style={{width:10,height:10,borderRadius:3,background:t.col,flexShrink:0}}/>
                <span style={{fontSize:13,color:TX}}>{t.lbl}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="css">
          <div className="csl">ИНТЕГРАЦИЯ</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:600,color:TX}}>Exchange (EWS)</div>
            {ewsConnected ? (
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:GREEN}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:GREEN,display:'inline-block'}}/> {ewsForm.username}
                </div>
                <button onClick={disconnectEws} className="cob cob2"><Unlink size={12}/> Отключить</button>
              </div>
            ) : (
              <button onClick={()=>setShowEwsModal(true)} className="coc"><Link2 size={14}/> Подключить</button>
            )}
          </div>
          <div style={{fontSize:12,fontWeight:600,color:TX,marginBottom:6}}>Outlook Online</div>
          {outlookConnected ? (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:GREEN}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:GREEN,display:'inline-block'}}/> Синхронизировано
              </div>
              <button onClick={doSync} className="cob">Синхронизировать</button>
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
                  <span style={{fontSize:14,fontWeight:isT?700:500,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:isT?RED:'transparent',color:isT?'#fff':isS?'hsl(var(--primary))':TX,boxShadow:isS&&!isT?'0 0 0 2px hsl(var(--primary))':'none'}}>{day}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:1}}>
                  {it.slice(0,3).map(i=><div key={i.key} className="cp" style={{background:i.bg}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,event:i})}}>{i.label}</div>)}
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
                  {it.slice(0,3).map(i=><div key={i.key} className="cp" style={{background:i.bg}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,event:i})}}>{i.label}</div>)}
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
                      <div key={ev.id} className="cte" style={{top,height,background:BLUE}} onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,event:ev})}}>
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
      <div className="relative overflow-hidden gradient-primary text-white animate-slide-up rounded-2xl" style={{flexShrink:0,padding:'20px 24px',minHeight:0}}>
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-card/5 rounded-full" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-card/5 rounded-full" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-card/3 rounded-full blur-2xl" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-white/60" />
              <span className="text-white/40 text-[10px] font-medium uppercase tracking-wider">Расписание</span>
            </div>
            <h1 className="text-lg font-extrabold tracking-tight">Календарь</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {(olByDate[todayKey]?.length || 0) > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                <Calendar className="h-3 w-3 text-white/50" />
                {olByDate[todayKey]?.length} сегодня
              </div>
            )}
            {activeVac.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                {activeVac.length} отпуск{activeVac.length === 1 ? '' : activeVac.length < 5 ? 'а' : 'ов'}
              </div>
            )}
            {(outlookConnected || ewsConnected) && (
              <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />
                {ewsConnected ? 'Exchange' : 'Outlook'}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="ch">
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="cib">
            <ChevronDown size={14} style={{color:TX2,transition:'transform 0.2s',transform:sidebarOpen?'rotate(180deg)':'rotate(0)'}}/>
          </button>
          <button onClick={()=>nav(-1)} className="cib"><ChevronLeft size={18}/></button>
          <button onClick={goToday} className="ctb">Сегодня</button>
          <button onClick={()=>nav(1)} className="cib"><ChevronRight size={18}/></button>
          <h1 className="cti">{title}</h1>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
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

      {showEwsModal && (
        <div style={{position:'fixed',inset:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={()=>setShowEwsModal(false)}>
          <div style={{width:420,maxWidth:'90vw',background:'var(--cal-surface)',borderRadius:12,border:'1px solid var(--cal-bd)',padding:24,boxShadow:'0 8px 32px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:16,fontWeight:700,color:TX,marginBottom:4}}>Подключение Exchange</h2>
            <p style={{fontSize:12,color:TX2,marginBottom:16}}>Введите данные вашего корпоративного аккаунта Exchange</p>

            {ewsError && <div style={{marginBottom:12,padding:'8px 10px',borderRadius:6,background:'rgba(255,59,48,0.08)',border:'1px solid rgba(255,59,48,0.2)',fontSize:12,color:RED}}>{ewsError}</div>}

            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:TX2,display:'block',marginBottom:3}}>URL Exchange</label>
                <input value={ewsForm.url} onChange={e=>setEwsForm(f=>({...f,url:e.target.value}))} placeholder="https://mail.company.com/EWS/Exchange.asmx" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid var(--cal-bd)',background:'var(--cal-bg)',color:TX,fontSize:12,outline:'none'}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:TX2,display:'block',marginBottom:3}}>Логин</label>
                <input value={ewsForm.username} onChange={e=>setEwsForm(f=>({...f,username:e.target.value}))} placeholder="ivanov@company.com" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid var(--cal-bd)',background:'var(--cal-bg)',color:TX,fontSize:12,outline:'none'}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:TX2,display:'block',marginBottom:3}}>Пароль</label>
                <input type="password" value={ewsForm.password} onChange={e=>setEwsForm(f=>({...f,password:e.target.value}))} placeholder="••••••••" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid var(--cal-bd)',background:'var(--cal-bg)',color:TX,fontSize:12,outline:'none'}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:TX2,display:'block',marginBottom:3}}>Домен (необязательно)</label>
                <input value={ewsForm.domain} onChange={e=>setEwsForm(f=>({...f,domain:e.target.value}))} placeholder="COMPANY" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid var(--cal-bd)',background:'var(--cal-bg)',color:TX,fontSize:12,outline:'none'}}/>
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20}}>
              <button onClick={()=>setShowEwsModal(false)} style={{padding:'7px 16px',borderRadius:6,border:'1px solid var(--cal-bd)',background:'transparent',color:TX2,fontSize:12,cursor:'pointer'}}>Отмена</button>
              <button onClick={connectEws} disabled={ewsSaving} style={{padding:'7px 16px',borderRadius:6,border:'none',background:'hsl(var(--primary))',color:'hsl(var(--primary-foreground))',fontSize:12,fontWeight:600,cursor:'pointer',opacity:ewsSaving?0.6:1}}>
                {ewsSaving?'Подключение...':'Подключить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ctxMenu && (
        <div className="cctx" style={{position:'fixed',top:ctxMenu.y,left:ctxMenu.x,zIndex:200,minWidth:160}} onClick={e=>e.stopPropagation()}>
          <div style={{background:'var(--cal-surface)',border:'1px solid var(--cal-bd)',borderRadius:8,padding:4,boxShadow:'0 8px 32px rgba(0,0,0,0.25)'}}>
            <button onClick={()=>{const e=ctxMenu.event;if('subject' in e) setDetailEvent({type:'event',data:e});else if(e.vacation) setDetailEvent({type:'vacation',data:e.vacation});setCtxMenu(null)}} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'7px 10px',borderRadius:5,border:'none',background:'transparent',color:TX,fontSize:12,cursor:'pointer',textAlign:'left'}}>
              <Clock size={13} style={{color:TX2}}/> Подробнее
            </button>
          </div>
        </div>
      )}

      {detailEvent && (
        <div style={{position:'fixed',inset:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}} onClick={()=>setDetailEvent(null)}>
          <div style={{width:620,maxWidth:'94vw',background:'var(--cal-surface)',borderRadius:16,border:'1px solid var(--cal-bd)',boxShadow:'0 24px 80px rgba(0,0,0,0.4)',maxHeight:'88vh',overflow:'hidden',display:'flex',flexDirection:'column',animation:'cfi .2s ease-out'}} onClick={e=>e.stopPropagation()}>

            {detailEvent.type==='event' && (() => {
              const ev=detailEvent.data as OutlookEvent
              const catColor = ev.categories?.length ? BLUE : ev.source==='ews' ? PURPLE : BLUE
              const rsvpMap: Record<string,string> = { none:'Не отвечено', organized:'Организатор', tentativelyAccepted:'Предварительно', accepted:'Принято', declined:'Отклонено', notResponded:'Не отвечено' }
              const sensMap: Record<string,{lbl:string,icon:typeof Lock}> = { Normal:{lbl:'Обычное',icon:Eye}, Private:{lbl:'Личное',icon:Lock}, Confidential:{lbl:'Конфиденциальное',icon:AlertCircle} }
              const impMap: Record<string,string> = { Low:'Низкая', Normal:'Обычная', High:'Высокая' }
              const showAsMap: Record<string,{lbl:string;color:string}> = { Free:{lbl:'Свободен',color:GREEN}, Tentative:{lbl:'Под вопросом',color:AMBER}, Busy:{lbl:'Занят',color:RED}, OOF:{lbl:'Отсутствую',color:PURPLE}, WorkingElsewhere:{lbl:'Работаю в другом месте',color:BLUE}, Unknown:{lbl:'Неизвестно',color:TX3} }
              const typeMap: Record<string,string> = { SingleInstance:'Разовое', Occurrence:'Повторение', Exception:'Исключение', SeriesMaster:'Основная серия' }
              const sens = ev.sensitivity ? sensMap[ev.sensitivity] : undefined
              const SensIcon = sens ? sens.icon : Eye
              const showAsInfo = ev.showAs ? showAsMap[ev.showAs] : undefined
              const onlineUrl = ev.onlineMeeting?.joinUrl || ev.onlineMeetingUrl
              const reqAttendees = ev.attendees?.filter(a=>a.type==='required') || []
              const optAttendees = ev.attendees?.filter(a=>a.type==='optional') || []
              const resAttendees = ev.attendees?.filter(a=>a.type==='resource') || []
              const hasHtmlBody = ev.body?.contentType === 'HTML' && ev.body.content
              const cleanHtml = (() => {
                if (!hasHtmlBody) return ''
                const raw = ev.body!.content || ''
                const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
                const inner = bodyMatch ? bodyMatch[1] : raw.replace(/<head[\s\S]*?<\/head>/gi, '').replace(/<\/?html[^>]*>/gi, '')
                return inner.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<o:p>/g, '').replace(/<\/o:p>/g, '').replace(/<!\-\-[\s\S]*?\-\->/g, '').replace(/xmlns[^=]*="[^"]*"/gi, '').trim()
              })()
              const plainBody = (() => {
                if (!ev.body?.content) return ''
                if (ev.body.contentType === 'HTML') return ''
                return ev.body.content.trim()
              })()
              const fmtIso = (iso:string) => { try { return new Date(iso).toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}) } catch { return iso } }

              return (
                <>
                  <div style={{height:4,borderRadius:'16px 16px 0 0',background:ev.isCancelled?'#AEAEB2':catColor,flexShrink:0}} />
                  <div style={{padding:'20px 24px 0',flexShrink:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6,flexWrap:'wrap'}}>
                          {ev.source && (
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:ev.source==='ews'?'rgba(175,82,222,0.15)':'rgba(0,122,255,0.15)',color:ev.source==='ews'?PURPLE:BLUE,letterSpacing:'0.03em'}}>
                              {ev.source==='ews'?'EXCHANGE':'OUTLOOK'}
                            </span>
                          )}
                          {ev.isCancelled && (
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:'rgba(174,174,178,0.15)',color:'#AEAEB2'}}>ОТМЕНЕНО</span>
                          )}
                          {ev.importance && ev.importance!=='Normal' && (
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:ev.importance==='High'?'rgba(255,59,48,0.15)':'rgba(110,110,115,0.15)',color:ev.importance==='High'?RED:TX2}}>
                              {impMap[ev.importance]||ev.importance}
                            </span>
                          )}
                          {sens && ev.sensitivity!=='Normal' && (
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:'rgba(110,110,115,0.1)',color:TX2,display:'flex',alignItems:'center',gap:3}}>
                              <SensIcon size={10} /> {sens.lbl}
                            </span>
                          )}
                          {ev.isAllDay && (
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:'rgba(0,122,255,0.12)',color:BLUE}}>ВЕСЬ ДЕНЬ</span>
                          )}
                          {ev.type && ev.type!=='SingleInstance' && (
                            <span style={{fontSize:10,fontWeight:500,padding:'2px 7px',borderRadius:4,background:'rgba(175,82,222,0.1)',color:PURPLE}}>{typeMap[ev.type]||ev.type}</span>
                          )}
                          {ev.isMeeting && (
                            <span style={{fontSize:10,fontWeight:500,padding:'2px 7px',borderRadius:4,background:'rgba(0,122,255,0.08)',color:BLUE}}>Собрание</span>
                          )}
                        </div>
                        <h2 style={{fontSize:18,fontWeight:700,color:TX,letterSpacing:'-0.02em',lineHeight:1.3}}>{ev.subject}</h2>
                      </div>
                      <button onClick={()=>setDetailEvent(null)} style={{background:'transparent',border:'none',cursor:'pointer',color:TX2,padding:4,marginLeft:12,flexShrink:0}}><X size={18}/></button>
                    </div>
                  </div>

                  <div style={{padding:'16px 24px 20px',overflowY:'auto',flex:1}}>
                    <div style={{display:'flex',flexDirection:'column',gap:16}}>

                      <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                        <Clock size={16} style={{color:TX2,flexShrink:0,marginTop:1}}/>
                        <div style={{fontSize:13,color:TX,lineHeight:1.5}}>
                          {ev.isAllDay
                            ? fmtEvDate(ev.start.dateTime)+' — '+fmtEvDate(ev.end.dateTime)
                            : <>{fmtEvTime(ev.start.dateTime)}<br/>{fmtEvTime(ev.end.dateTime)}</>}
                          {(ev.start.timeZone || ev.end.timeZone) && ev.start.timeZone !== 'UTC' && (
                            <span style={{display:'flex',alignItems:'center',gap:4,marginTop:2,fontSize:11,color:TX2}}><Globe size={11}/>{ev.start.timeZone}</span>
                          )}
                          {ev.duration && <span style={{display:'block',fontSize:11,color:TX2,marginTop:2}}>Длительность: {ev.duration}</span>}
                        </div>
                      </div>

                      {ev.location?.displayName && (
                        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <MapPin size={16} style={{color:TX2,flexShrink:0,marginTop:1}}/>
                          <div style={{fontSize:13,color:TX}}>
                            {ev.location.displayName}
                            {ev.location.address && <span style={{display:'block',fontSize:11,color:TX2,marginTop:2}}>{ev.location.address}</span>}
                          </div>
                        </div>
                      )}

                      {onlineUrl && (
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <Link2 size={16} style={{color:TX2,flexShrink:0}}/>
                          <a href={onlineUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:'hsl(var(--primary))',textDecoration:'none',wordBreak:'break-all'}}>{onlineUrl}</a>
                        </div>
                      )}

                      {ev.organizer?.emailAddress && (
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <User size={16} style={{color:TX2,flexShrink:0}}/>
                          <div style={{fontSize:13,color:TX}}>
                            {ev.organizer.emailAddress.name || ev.organizer.emailAddress.address}
                            {ev.organizer.emailAddress.address && ev.organizer.emailAddress.name && (
                              <span style={{display:'block',fontSize:11,color:TX2}}>{ev.organizer.emailAddress.address}</span>
                            )}
                            {ev.isOrganizer && <span style={{display:'block',fontSize:10,color:TX3,marginTop:1}}>Вы организатор</span>}
                          </div>
                        </div>
                      )}

                      {ev.responseStatus?.response && ev.responseStatus.response !== 'none' && ev.responseStatus.response !== 'organized' && (
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span style={{fontSize:12,fontWeight:600,padding:'3px 8px',borderRadius:4,background:ev.responseStatus.response==='accepted'?'rgba(52,199,89,0.12)':ev.responseStatus.response==='declined'?'rgba(255,59,48,0.12)':'rgba(255,159,10,0.12)',color:ev.responseStatus.response==='accepted'?GREEN:ev.responseStatus.response==='declined'?RED:AMBER}}>
                            Ваш ответ: {rsvpMap[ev.responseStatus.response]||ev.responseStatus.response}
                          </span>
                        </div>
                      )}

                      {reqAttendees.length > 0 && (
                        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <Users size={16} style={{color:TX2,flexShrink:0,marginTop:1}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:600,color:TX2,marginBottom:4,letterSpacing:'0.04em'}}>ОБЯЗАТЕЛЬНЫЕ УЧАСТНИКИ ({reqAttendees.length})</div>
                            <div style={{display:'flex',flexDirection:'column',gap:3}}>
                              {reqAttendees.map((a,i) => {
                                const resp = a.status?.response
                                const respColor = resp==='accepted'?GREEN:resp==='declined'?RED:resp==='tentativelyAccepted'?AMBER:TX3
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 8px',borderRadius:6,background:'var(--cal-bg)'}}>
                                    <span style={{fontSize:12,color:TX,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.emailAddress?.name || a.emailAddress?.address}</span>
                                    {resp && resp!=='none' && <span style={{fontSize:10,fontWeight:600,color:respColor,marginLeft:8,flexShrink:0}}>{rsvpMap[resp]||resp}</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {optAttendees.length > 0 && (
                        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <Users size={16} style={{color:TX3,flexShrink:0,marginTop:1}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:600,color:TX3,marginBottom:4,letterSpacing:'0.04em'}}>ДОПОЛНИТЕЛЬНЫЕ УЧАСТНИКИ ({optAttendees.length})</div>
                            <div style={{display:'flex',flexDirection:'column',gap:3}}>
                              {optAttendees.map((a,i) => {
                                const resp = a.status?.response
                                const respColor = resp==='accepted'?GREEN:resp==='declined'?RED:resp==='tentativelyAccepted'?AMBER:TX3
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 8px',borderRadius:6,background:'var(--cal-bg)'}}>
                                    <span style={{fontSize:12,color:TX,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.emailAddress?.name || a.emailAddress?.address}</span>
                                    {resp && resp!=='none' && <span style={{fontSize:10,fontWeight:600,color:respColor,marginLeft:8,flexShrink:0}}>{rsvpMap[resp]||resp}</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {resAttendees.length > 0 && (
                        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <MapPin size={16} style={{color:TX3,flexShrink:0,marginTop:1}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:600,color:TX3,marginBottom:4,letterSpacing:'0.04em'}}>РЕСУРСЫ ({resAttendees.length})</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                              {resAttendees.map((a,i) => (
                                <span key={i} style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'var(--cal-bg)',color:TX}}>{a.emailAddress?.name || a.emailAddress?.address}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {ev.categories && ev.categories.length > 0 && (
                        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <Tag size={16} style={{color:TX2,flexShrink:0,marginTop:1}}/>
                          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                            {ev.categories.map((c,i) => (
                              <span key={i} style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(0,122,255,0.12)',color:BLUE,fontWeight:500}}>{c}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {ewsBodyLoading && (
                        <div style={{borderTop:'1px solid var(--cal-bd)',paddingTop:14,textAlign:'center'}}>
                          <span style={{fontSize:12,color:TX2}}>⏳ Загрузка описания...</span>
                        </div>
                      )}

                      {(hasHtmlBody || plainBody) && (
                        <div style={{borderTop:'1px solid var(--cal-bd)',paddingTop:14}}>
                          <div style={{fontSize:11,fontWeight:600,color:TX2,marginBottom:8,letterSpacing:'0.04em'}}>ОПИСАНИЕ</div>
                          <div style={{fontSize:13,color:TX,lineHeight:1.6,wordBreak:'break-word',maxHeight:240,overflowY:'auto',padding:'10px 12px',borderRadius:8,background:'var(--cal-bg)'}}>
                            {hasHtmlBody ? (
                              <div dangerouslySetInnerHTML={{__html: cleanHtml || ''}} style={{lineHeight:1.6}}/>
                            ) : (
                              <div style={{whiteSpace:'pre-wrap'}}>{plainBody}</div>
                            )}
                          </div>
                        </div>
                      )}

                      {ev.onlineMeeting && (
                        <div style={{borderTop:'1px solid var(--cal-bd)',paddingTop:14}}>
                          <div style={{fontSize:11,fontWeight:600,color:TX2,marginBottom:8,letterSpacing:'0.04em'}}>ОНЛАЙН-СОБРАНИЕ</div>
                          <div style={{display:'flex',flexDirection:'column',gap:6,padding:'10px 12px',borderRadius:8,background:'var(--cal-bg)'}}>
                            {ev.onlineMeeting.joinUrl && (
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <Link2 size={13} style={{color:TX2,flexShrink:0}}/>
                                <a href={ev.onlineMeeting.joinUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'hsl(var(--primary))',textDecoration:'none',wordBreak:'break-all'}}>Присоединиться</a>
                              </div>
                            )}
                            {ev.onlineMeeting.conferenceId && (
                              <div style={{fontSize:12,color:TX}}>ID конференции: <span style={{color:TX2,fontFamily:'monospace'}}>{ev.onlineMeeting.conferenceId}</span></div>
                            )}
                            {ev.onlineMeeting.tollNumber && (
                              <div style={{fontSize:12,color:TX}}>Телефон: <span style={{color:TX2,fontFamily:'monospace'}}>{ev.onlineMeeting.tollNumber}</span></div>
                            )}
                            {ev.onlineMeeting.quickDial && (
                              <div style={{fontSize:12,color:TX}}>Быстрый набор: <span style={{color:TX2,fontFamily:'monospace'}}>{ev.onlineMeeting.quickDial}</span></div>
                            )}
                            {ev.onlineMeeting.phones?.map((p,i) => (
                              <div key={i} style={{fontSize:12,color:TX}}>{p.type}: <span style={{color:TX2,fontFamily:'monospace'}}>{p.number}</span></div>
                            ))}
                          </div>
                        </div>
                      )}

                      {ev.recurrence && (
                        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <Calendar size={16} style={{color:TX2,flexShrink:0,marginTop:1}}/>
                          <div style={{fontSize:13,color:TX}}>
                            <span style={{fontWeight:600}}>Повторяющееся событие</span>
                            {ev.recurrence.pattern?.type && <span style={{display:'block',fontSize:12,color:TX2,marginTop:2}}>Тип: {ev.recurrence.pattern.type}{ev.recurrence.pattern.interval ? `, каждые ${ev.recurrence.pattern.interval}` : ''}{ev.recurrence.pattern.daysOfWeek ? `, ${ev.recurrence.pattern.daysOfWeek}` : ''}</span>}
                            {ev.recurrence.range?.type && <span style={{display:'block',fontSize:12,color:TX2}}>Диапазон: {ev.recurrence.range.type}{ev.recurrence.range.startDate ? `, с ${ev.recurrence.range.startDate}` : ''}{ev.recurrence.range.endDate ? `, по ${ev.recurrence.range.endDate}` : ''}{ev.recurrence.range.numberOfOccurrences ? `, ${ev.recurrence.range.numberOfOccurrences} повторений` : ''}</span>}
                          </div>
                        </div>
                      )}

                      {ev.hasAttachments && ev.attachments && ev.attachments.length > 0 && (
                        <div style={{borderTop:'1px solid var(--cal-bd)',paddingTop:14}}>
                          <div style={{fontSize:11,fontWeight:600,color:TX2,marginBottom:8,letterSpacing:'0.04em'}}>ВЛОЖЕНИЯ ({ev.attachments.length})</div>
                          <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            {ev.attachments.map((att,i) => (
                              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:6,background:'var(--cal-bg)'}}>
                                <span style={{fontSize:12,color:TX}}>{att.name}</span>
                                <span style={{fontSize:10,color:TX2,marginLeft:8}}>{att.size ? (att.size/1024).toFixed(1)+' КБ' : ''} {att.contentType||''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{borderTop:'1px solid var(--cal-bd)',paddingTop:14}}>
                        <button onClick={()=>setShowMeta(!showMeta)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',padding:0,marginBottom:showMeta?8:0}}>
                          <ChevronDown size={13} style={{color:TX3,transition:'transform .2s',transform:showMeta?'rotate(0deg)':'rotate(-90deg)'}}/>
                          <span style={{fontSize:11,fontWeight:600,color:TX3,letterSpacing:'0.04em'}}>СЛУЖЕБНАЯ ИНФОРМАЦИЯ</span>
                        </button>
                        {showMeta && (
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:16,rowGap:6,padding:'10px 12px',borderRadius:8,background:'var(--cal-bg)'}}>
                          {ev.createdDateTime && (
                            <div style={{fontSize:11,color:TX2}}>Создано: <span style={{color:TX}}>{fmtIso(ev.createdDateTime)}</span></div>
                          )}
                          {ev.lastModifiedDateTime && (
                            <div style={{fontSize:11,color:TX2}}>Изменено: <span style={{color:TX}}>{fmtIso(ev.lastModifiedDateTime)}</span></div>
                          )}
                          {ev.calendar?.name && (
                            <div style={{fontSize:11,color:TX2}}>Календарь: <span style={{color:TX}}>{ev.calendar.name}</span></div>
                          )}
                          {ev.iCalUId && (
                            <div style={{fontSize:11,color:TX2}}>iCal UID: <span style={{color:TX,fontFamily:'monospace',fontSize:10,wordBreak:'break-all'}}>{ev.iCalUId.substring(0,40)}...</span></div>
                          )}
                          {ev.id && (
                            <div style={{fontSize:11,color:TX2,gridColumn:'1/-1'}}>ID: <span style={{color:TX,fontFamily:'monospace',fontSize:10,wordBreak:'break-all'}}>{ev.id.substring(0,80)}{ev.id.length>80?'...':''}</span></div>
                          )}
                          {ev.seriesMasterId && (
                            <div style={{fontSize:11,color:TX2,gridColumn:'1/-1'}}>Series ID: <span style={{color:TX,fontFamily:'monospace',fontSize:10,wordBreak:'break-all'}}>{ev.seriesMasterId.substring(0,60)}...</span></div>
                          )}
                          {ev.reminderMinutesBeforeStart !== undefined && (
                            <div style={{fontSize:11,color:TX2}}>Напоминание: <span style={{color:TX}}>{ev.isReminderOn===false?'Выключено':ev.reminderMinutesBeforeStart+' мин. до начала'}</span></div>
                          )}
                          {ev.responseRequested !== undefined && (
                            <div style={{fontSize:11,color:TX2}}>Ответ запрошен: <span style={{color:TX}}>{ev.responseRequested?'Да':'Нет'}</span></div>
                          )}
                          {ev.meetingRequestWasSent !== undefined && (
                            <div style={{fontSize:11,color:TX2}}>Приглашения отправлены: <span style={{color:TX}}>{ev.meetingRequestWasSent?'Да':'Нет'}</span></div>
                          )}
                          {ev.allowNewTimeProposal !== undefined && (
                            <div style={{fontSize:11,color:TX2}}>Предложение нового времени: <span style={{color:TX}}>{ev.allowNewTimeProposal?'Разрешено':'Запрещено'}</span></div>
                          )}
                          {ev.isResponseRequested !== undefined && (
                            <div style={{fontSize:11,color:TX2}}>Требуется ответ: <span style={{color:TX}}>{ev.isResponseRequested?'Да':'Нет'}</span></div>
                          )}
                          {ev.type && (
                            <div style={{fontSize:11,color:TX2}}>Тип события: <span style={{color:TX}}>{typeMap[ev.type]||ev.type}</span></div>
                          )}
                          {ev.showAs && (
                            <div style={{fontSize:11,color:TX2}}>Показать как: <span style={{color:showAsInfo?.color||TX}}>{showAsInfo?.lbl||ev.showAs}</span></div>
                          )}
                          {ev.sensitivity && (
                            <div style={{fontSize:11,color:TX2}}>Доступность: <span style={{color:TX}}>{sens?.lbl||ev.sensitivity}</span></div>
                          )}
                          {ev.importance && (
                            <div style={{fontSize:11,color:TX2}}>Важность: <span style={{color:TX}}>{impMap[ev.importance]||ev.importance}</span></div>
                          )}
                          {ev.transactionId && (
                            <div style={{fontSize:11,color:TX2,gridColumn:'1/-1'}}>Transaction ID: <span style={{color:TX,fontFamily:'monospace',fontSize:10}}>{ev.transactionId}</span></div>
                          )}
                        </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{padding:'12px 24px 16px',borderTop:'1px solid var(--cal-bd)',display:'flex',gap:8,flexShrink:0}}>
                    {ev.webLink && (
                      <a href={ev.webLink} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:8,background:BLUE,color:'#fff',fontSize:12,fontWeight:600,textDecoration:'none',transition:'opacity .15s'}}>
                        <ExternalLink size={13}/> Открыть в Outlook
                      </a>
                    )}
                    <button onClick={()=>setDetailEvent(null)} style={{padding:'7px 14px',borderRadius:8,background:'transparent',border:'1px solid var(--cal-bd)',color:TX2,fontSize:12,fontWeight:500,cursor:'pointer'}}>
                      Закрыть
                    </button>
                  </div>
                </>
              )
            })()}

            {detailEvent.type==='vacation' && (() => {
              const v=detailEvent.data as VacationRequest
              return (
                <>
                  <div style={{height:4,borderRadius:'16px 16px 0 0',background:v.status===VacationRequestStatus.APPROVED?GREEN:v.status===VacationRequestStatus.ON_APPROVAL?AMBER:RED,flexShrink:0}} />
                  <div style={{padding:'20px 24px 0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                          <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:v.status===VacationRequestStatus.APPROVED?'rgba(52,199,89,0.15)':v.status===VacationRequestStatus.ON_APPROVAL?'rgba(255,159,10,0.15)':'rgba(255,59,48,0.15)',color:v.status===VacationRequestStatus.APPROVED?GREEN:v.status===VacationRequestStatus.ON_APPROVAL?AMBER:RED,letterSpacing:'0.03em'}}>
                            {v.status===VacationRequestStatus.APPROVED?'СОГЛАСОВАНО':v.status===VacationRequestStatus.ON_APPROVAL?'НА СОГЛАСОВАНИИ':'ОТКЛОНЕНО'}
                          </span>
                        </div>
                        <h2 style={{fontSize:18,fontWeight:700,color:TX,letterSpacing:'-0.02em'}}>{VACATION_TYPES[v.vacationType]?.name||'Отпуск'}</h2>
                      </div>
                      <button onClick={()=>setDetailEvent(null)} style={{background:'transparent',border:'none',cursor:'pointer',color:TX2,padding:4,marginLeft:12}}><X size={18}/></button>
                    </div>
                  </div>
                  <div style={{padding:'16px 24px 20px',overflowY:'auto',flex:1}}>
                    <div style={{display:'flex',flexDirection:'column',gap:14}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                        <Clock size={16} style={{color:TX2,flexShrink:0,marginTop:1}}/>
                        <div style={{fontSize:13,color:TX,lineHeight:1.5}}>
                          {v.startDate} — {v.endDate}
                          <span style={{display:'block',fontSize:12,color:TX2,marginTop:2}}>{v.duration} дн.</span>
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <User size={16} style={{color:TX2,flexShrink:0}}/>
                        <span style={{fontSize:13,color:TX}}>{v.userFirstName} {v.userLastName}</span>
                      </div>
                      {v.comment && (
                        <div style={{marginTop:4,borderTop:'1px solid var(--cal-bd)',paddingTop:14}}>
                          <div style={{fontSize:11,fontWeight:600,color:TX2,marginBottom:8,letterSpacing:'0.04em'}}>КОММЕНТАРИЙ</div>
                          <div style={{fontSize:13,color:TX,lineHeight:1.6,whiteSpace:'pre-wrap',padding:'10px 12px',borderRadius:8,background:'var(--cal-bg)'}}>{v.comment}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{padding:'12px 24px 16px',borderTop:'1px solid var(--cal-bd)',flexShrink:0}}>
                    <button onClick={()=>setDetailEvent(null)} style={{padding:'7px 14px',borderRadius:8,background:'transparent',border:'1px solid var(--cal-bd)',color:TX2,fontSize:12,fontWeight:500,cursor:'pointer'}}>
                      Закрыть
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
:root{
  --cal-bg:hsl(var(--background));--cal-surface:hsl(var(--card));--cal-surface-h:hsl(var(--secondary));
  --cal-tx:hsl(var(--foreground));--cal-tx2:hsl(var(--muted-foreground));--cal-tx3:hsl(var(--border));
  --cal-bd:hsl(var(--border));--cal-bl:hsl(var(--border) / 0.5);
  --cal-hover:hsl(var(--muted) / 0.7);--cal-cell:hsl(var(--muted) / 0.5);
  --cal-toggled-thumb:#fff;--cal-pill-shadow:hsl(var(--foreground) / 0.08);
  --cal-accent:hsl(var(--primary));--cal-accent-fg:hsl(var(--primary-foreground));
  --cal-accent-subtle:hsl(var(--primary) / 0.1);
}
.dark{
  --cal-bg:hsl(var(--background));--cal-surface:hsl(var(--card));--cal-surface-h:hsl(var(--secondary));
  --cal-tx:hsl(var(--foreground));--cal-tx2:hsl(var(--muted-foreground));--cal-tx3:hsl(var(--border));
  --cal-bd:hsl(var(--border));--cal-bl:hsl(var(--border) / 0.5);
  --cal-hover:hsl(var(--muted) / 0.7);--cal-cell:hsl(var(--muted) / 0.5);
  --cal-toggled-thumb:#fff;--cal-pill-shadow:hsl(var(--foreground) / 0.2);
  --cal-accent:hsl(var(--primary));--cal-accent-fg:hsl(var(--primary-foreground));
  --cal-accent-subtle:hsl(var(--primary) / 0.15);
}
.cr{display:flex;flex-direction:column;height:calc(100vh - 80px);background:var(--cal-bg);color:var(--cal-tx);font-family:'Inter',system-ui,sans-serif;animation:cfi .35s cubic-bezier(.16,1,.3,1)}
.ch{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--cal-bd);flex-shrink:0;background:var(--cal-surface)}
.cib{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:none;background:transparent;color:var(--cal-tx2);cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1)}
.cib:hover{background:var(--cal-surface-h);color:var(--cal-tx);transform:scale(1.05)}
.cib:active{transform:scale(.95)}
.cib:disabled{opacity:.4;cursor:default;transform:none}
.ctb{font-size:12px;font-weight:500;color:var(--cal-tx2);background:none;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1)}
.ctb:hover{background:var(--cal-surface-h);color:var(--cal-tx)}
.cti{font-size:17px;font-weight:700;letter-spacing:-.03em;margin-left:10px;color:var(--cal-tx);font-feature-settings:'cv02','cv03','cv04','cv11'}
.cts{display:flex;background:var(--cal-surface);border-radius:10px;padding:3px;border:1px solid var(--cal-bd);gap:2px}
.cta{font-size:12px;font-weight:500;padding:6px 16px;border-radius:8px;border:none;background:transparent;color:var(--cal-tx2);cursor:pointer;transition:all .25s cubic-bezier(.16,1,.3,1)}
.cta:hover{color:var(--cal-tx);background:var(--cal-hover)}
.ctaa{background:var(--cal-surface-h);color:var(--cal-tx);font-weight:600;box-shadow:0 1px 3px hsl(var(--foreground) / 0.06)}
.cs{width:268px;flex-shrink:0;border-right:1px solid var(--cal-bd);background:var(--cal-surface);overflow-y:auto;scrollbar-width:thin}
.css{padding:14px 16px;border-top:1px solid var(--cal-bd)}
.csl{font-size:10px;font-weight:700;color:var(--cal-tx3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}
.cmn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;border:none;background:transparent;color:var(--cal-tx2);cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1)}
.cmn:hover{background:var(--cal-surface-h);color:var(--cal-tx)}
.cmc{position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:50%;border:none;background:transparent;cursor:pointer;margin:1px auto;transition:all .2s cubic-bezier(.16,1,.3,1)}
.cmc:hover{background:var(--cal-hover);transform:scale(1.08)}
.ctr{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:8px;cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1);user-select:none}
.ctr:hover{background:var(--cal-hover)}
.ctt{width:34px;height:18px;border-radius:9px;position:relative;transition:background .3s cubic-bezier(.16,1,.3,1);flex-shrink:0;box-shadow:inset 0 1px 2px hsl(var(--foreground) / 0.08)}
.cth{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--cal-toggled-thumb);transition:transform .3s cubic-bezier(.68,-.55,.27,1.55);box-shadow:0 1px 3px hsl(var(--foreground) / 0.15)}
.cob{font-size:11px;color:var(--cal-tx2);background:var(--cal-surface);border:1px solid var(--cal-bd);padding:6px 12px;border-radius:8px;cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1);display:flex;align-items:center;gap:5px;width:fit-content}
.cob:hover{background:var(--cal-surface-h);color:var(--cal-tx);border-color:var(--cal-tx3);box-shadow:0 1px 3px hsl(var(--foreground) / 0.04)}
.cob2{color:var(--cal-tx3);border-color:transparent;background:transparent}
.cob2:hover{color:#FF3B30;background:hsl(0 72% 51% / 0.06);border-color:transparent;box-shadow:none}
.coc{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--cal-accent);background:none;border:none;cursor:pointer;padding:8px 0;transition:all .2s cubic-bezier(.16,1,.3,1)}
.coc:hover{opacity:.8}
.cm{flex:1;overflow:auto}
.ct{display:flex;flex-direction:column;overflow:hidden}
.cmc2{min-height:100px;border-bottom:1px solid var(--cal-bl);border-right:1px solid var(--cal-bl);padding:6px;cursor:pointer;transition:background .2s cubic-bezier(.16,1,.3,1)}
.cmc2:hover{background:var(--cal-hover)}
.cp{font-size:11px;line-height:16px;padding:1px 8px;border-radius:9999px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .2s cubic-bezier(.16,1,.3,1);box-shadow:0 1px 2px var(--cal-pill-shadow)}
.cp:hover{transform:scale(1.03);box-shadow:0 2px 6px var(--cal-pill-shadow)}
.cte{position:absolute;left:3px;right:3px;border-radius:8px;padding:5px 10px;overflow:hidden;z-index:10;color:#fff;cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1);box-shadow:0 2px 6px var(--cal-pill-shadow)}
.cte:hover{transform:scale(1.015);box-shadow:0 4px 14px var(--cal-pill-shadow);z-index:11}
.cspin{animation:csp .8s linear infinite}
.ca{animation-duration:.25s;animation-timing-function:ease-out;animation-fill-mode:both}
@keyframes cfi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes calFade{from{opacity:0}to{opacity:1}}
@keyframes calSlideL{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes calSlideR{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
@keyframes csp{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@media(max-width:1024px){.cs{display:none}}
`
