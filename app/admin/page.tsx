"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  createdAt?: string | null;
  updatedAt?: string | null;
  presentationOrder?: number | null;
};

const STAGES = ["팀 등록", "활동지", "문제 분석", "해결안", "AI 사업화", "사업 한 장", "발표 준비"];

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("전체");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [orderMode, setOrderMode] = useState(false);
  const [presentationOrder, setPresentationOrder] = useState<Project[]>([]);
  const [orderMessage, setOrderMessage] = useState("");
  const refreshInFlight = useRef(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("coach-admin-pin");
    if (saved) queueMicrotask(() => { setPin(saved); void load(saved); });
    // The saved PIN is intentionally checked only once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!signedIn || !pin) return;
    const timer = window.setInterval(() => void load(pin, true), 5000);
    return () => window.clearInterval(timer);
    // load is intentionally refreshed with the current dashboard state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, pin, orderMode]);

  async function load(secret = pin, silent = false) {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/projects", {
        headers: { "x-admin-pin": secret },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "불러오지 못했습니다.");
      const nextProjects = Array.isArray(data.projects) ? data.projects : [];
      setProjects(nextProjects);
      if (!orderMode) {
        setPresentationOrder([...nextProjects]
          .filter((p: Project) => p.result)
          .sort((a: Project, b: Project) => (a.presentationOrder ?? 999) - (b.presentationOrder ?? 999)));
      }
      setSignedIn(true);
      setLastSyncedAt(new Date());
      sessionStorage.setItem("coach-admin-pin", secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
      if (!silent) setSignedIn(false);
    } finally {
      refreshInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }

  const registeredProjects = useMemo(() => [...projects].sort((a, b) => {
    const aTime = parseProjectDate(a.createdAt)?.getTime();
    const bTime = parseProjectDate(b.createdAt)?.getTime();
    if (aTime != null && bTime != null && aTime !== bTime) return aTime - bTime;
    if (aTime != null && bTime == null) return -1;
    if (aTime == null && bTime != null) return 1;
    return (a.id ?? 0) - (b.id ?? 0) || a.team.localeCompare(b.team, "ko");
  }), [projects]);

  const teamNumber = useMemo(() => new Map(registeredProjects.map((p, index) => [p.code, index + 1])), [registeredProjects]);

  const filtered = useMemo(() => registeredProjects.filter(p => {
    const matchesQuery = `${p.team} ${p.members} ${p.problem}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "전체" || p.status === status || stageLabel(p) === status;
    return matchesQuery && matchesStatus;
  }), [registeredProjects, query, status]);

  const completed = projects.filter(p => p.result).length;
  const activeToday = projects.filter(p => {
    const date = parseProjectDate(p.updatedAt);
    return date ? Date.now() - date.getTime() < 86400000 : false;
  }).length;

  function exportCsv() {
    const rows = [
      ["팀 번호", "팀명", "팀원", "현재 단계", "문제", "해결책", "서비스명", "슬로건", "수익모델", "최근 저장"],
      ...filtered.map(p => [teamNumber.get(p.code) ?? "", p.team, p.members, stageLabel(p), p.problem, p.solution, p.selectedName, p.result?.slogan ?? "", p.result?.revenueModel ?? "", formatTime(p.updatedAt)]),
    ];
    const csv = "\ufeff" + rows.map(r => r.map(x => `"${String(x).replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `AI창업스튜디오_팀결과_${new Date().toISOString().slice(0, 10)}.csv`;
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

  function moveTeam(index: number, direction: -1 | 1) {
    const next = [...presentationOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPresentationOrder(next);
  }

  async function saveOrder() {
    setLoading(true);
    setOrderMessage("");
    try {
      const response = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-pin": pin },
        body: JSON.stringify({ order: presentationOrder.map(p => p.code) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      setOrderMessage(`${presentationOrder.length}개 팀의 발표 순서를 DB에 저장했습니다. ✓`);
      await load();
    } catch (e) {
      setOrderMessage(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!signedIn) return (
    <main className="admin-login">
      <Link href="/" className="admin-home">← 참가자 스튜디오</Link>
      <section>
        <div className="admin-lock">🔐</div>
        <p>AI STARTUP STUDIO</p><h1>운영 대시보드</h1>
        <span>한 화면에서 모든 팀의 진행 상황을 확인합니다.</span>
        <label>운영 비밀번호<input type="password" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} placeholder="비밀번호 입력" autoFocus /></label>
        {error && <small>{error}</small>}
        <button onClick={() => load()} disabled={!pin || loading}>{loading ? "확인 중…" : "대시보드 입장 →"}</button>
      </section>
    </main>
  );

  return (
    <main className="admin">
      <header>
        <div><span>⚡</span><div><b>AI 창업 스튜디오</b><small>실시간 통합 운영 대시보드</small></div></div>
        <nav><Link href="/">참가자 스튜디오</Link><button onClick={() => load()}>↻ 새로고침</button><button onClick={() => { sessionStorage.removeItem("coach-admin-pin"); setSignedIn(false); }}>잠금</button></nav>
      </header>
      <section className="admin-body live-admin-body">
        <div className="admin-title">
          <div><p>M3 LIVE CONTROL</p><h1>팀별 실시간 진행 상황</h1><span>각 팀의 현재 단계와 작성 내용을 5초마다 자동으로 갱신합니다.</span></div>
          <div className="admin-actions"><button onClick={() => setOrderMode(x => !x)}>🎤 발표 순서</button><button onClick={exportCsv}>↓ CSV</button></div>
        </div>

        <div className="live-strip">
          <span className="live-pulse" />
          <b>LIVE</b>
          <span>{lastSyncedAt ? `${lastSyncedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 동기화` : "연결 중"}</span>
          {error && <small>{error}</small>}
        </div>

        <div className="stat-grid">
          <article><span>참여 팀</span><strong>{projects.length}</strong><small>전체 등록 팀</small></article>
          <article><span>오늘 활동</span><strong>{activeToday}</strong><small>24시간 내 저장</small></article>
          <article><span>사업화 완료</span><strong>{completed}</strong><small>AI 결과 생성</small></article>
          <article className="rate"><span>완성률</span><strong>{projects.length ? Math.round(completed / projects.length * 100) : 0}%</strong><i><b style={{ width: `${projects.length ? completed / projects.length * 100 : 0}%` }} /></i></article>
        </div>

        {orderMode && <section className="order-panel">
          <div className="order-head"><div><span>LOCAL HERO PITCH</span><h2>발표 순서 정하기</h2><p>사업화를 완료한 팀만 자동으로 모았습니다.</p></div><div><button onClick={createRandomOrder}>🎲 무작위 다시 뽑기</button><button className="save-order" onClick={saveOrder} disabled={loading || presentationOrder.length === 0}>{loading ? "저장 중…" : "순서 DB 저장"}</button></div></div>
          {presentationOrder.length === 0 ? <p className="order-empty">아직 사업화를 완료한 팀이 없습니다.</p> :
            <div className="order-list">{presentationOrder.map((p, i) => <div key={p.code}><strong>{i + 1}</strong><span><b>{p.team}</b><small>{p.selectedName || p.result?.serviceNames?.[0] || "서비스명 선택 전"}</small></span><nav><button onClick={() => moveTeam(i, -1)} disabled={i === 0}>↑</button><button onClick={() => moveTeam(i, 1)} disabled={i === presentationOrder.length - 1}>↓</button></nav></div>)}</div>}
          {orderMessage && <p className="order-message">{orderMessage}</p>}
        </section>}

        <div className="admin-tools live-tools">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔎 팀명·팀원·문제 검색" />
          <div>{["전체", ...STAGES].map(x => <button key={x} className={status === x ? "on" : ""} onClick={() => setStatus(x)}>{x}</button>)}</div>
          <span>{filtered.length}개 팀</span>
        </div>

        <div className="live-team-grid">
          {filtered.length === 0 && <div className="empty-team live-empty">아직 조건에 맞는 팀이 없습니다.</div>}
          {filtered.map(p => {
            const stage = stageNumber(p);
            const serviceName = p.selectedName || p.result?.serviceNames?.[0];
            const active = isRecentlyActive(p.updatedAt);
            return <button className={`live-team-card stage-${stage}`} key={p.code} onClick={() => setSelected(p)}>
              <div className="live-card-head">
                <span className="team-sequence">{teamNumber.get(p.code) ?? "-"}<small>TEAM</small></span>
                <div><small>우리 팀</small><h2>{p.team || "이름 없는 팀"}</h2><p>{p.members || "팀원 미입력"}</p></div>
                <i className={active ? "active" : ""}>{active ? "작업 중" : "대기"}</i>
              </div>
              <div className="stage-line">
                <div><b>STEP {stage}</b><strong>{STAGES[stage - 1]}</strong></div>
                <span>{stage}/7</span>
              </div>
              <div className="mini-progress"><i style={{ width: `${stage / 7 * 100}%` }} /></div>
              <div className="live-content">
                <section><small>M1 문제</small><p>{p.problem || "아직 문제를 입력하지 않았습니다."}</p></section>
                <section><small>M2 해결 아이디어</small><p>{p.solution || "아직 해결 아이디어를 입력하지 않았습니다."}</p></section>
                <section className={serviceName ? "complete-content" : ""}><small>M3 사업 아이템</small><p>{serviceName || "AI 사업화 진행 전입니다."}</p></section>
              </div>
              <footer><span>최근 저장 {formatTime(p.updatedAt)}</span><strong>상세보기 →</strong></footer>
            </button>;
          })}
        </div>
      </section>

      {selected && <div className="detail-backdrop" onClick={() => setSelected(null)}>
        <aside className="detail" onClick={e => e.stopPropagation()}>
          <button className="detail-close" onClick={() => setSelected(null)}>×</button>
          <p>TEAM {teamNumber.get(selected.code) ?? "-"}</p><h2>{selected.team}</h2><span>{selected.members || "팀원 미입력"} · {stageLabel(selected)}</span>
          <Detail title="M1. 발견한 문제" text={selected.problem} />
          <Detail title="M2. 해결 아이디어" text={selected.solution} />
          {selected.result ? <><div className="service-result"><small>AI 추천 서비스</small><strong>{selected.selectedName || selected.result.serviceNames?.[0]}</strong><p>“{selected.result.slogan}”</p></div>
            <Detail title="핵심 고객" text={selected.result.customer} />
            <Detail title="차별점" text={selected.result.differentiator} />
            <Detail title="운영·수익모델" text={selected.result.revenueModel} />
            <Detail title="지역사회 효과" text={selected.result.localImpact} />
            <details><summary>3분 발표문 보기</summary><p>{selected.result.pitch}</p></details></> :
            <div className="not-yet">아직 AI 사업화 결과를 만들지 않았습니다.</div>}
          <button className="detail-print" onClick={() => window.print()}>인쇄·PDF 저장</button>
        </aside>
      </div>}

      <style jsx global>{`
        .live-admin-body{max-width:1500px}
        .live-strip{display:flex;align-items:center;gap:8px;margin-top:20px;background:#28211d;color:#fff;width:max-content;max-width:100%;border-radius:999px;padding:9px 14px;font-size:12px}
        .live-strip b{color:#ffbf87;letter-spacing:1px}.live-strip small{color:#ffb4a0;margin-left:8px}.live-pulse{width:9px;height:9px;border-radius:50%;background:#3ee48f;box-shadow:0 0 0 0 #3ee48f80;animation:livePulse 1.5s infinite}
        .live-tools{border-radius:17px;margin-bottom:16px}.live-tools>div{overflow:auto;white-space:nowrap}
        .live-team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
        .live-team-card{width:100%;min-width:0;border:1px solid #e7d8c8;border-top:5px solid #c9b9aa;border-radius:22px;background:#fff;padding:20px;text-align:left;cursor:pointer;box-shadow:0 10px 30px #3b28100b;transition:.18s}
        .live-team-card:hover{transform:translateY(-2px);box-shadow:0 16px 38px #3b281018}.live-team-card.stage-3,.live-team-card.stage-4{border-top-color:#ff9d45}.live-team-card.stage-5,.live-team-card.stage-6{border-top-color:#ff5b22}.live-team-card.stage-7{border-top-color:#2e9b66}
        .live-card-head{display:grid;grid-template-columns:58px 1fr auto;gap:13px;align-items:center}.team-sequence{display:grid;place-items:center;width:54px;height:54px;background:#28211d;color:#fff;border-radius:17px;font-size:24px;font-weight:950}.team-sequence small{font-size:8px;letter-spacing:1px;color:#ffba8e}.live-card-head>div{min-width:0}.live-card-head>div>small{color:#9b8d81}.live-card-head h2{font-size:22px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.live-card-head p{margin:0;color:#81756b;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.live-card-head>i{font-style:normal;background:#eee7e0;color:#86796f;border-radius:99px;padding:7px 10px;font-size:11px;font-weight:850}.live-card-head>i.active{background:#def7e9;color:#24724a}
        .stage-line{display:flex;align-items:end;justify-content:space-between;margin-top:19px}.stage-line>div{display:grid;gap:2px}.stage-line b{font-size:10px;color:#ee5a24;letter-spacing:1px}.stage-line strong{font-size:17px}.stage-line>span{font-size:12px;color:#8c8076}.mini-progress{height:7px;background:#eee6dd;border-radius:99px;overflow:hidden;margin:9px 0 16px}.mini-progress i{display:block;height:100%;background:linear-gradient(90deg,#ff5b22,#ffc83d);border-radius:99px;transition:width .35s}
        .live-content{display:grid;grid-template-columns:1fr 1fr;gap:9px}.live-content section{min-width:0;background:#faf6f1;border-radius:13px;padding:11px}.live-content section:last-child{grid-column:1/-1}.live-content section.complete-content{background:#ebf8f0}.live-content small{display:block;color:#a05730;font-weight:900;font-size:10px;margin-bottom:5px}.live-content p{margin:0;color:#5f564e;font-size:13px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:38px}.live-team-card footer{display:flex;justify-content:space-between;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid #eee4da;font-size:11px;color:#90847a}.live-team-card footer strong{color:#ee5a24}.live-empty{grid-column:1/-1;background:#fff;border:1px solid #e7d8c8;border-radius:18px}
        @keyframes livePulse{70%{box-shadow:0 0 0 7px #3ee48f00}}
        @media(max-width:980px){.live-team-grid{grid-template-columns:1fr}}
        @media(max-width:600px){.live-card-head{grid-template-columns:48px 1fr}.team-sequence{width:46px;height:46px;font-size:20px}.live-card-head>i{grid-column:1/-1;width:max-content}.live-content{grid-template-columns:1fr}.live-content section:last-child{grid-column:auto}.live-team-card{padding:16px}.live-strip{width:100%;border-radius:13px;flex-wrap:wrap}}
      `}</style>
    </main>
  );
}

function Detail({ title, text }: { title: string; text?: string }) {
  return <div className="detail-item"><b>{title}</b><p>{text || "아직 작성하지 않았습니다."}</p></div>;
}

function stageNumber(project: Project) {
  const raw = Number(project.step);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(7, Math.trunc(raw) + 1));
}

function stageLabel(project: Project) {
  return STAGES[stageNumber(project) - 1] || project.status || "팀 등록";
}

function parseProjectDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecentlyActive(value: unknown) {
  const date = parseProjectDate(value);
  return date ? Date.now() - date.getTime() < 5 * 60 * 1000 : false;
}

function formatTime(value: unknown) {
  const date = parseProjectDate(value);
  if (!date) return "시간 정보 없음";
  try {
    return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return "시간 정보 없음";
  }
}
