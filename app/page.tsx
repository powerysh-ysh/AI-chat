"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Inputs = {
  team: string;
  members: string;
  problem: string;
  solution: string;
  tone: "따뜻하고 공감되게" | "재미있고 유쾌하게" | "전문적이고 설득력 있게";
};

type CoachResult = {
  serviceNames: string[];
  slogan: string;
  customer: string;
  problemInsight: string;
  solution: string;
  differentiator: string;
  revenueModel: string;
  localImpact: string;
  firstExperiment: string;
  pitch: string;
  qa: { question: string; answer: string }[];
  demo?: boolean;
};

type Discovery = {
  customer: string;
  situation: string;
  rootCauses: string[];
  problemStatement: string;
  validationQuestions: string[];
  demo?: boolean;
};

type SolutionCandidate = {
  title: string;
  type: string;
  description: string;
  value: string;
  feasibility: string;
};

const empty: Inputs = {
  team: "",
  members: "",
  problem: "",
  solution: "",
  tone: "재미있고 유쾌하게",
};

const steps = ["팀 등록", "문제 씨앗", "AI 문제 분석", "해결안 발산", "AI 사업화", "사업 한 장", "발표 준비"];

export default function Home() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Inputs>(empty);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [solutionCandidates, setSolutionCandidates] = useState<SolutionCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState(-1);
  const [selectedName, setSelectedName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [seconds, setSeconds] = useState(180);
  const [running, setRunning] = useState(false);
  const [projectCode, setProjectCode] = useState("");
  const [restoreCode, setRestoreCode] = useState("");
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [restoreError, setRestoreError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("local-hero-project");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        queueMicrotask(() => {
          setForm(parsed.form ?? empty);
          setResult(parsed.result ?? null);
          setDiscovery(parsed.discovery ?? null);
          setSolutionCandidates(parsed.solutionCandidates ?? []);
          setSelectedCandidate(parsed.selectedCandidate ?? -1);
          setSelectedName(parsed.selectedName ?? "");
          setProjectCode(parsed.projectCode ?? "");
        });
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("local-hero-project", JSON.stringify({ form, discovery, solutionCandidates, selectedCandidate, result, selectedName, projectCode }));
  }, [form, discovery, solutionCandidates, selectedCandidate, result, selectedName, projectCode]);

  useEffect(() => {
    if (!started || !projectCode || !form.team.trim()) return;
    queueMicrotask(() => setSaveState("saving"));
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: projectCode, form, discovery, solutionCandidates, selectedCandidate, result, selectedName, step }),
        });
        if (!response.ok) throw new Error();
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [started, projectCode, form, discovery, solutionCandidates, selectedCandidate, result, selectedName, step]);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);

  const progress = Math.round(((result ? Math.max(step, 5) : step) / (steps.length - 1)) * 100);
  const projectText = useMemo(() => {
    if (!result) return "";
    return `[${form.team} 팀 사업 한 장]
서비스명: ${selectedName}
슬로건: ${result.slogan}

문제와 고객: ${result.customer}이(가) ${result.problemInsight}
해결책: ${result.solution}
차별점: ${result.differentiator}
운영·수익모델: ${result.revenueModel}
지역사회 효과: ${result.localImpact}
첫 번째 실험: ${result.firstExperiment}

[3분 발표문]
${result.pitch}`;
  }, [form.team, result, selectedName]);

  async function createBusiness() {
    setLoading(true);
    setError("");
    setStep(4);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error("AI 코치가 잠시 쉬고 있어요.");
      const data = (await response.json()) as CoachResult;
      setResult(data);
      setSelectedName(data.serviceNames[0]);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeProblem() {
    setLoading(true); setError(""); setStep(2);
    try {
      const response = await fetch("/api/ideate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "analyze", team: form.team, problem: form.problem }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "문제를 분석하지 못했습니다.");
      setDiscovery(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally { setLoading(false); }
  }

  async function generateSolutions() {
    if (!discovery) return;
    setLoading(true); setError(""); setStep(3);
    try {
      const response = await fetch("/api/ideate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "solutions", team: form.team, problem: form.problem, discovery }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "해결안을 만들지 못했습니다.");
      setSolutionCandidates(data.candidates ?? []);
      const recommended = Math.max(0, Math.min((data.candidates?.length ?? 1) - 1, data.recommendation ?? 0));
      setSelectedCandidate(recommended);
      if (data.candidates?.[recommended]) chooseCandidate(data.candidates[recommended], recommended);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally { setLoading(false); }
  }

  function chooseCandidate(candidate: SolutionCandidate, index: number) {
    setSelectedCandidate(index);
    setForm(current => ({ ...current, solution: `우리 팀은 ${discovery?.customer || "핵심 고객"}을 위해 ${discovery?.problemStatement || current.problem} 문제를 해결하는 ‘${candidate.title}’ 서비스를 제안합니다. ${candidate.description}` }));
  }

  function reset() {
    if (!confirm("현재 팀의 내용을 지우고 새로 시작할까요?")) return;
    setForm(empty); setDiscovery(null); setSolutionCandidates([]); setSelectedCandidate(-1); setResult(null); setSelectedName(""); setProjectCode(""); setStarted(false); setStep(0);
    localStorage.removeItem("local-hero-project");
  }

  function begin() {
    if (!projectCode) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      setProjectCode(Array.from(bytes, b => alphabet[b % alphabet.length]).join(""));
    }
    setStarted(true);
  }

  async function restoreProject() {
    const code = restoreCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 6) return setRestoreError("6~8자리 팀 코드를 입력해 주세요.");
    setRestoreError("");
    try {
      const response = await fetch(`/api/projects?code=${code}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "팀을 찾을 수 없습니다.");
      setForm(data.project.form);
      setDiscovery(data.project.discovery ?? null);
      setSolutionCandidates(data.project.solutionCandidates ?? []);
      setSelectedCandidate(data.project.selectedCandidate ?? -1);
      setResult(data.project.result);
      setSelectedName(data.project.selectedName);
      setProjectCode(data.project.code);
      setStep(data.project.result ? Math.max(5, data.project.step) : data.project.step);
      setStarted(true);
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "팀을 찾을 수 없습니다.");
    }
  }

  async function copyAll() {
    await navigator.clipboard.writeText(projectText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (presenting && result) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return (
      <main className="present">
        <button className="close-present" onClick={() => setPresenting(false)}>발표 모드 종료 ×</button>
        <div className="pitch-title"><span>LOCAL HERO INVESTMENT DAY</span><h1>{selectedName}</h1><p>“{result.slogan}”</p></div>
        <div className="pitch-panels">
          <article><b>01 발견한 문제</b><h2>{result.customer}</h2><p>{result.problemInsight}</p></article>
          <article><b>02 우리의 해결책</b><h2>{result.solution}</h2><p>{result.differentiator}</p></article>
          <article><b>03 지역의 변화</b><h2>{result.localImpact}</h2><p>{result.firstExperiment}</p></article>
        </div>
        <div className={`timer-bar ${seconds < 30 ? "danger" : ""}`}>
          <strong>{mm}:{ss}</strong>
          <button onClick={() => setRunning((x) => !x)}>{running ? "일시정지" : "발표 시작"}</button>
          <button onClick={() => { setSeconds(180); setRunning(false); }}>초기화</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span>⚡</span><strong>AI 창업 코치</strong></div>
        <div className="header-note">{started && projectCode ? <><b>팀 코드 {projectCode}</b> · {saveState==="saving"?"저장 중…":saveState==="saved"?"DB 저장 완료 ✓":saveState==="error"?"저장 확인 필요":"자동 저장"}</> : "지역을 이해하고, 아이디어로 해결하다"}</div>
        <nav className="app-switch"><Link className="active" href="/">참가자 스튜디오</Link><Link href="/admin">운영 대시보드</Link><button className="ghost" onClick={reset}>새 팀 시작</button></nav>
      </header>

      {!started ? (
        <section className="hero shell">
          <div className="hero-copy">
            <div className="badges"><span>🏆 로컬 히어로 미션</span><span>⏱ 60분 완성</span></div>
            <p className="eyebrow">M3. AI와 함께 사업화하기</p>
            <h1><em>AI</em> 창업 스튜디오</h1>
            <h2>두 문장으로 시작해 <strong>사업 한 장</strong> 완성!</h2>
            <p className="lead">M1의 문제 문장과 M2의 해결 문장을 준비하세요.<br/>AI 코치가 서비스명부터 3분 발표문까지 함께 만듭니다.</p>
            <button className="primary big" onClick={begin}>새 팀 미션 시작 →</button>
            {result && <button className="resume" onClick={() => { setStarted(true); setStep(5); }}>저장된 결과 이어보기</button>}
            <p className="micro">팀별 스마트폰 또는 노트북 한 대면 충분해요 · 자동 저장됩니다</p>
            <div className="restore-box">
              <b>이미 팀 코드가 있나요?</b>
              <div><input maxLength={8} value={restoreCode} onChange={e=>setRestoreCode(e.target.value.toUpperCase())} placeholder="팀 코드 입력"/><button onClick={restoreProject}>불러오기</button></div>
              {restoreError && <small>{restoreError}</small>}
            </div>
          </div>
          <div className="hero-visual">
            <div className="sun"></div><div className="spark s1">✦</div><div className="spark s2">✦</div>
            <div className="robot"><div className="antenna"></div><div className="face"><i></i><i></i><b>⌣</b></div><div className="robot-body">AI</div></div>
            <div className="speech">아이디어를<br/><strong>사업으로!</strong></div>
            <div className="preview-card"><b>오늘의 완성품</b><div><span>✓ 사업 아이디어 한 장</span><span>✓ 3분 발표 대본</span><span>✓ 예상 질문과 답변</span></div></div>
          </div>
          <div className="mission-rail seven">{steps.map((x,i)=><div key={x}><b>{i+1}</b><span>{["👋","🔎","🧭","💡","🤖","📄","📣"][i]}</span><strong>{x}</strong></div>)}</div>
        </section>
      ) : (
        <section className="workspace shell">
          <div className="mission-head">
            <div><span className="mission-label">M3 · AI 창업 스튜디오</span><h1>{loading ? "AI 코치가 우리 팀의 사업을 설계하고 있어요…" : steps[step]}</h1></div>
            <div className="team-code"><small>우리 팀 코드</small><strong>{projectCode}</strong><span>{saveState==="saving"?"DB 저장 중…":saveState==="saved"?"저장 완료 ✓":saveState==="error"?"저장 실패 · 인터넷 확인":"자동 저장 대기"}</span></div>
          </div>
          <div className="progress"><i style={{width:`${progress}%`}} /></div>
          <div className="step-dots seven">{steps.map((x,i)=>{
            const unlocked = i <= 1 || (i === 2 && !!discovery) || (i === 3 && solutionCandidates.length > 0) || (i >= 4 && !!result);
            return <button key={x} className={i===step?"on":i<step?"done":""} disabled={!unlocked} onClick={()=>unlocked&&setStep(i)}><b>{i < step ? "✓" : i+1}</b><span>{x}</span></button>;
          })}</div>

          {step === 0 && <MissionCard icon="👋" coach="먼저 우리 팀을 소개해 주세요. 재미있는 팀 이름이면 발표할 때 더 기억에 남아요!">
            <Field label="우리 팀 이름" value={form.team} placeholder="예: 좌충우돌 로컬 히어로" onChange={v=>setForm({...form,team:v})}/>
            <Field label="팀원 이름 (선택)" value={form.members} placeholder="예: 김로컬, 이히어로, 박매니저" onChange={v=>setForm({...form,members:v})}/>
            <Next disabled={!form.team.trim()} onClick={()=>setStep(1)} />
          </MissionCard>}

          {step === 1 && <MissionCard icon="🔎" coach="M1에서 완성한 ‘문제 한 문장’을 그대로 옮겨 적으세요. 누가, 어떤 상황에서, 왜 불편한지가 보이면 좋아요.">
            <label className="field-label">M1. 우리가 발견한 지역 문제</label>
            <textarea className="big-input" value={form.problem} onChange={e=>setForm({...form,problem:e.target.value})} placeholder="예: 부산을 처음 찾은 외국인 관광객이 전통시장에서 메뉴를 이해하기 어려워 주문할 때 불편을 겪고 있다."/>
            <div className="formula">💡 <strong>문장 공식</strong>　[어떤 사람]이 [어떤 상황]에서 [무엇 때문에] 불편을 겪고 있다.</div>
            <div className="idea-hints"><b>막막하다면 이렇게 적어도 됩니다</b><span>“버스를 기다릴 때 시간이 안 보여 답답했다.”</span><span>“시장에 갔는데 처음 온 사람은 주문하기 어려워 보였다.”</span></div>
            <Nav onBack={()=>setStep(0)} disabled={!form.problem.trim()} onNext={analyzeProblem} nextLabel="AI로 문제 분석하기 ✨" />
          </MissionCard>}

          {step === 2 && <MissionCard icon="🧭" coach="아이디어보다 먼저 ‘진짜 문제’를 찾아야 해요. AI 분석을 팀 경험과 비교하고 틀린 부분은 직접 고쳐 주세요.">
            {loading ? <InlineLoading text="누가, 언제, 왜 불편한지 문제를 해부하고 있어요…"/> : discovery ? <>
              <div className="insight-grid">
                <Editable title="👥 가장 절실한 고객" value={discovery.customer} onChange={v=>setDiscovery({...discovery,customer:v})}/>
                <Editable title="📍 문제가 생기는 순간" value={discovery.situation} onChange={v=>setDiscovery({...discovery,situation:v})}/>
              </div>
              <label className="field-label tone-label">왜 이런 문제가 생길까요?</label>
              <div className="cause-list">{discovery.rootCauses.map((cause,i)=><label key={i}><b>{i+1}</b><input value={cause} onChange={e=>setDiscovery({...discovery,rootCauses:discovery.rootCauses.map((x,n)=>n===i?e.target.value:x)})}/></label>)}</div>
              <label className="field-label tone-label">우리 팀의 최종 문제 정의</label>
              <textarea className="big-input compact" value={discovery.problemStatement} onChange={e=>setDiscovery({...discovery,problemStatement:e.target.value})}/>
              <details className="validation-box"><summary>현장에서 확인할 질문 3개 보기</summary>{discovery.validationQuestions.map((q,i)=><p key={`${q}-${i}`}>{i+1}. {q}</p>)}</details>
              <Nav onBack={()=>setStep(1)} disabled={!discovery.problemStatement.trim()} onNext={generateSolutions} nextLabel="해결 아이디어 3개 만들기 →"/>
            </> : <><p className="error">{error}</p><button className="primary" onClick={analyzeProblem}>문제 다시 분석하기</button></>}
          </MissionCard>}

          {step === 3 && <MissionCard icon="💡" coach="정답 하나를 바로 찾지 말고, 접근 방식이 다른 세 가지 길을 비교해 보세요. 마음에 드는 안을 고른 뒤 팀의 말로 수정합니다.">
            {loading ? <InlineLoading text="디지털·사람 연결·체험 방식으로 해결안을 넓히고 있어요…"/> : <>
              <div className="candidate-grid">{solutionCandidates.map((candidate,i)=><button type="button" key={`${candidate.title}-${i}`} className={`candidate ${selectedCandidate===i?"selected":""}`} onClick={()=>chooseCandidate(candidate,i)}>
                <span>{i+1}안 · {candidate.type}</span><h3>{candidate.title}</h3><p>{candidate.description}</p><small><b>고객 변화</b>{candidate.value}</small><small><b>작은 실험</b>{candidate.feasibility}</small><strong>{selectedCandidate===i?"✓ 우리 팀 선택":"이 아이디어 선택"}</strong>
              </button>)}</div>
              {error && <p className="error">{error}</p>}
              <label className="field-label tone-label">선택한 해결 문장을 팀의 말로 다듬기</label>
              <textarea className="big-input compact" value={form.solution} onChange={e=>setForm({...form,solution:e.target.value})} placeholder="해결안을 선택해 주세요."/>
              <div className="formula">✅ <strong>선택 기준</strong>　고객이 정말 원하는가? · 우리 팀이 작게 시험할 수 있는가? · 기존 방식보다 나은가?</div>
              <label className="field-label tone-label">발표 분위기를 골라 주세요</label>
              <div className="tone-row">{(["따뜻하고 공감되게","재미있고 유쾌하게","전문적이고 설득력 있게"] as const).map(x=><button className={form.tone===x?"selected":""} onClick={()=>setForm({...form,tone:x})} key={x}>{x}</button>)}</div>
              <Nav onBack={()=>setStep(2)} disabled={!form.solution.trim()} onNext={createBusiness} nextLabel="선택안 AI로 사업화하기 ✨" />
            </>}
          </MissionCard>}

          {step === 4 && <div className="loading-card">
            <div className="loader">🤖</div><h2>AI 창업 코치가 사업 아이템을 설계하고 있어요</h2>
            <p>문제 근거 · 고객가치 · 차별점 · 수익모델 · 작은 실험 · 발표문을 연결하는 중</p><div className="loading-line"><i/></div>
            {error && <><p className="error">{error}</p><button className="primary" onClick={createBusiness}>다시 시도</button></>}
          </div>}

          {step === 5 && result && <div className="result-grid">
            <article className="result-main print-card">
              <div className="paper-head"><span>LOCAL HERO · BUSINESS ONE PAGE</span><b>{form.team}</b></div>
              <p className="result-label">우리 서비스 이름을 선택하세요</p>
              <div className="name-options">{result.serviceNames.map(n=><button key={n} onClick={()=>setSelectedName(n)} className={n===selectedName?"selected":""}>{n}</button>)}</div>
              <h2>{selectedName}</h2><blockquote>“{result.slogan}”</blockquote>
              <div className="summary-grid">
                <Editable title="👥 핵심 고객" value={result.customer} onChange={v=>setResult({...result,customer:v})}/>
                <Editable title="🔎 문제의 핵심" value={result.problemInsight} onChange={v=>setResult({...result,problemInsight:v})}/>
                <Editable title="💡 해결 방법" value={result.solution} onChange={v=>setResult({...result,solution:v})}/>
                <Editable title="✨ 우리만의 차별점" value={result.differentiator} onChange={v=>setResult({...result,differentiator:v})}/>
                <Editable title="💰 운영·수익모델" value={result.revenueModel} onChange={v=>setResult({...result,revenueModel:v})}/>
                <Editable title="🌱 지역사회 효과" value={result.localImpact} onChange={v=>setResult({...result,localImpact:v})}/>
                <Editable className="wide" title="🚀 행사가 끝난 뒤 첫 번째 실험" value={result.firstExperiment} onChange={v=>setResult({...result,firstExperiment:v})}/>
              </div>
              {result.demo && <p className="demo-note">연습 모드 결과입니다. AI 연결키를 설정하면 매번 새로운 맞춤 결과를 만듭니다.</p>}
            </article>
            <aside className="tool-card">
              <h3>팀의 말로 다듬어 보세요</h3><p>내용을 누르면 바로 수정할 수 있어요. AI의 답을 그대로 쓰지 않아도 됩니다.</p>
              <button className="primary full" onClick={()=>setStep(6)}>3분 발표 준비 →</button>
              <button className="back full" onClick={copyAll}>{copied ? "복사했어요 ✓" : "전체 내용 복사"}</button>
              <button className="back full" onClick={()=>window.print()}>사업 한 장 인쇄·PDF</button>
              <button className="text-button" onClick={()=>setStep(3)}>← 해결안 다시 비교하기</button>
            </aside>
          </div>}

          {step === 6 && result && <div className="result-grid">
            <article className="script-card">
              <span className="complete">📣 3분 발표 대본</span>
              <textarea value={result.pitch} onChange={e=>setResult({...result,pitch:e.target.value})}/>
              <div className="tip"><b>재미를 더하는 발표 방식</b><span>🎭 상황극</span><span>📺 뉴스 속보</span><span>🛍 홈쇼핑</span><span>🎤 투자 설명</span></div>
            </article>
            <aside className="qa-card">
              <h3>투자자가 물어볼 질문</h3>
              {result.qa.map((x,i)=><details key={i}><summary>{x.question}</summary><p>{x.answer}</p></details>)}
              <button className="primary full" onClick={()=>{setSeconds(180);setPresenting(true)}}>발표 모드 시작 ▶</button>
              <button className="back full" onClick={()=>setStep(5)}>← 사업 한 장 수정</button>
            </aside>
          </div>}
        </section>
      )}
    </main>
  );
}

function MissionCard({icon,coach,children}:{icon:string;coach:string;children:React.ReactNode}) {
  return <div className="mission-card"><aside><div>{icon}</div><b>AI 코치</b><p>{coach}</p><small>정답은 없어요. 팀원 모두의 경험을 들려주세요!</small></aside><section>{children}</section></div>
}
function Field({label,value,placeholder,onChange}:{label:string;value:string;placeholder:string;onChange:(v:string)=>void}) {
  return <label className="field"><span>{label}</span><input value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>
}
function Next({disabled,onClick}:{disabled:boolean;onClick:()=>void}) { return <div className="nav"><span/><button className="primary" disabled={disabled} onClick={onClick}>다음 미션 →</button></div> }
function Nav({onBack,onNext,disabled,nextLabel="다음 미션 →"}:{onBack:()=>void;onNext:()=>void;disabled:boolean;nextLabel?:string}) {
  return <div className="nav"><button className="back" onClick={onBack}>← 이전</button><button className="primary" disabled={disabled} onClick={onNext}>{nextLabel}</button></div>
}
function Editable({title,value,onChange,className=""}:{title:string;value:string;onChange:(v:string)=>void;className?:string}) {
  return <label className={`editable ${className}`}><b>{title}</b><textarea value={value} onChange={e=>onChange(e.target.value)}/><small>눌러서 수정</small></label>
}
function InlineLoading({text}:{text:string}) {
  return <div className="inline-loading"><div>🤖</div><b>{text}</b><span><i/></span></div>;
}
