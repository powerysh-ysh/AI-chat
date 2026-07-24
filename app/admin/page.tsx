"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Project = {
  id: number;
  code: string;
  team: string;
  members: string;
  problem: string;
  solution: string;
  tone: string;
  result: null | {
    serviceNames?: string[];
    slogan?: string;
    customer?: string;
    differentiator?: string;
    revenueModel?: string;
    localImpact?: string;
    firstExperiment?: string;
    pitch?: string;
  };
  selectedName: string;
  step: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  presentationOrder?: number | null;
};

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("전체");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderMode, setOrderMode] = useState(false);
  const [presentationOrder, setPresentationOrder] = useState<Project[]>([]);
  const [orderMessage, setOrderMessage] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("coach-admin-pin");
    if (saved) queueMicrotask(() => { setPin(saved); load(saved); });
    // The saved PIN is intentionally checked only once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(secret = pin) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/projects", { headers: { "x-admin-pin": secret } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "불러오지 못했습니다.");
      setProjects(data.projects);
      setPresentationOrder([...data.projects].filter((p:Project)=>p.result).sort((a:Project,b:Project)=>(a.presentationOrder??999)-(b.presentationOrder??999)));
      setSignedIn(true);
      sessionStorage.setItem("coach-admin-pin", secret);
    } catch (e) {
      setSignedIn(false);
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally { setLoading(false); }
  }

  const filtered = useMemo(() => projects.filter(p => {
    const matchesQuery = `${p.team} ${p.members} ${p.problem}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "전체" || p.status === status;
    return matchesQuery && matchesStatus;
  }), [projects, query, status]);

  const completed = projects.filter(p => p.result).length;
  const activeToday = projects.filter(p => Date.now() - new Date(p.updatedAt.replace(" ", "T") + "Z").getTime() < 86400000).length;

  function exportCsv() {
    const rows = [
      ["팀명","팀원","상태","문제","해결책","서비스명","슬로건","수익모델","최근 저장"],
      ...filtered.map(p => [p.team,p.members,p.status,p.problem,p.solution,p.selectedName,p.result?.slogan??"",p.result?.revenueModel??"",p.updatedAt]),
    ];
    const csv = "\ufeff" + rows.map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
    a.download = `AI창업스튜디오_팀결과_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function createRandomOrder() {
    const ready = projects.filter(p => p.result);
    for (let i = ready.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ready[i], ready[j]] = [ready[j], ready[i]];
    }
    setPresentationOrder(ready);
    setOrderMode(true);
    setOrderMessage("무작위 순서를 만들었습니다. 위·아래로 조정한 뒤 저장하세요.");
  }

  function moveTeam(index:number, direction:-1|1) {
    const next = [...presentationOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPresentationOrder(next);
  }

  async function saveOrder() {
    setLoading(true); setOrderMessage("");
    try {
      const response = await fetch("/api/admin/projects", {
        method: "POST", headers: { "content-type":"application/json", "x-admin-pin":pin },
        body: JSON.stringify({ order:presentationOrder.map(p=>p.code) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      setOrderMessage(`${presentationOrder.length}개 팀의 발표 순서를 DB에 저장했습니다. ✓`);
      await load();
    } catch (e) { setOrderMessage(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setLoading(false); }
  }

  if (!signedIn) return (
    <main className="admin-login">
      <Link href="/" className="admin-home">← 참가자 스튜디오</Link>
      <section>
        <div className="admin-lock">🔐</div>
        <p>AI STARTUP STUDIO</p><h1>운영 대시보드</h1>
        <span>한 웹앱 안에서 모든 팀의 진행 상황을 확인합니다.</span>
        <label>운영 비밀번호<input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} placeholder="비밀번호 입력" autoFocus/></label>
        {error && <small>{error}</small>}
        <button onClick={()=>load()} disabled={!pin || loading}>{loading ? "확인 중…" : "대시보드 입장 →"}</button>
      </section>
    </main>
  );

  return (
    <main className="admin">
      <header>
        <div><span>⚡</span><div><b>AI 창업 스튜디오</b><small>통합 운영 대시보드</small></div></div>
        <nav><Link href="/">참가자 스튜디오</Link><button onClick={()=>load()}>↻ 새로고침</button><button onClick={()=>{sessionStorage.removeItem("coach-admin-pin");setSignedIn(false)}}>잠금</button></nav>
      </header>
      <section className="admin-body">
        <div className="admin-title"><div><p>M3 LIVE CONTROL</p><h1>로컬 히어로 팀 현황</h1><span>팀의 저장 내용과 사업화 진행 상황을 실시간으로 확인합니다.</span></div><div className="admin-actions"><button onClick={()=>setOrderMode(x=>!x)}>🎤 발표 순서</button><button onClick={exportCsv}>↓ CSV</button></div></div>
        <div className="stat-grid">
          <article><span>참여 팀</span><strong>{projects.length}</strong><small>전체 등록 팀</small></article>
          <article><span>오늘 활동</span><strong>{activeToday}</strong><small>24시간 내 저장</small></article>
          <article><span>사업화 완료</span><strong>{completed}</strong><small>AI 결과 생성</small></article>
          <article className="rate"><span>완성률</span><strong>{projects.length ? Math.round(completed/projects.length*100) : 0}%</strong><i><b style={{width:`${projects.length ? completed/projects.length*100 : 0}%`}}/></i></article>
        </div>
        {orderMode && <section className="order-panel">
          <div className="order-head"><div><span>LOCAL HERO PITCH</span><h2>발표 순서 정하기</h2><p>사업화를 완료한 팀만 자동으로 모았습니다.</p></div><div><button onClick={createRandomOrder}>🎲 무작위 다시 뽑기</button><button className="save-order" onClick={saveOrder} disabled={loading||presentationOrder.length===0}>{loading?"저장 중…":"순서 DB 저장"}</button></div></div>
          {presentationOrder.length===0 ? <p className="order-empty">아직 사업화를 완료한 팀이 없습니다.</p> :
          <div className="order-list">{presentationOrder.map((p,i)=><div key={p.code}><strong>{i+1}</strong><span><b>{p.team}</b><small>{p.selectedName || p.result?.serviceNames?.[0] || "서비스명 선택 전"} · {p.code}</small></span><nav><button onClick={()=>moveTeam(i,-1)} disabled={i===0}>↑</button><button onClick={()=>moveTeam(i,1)} disabled={i===presentationOrder.length-1}>↓</button></nav></div>)}</div>}
          {orderMessage && <p className="order-message">{orderMessage}</p>}
        </section>}
        <div className="admin-tools">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="🔎 팀명·팀원·문제 검색"/>
          <div>{["전체","팀 등록","문제 작성","해결책 작성","사업화 완료"].map(x=><button key={x} className={status===x?"on":""} onClick={()=>setStatus(x)}>{x}</button>)}</div>
          <span>{filtered.length}개 팀</span>
        </div>
        <div className="team-table">
          <div className="table-head"><span>팀</span><span>진행 상태</span><span>발견한 문제</span><span>최근 저장</span><span></span></div>
          {filtered.length === 0 && <div className="empty-team">아직 조건에 맞는 팀이 없습니다.</div>}
          {filtered.map(p=><button className="team-row" key={p.id} onClick={()=>setSelected(p)}>
            <span><b>{p.team}</b><small>{p.members || "팀원 미입력"}</small></span>
            <span><i className={`status s${p.step}`}>{p.status}</i><small>M{Math.min(3,p.step+1)} 진행</small></span>
            <span>{p.problem || "아직 문제를 작성하지 않았습니다."}</span>
            <span>{formatTime(p.updatedAt)}</span><span>자세히 →</span>
          </button>)}
        </div>
      </section>
      {selected && <div className="detail-backdrop" onClick={()=>setSelected(null)}>
        <aside className="detail" onClick={e=>e.stopPropagation()}>
          <button className="detail-close" onClick={()=>setSelected(null)}>×</button>
          <p>LOCAL HERO TEAM</p><h2>{selected.team}</h2><span>{selected.members || "팀원 미입력"} · {selected.status}</span>
          <Detail title="M1. 발견한 문제" text={selected.problem}/>
          <Detail title="M2. 해결 아이디어" text={selected.solution}/>
          {selected.result ? <><div className="service-result"><small>AI 추천 서비스</small><strong>{selected.selectedName || selected.result.serviceNames?.[0]}</strong><p>“{selected.result.slogan}”</p></div>
            <Detail title="핵심 고객" text={selected.result.customer}/>
            <Detail title="차별점" text={selected.result.differentiator}/>
            <Detail title="운영·수익모델" text={selected.result.revenueModel}/>
            <Detail title="지역사회 효과" text={selected.result.localImpact}/>
            <details><summary>3분 발표문 보기</summary><p>{selected.result.pitch}</p></details></>:
            <div className="not-yet">아직 AI 사업화 결과를 만들지 않았습니다.</div>}
          <button className="detail-print" onClick={()=>window.print()}>인쇄·PDF 저장</button>
        </aside>
      </div>}
    </main>
  );
}

function Detail({title,text}:{title:string;text?:string}) {
  return <div className="detail-item"><b>{title}</b><p>{text || "아직 작성하지 않았습니다."}</p></div>;
}

function formatTime(value:string) {
  const date = new Date(value.replace(" ", "T") + "Z");
  return new Intl.DateTimeFormat("ko-KR",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);
}
