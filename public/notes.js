// WFM 개념 노트 + 예상 면접질문 (쏘카 고객센터 WFM 매니저 공고 기준)
const NOTES_HTML = `
<h2>1. WFM의 기본 업무 흐름</h2>
<p>공고에 나온 4가지 업무(예측 → 인력계획/운영 → 비용관리 → 성과지표 관리)는 사실 하나의 순환 루프입니다. 면접에서 "WFM이 뭐라고 생각하세요?"라는 질문을 받으면 이 루프로 답하는 것이 정리하기 좋습니다.</p>
<div class="formula-box">인입 예측 (Forecast) → 필요인원 산정 (Capacity Plan) → 스케줄 편성 (Scheduling)
→ 실시간 관제 (Real-time Management) → 성과 분석 &amp; 피드백 (Reporting) → 다시 예측에 반영</div>

<h2>2. 핵심 지표 정의 &amp; 공식</h2>

<h3>예측 정확도 — MAPE / WAPE</h3>
<div class="formula-box">MAPE = AVG( |실제 - 예측| / 실제 ) × 100
WAPE = SUM( |실제 - 예측| ) / SUM( 실제 ) × 100   (인입량이 적은 구간의 왜곡을 줄여줌)</div>
<p>이 실습 DB의 <code>interval_volume</code> 테이블로 채널별/일자별 MAPE를 직접 계산해볼 수 있습니다. "SQL 연습문제" 탭 1번 카테고리를 참고하세요.</p>

<h3>서비스 레벨 (Service Level, SLA)</h3>
<div class="formula-box">서비스 레벨 = 목표 시간 내 응대 건수 / 전체 응대 건수 × 100
예: "60초 이내 응대율 80%" (Voice/Chat 업계 표준 표현: X초 in Y%)</div>
<p>채널마다 목표가 다릅니다 (채팅은 즉시성이 중요해 응답시간 기준이 짧고, 이메일은 긴 편). <code>sla_targets</code> 테이블에 채널별 목표가 들어있습니다.</p>

<h3>오큐펀시 (Occupancy) &amp; 유틸라이제이션</h3>
<div class="formula-box">Occupancy = 상담사가 콜/채팅을 실제로 처리한 시간 / 로그인(가용) 시간
※ 너무 높으면(90%+) 번아웃·품질저하, 너무 낮으면 비용 낭비 → 통상 80~85%가 타겟</div>

<h3>Shrinkage (근태 손실율)</h3>
<div class="formula-box">Shrinkage = (계획 근무시간 - 실제 상담 가능시간) / 계획 근무시간 × 100
구성요소: 휴가/병가/결근, 교육, 회의, 휴게시간, 시스템 장애 등</div>
<p>이 값이 커질수록 "필요인원 산정 시 shrinkage를 얼마나 buffer로 반영했는가"가 실제 서비스레벨 달성 여부를 좌우합니다. 실습 DB의 <code>interval_staffing</code>(scheduled_agents vs actual_agents)으로 계산할 수 있습니다.</p>

<h3>Erlang C (필요인원 산정 모델)</h3>
<p>인입량(Volume), 평균처리시간(AHT), 목표 서비스레벨을 입력하면 "몇 명이 있어야 그 목표를 달성할 수 있는지"를 확률적으로 계산해주는 큐잉이론 기반 모델입니다. 실무에서는 엑셀 Erlang 계산기나 WFM 솔루션(Genesys, NICE 등)이 자동 계산해주지만, <b>개념과 파라미터(볼륨/AHT/목표SL/shrinkage/occupancy)를 설명할 수 있어야</b> 합니다. 이 실습 DB에서는 정교한 Erlang C 대신 "필요초 ÷ (가용인원×인터벌초×목표점유율)" 형태의 단순 부하율(load ratio)로 과부족을 판단하는 문제를 넣어뒀습니다 (연습문제 2번 카테고리).</p>

<h3>기타 핵심 지표</h3>
<ul>
  <li><b>AHT (Average Handle Time)</b>: 상담 1건당 평균 처리시간 (대기시간 제외)</li>
  <li><b>ASA (Average Speed of Answer)</b>: 응대까지 걸린 평균 대기시간</li>
  <li><b>Abandon Rate</b>: 대기 중 이탈(포기)한 비율</li>
  <li><b>FCR (First Contact Resolution)</b>: 1회 접촉으로 해결된 비율 — 재문의를 줄여 인입 자체를 낮추는 핵심 지표</li>
  <li><b>Cost per Contact</b>: 인건비(+아웃소싱비) ÷ 처리건수</li>
</ul>

<h2>3. 비용관리 &amp; BPO 운영 포인트</h2>
<ul>
  <li>인건비 구조를 <b>정규직 vs BPO(아웃소싱) vs 파트타임</b>으로 나눠보고, 각각의 시간당 비용과 생산성(건당 처리량)을 비교하는 습관이 중요합니다.</li>
  <li>BPO는 물량 변동에 유연하게 대응(피크타임/시즌 증원)하는 데 강점이 있지만, 품질(CSAT/FCR) 관리와 계약 조건(볼륨 커미트먼트, 페널티, SLA 위반시 조항) 협상이 관건입니다.</li>
  <li>비용 리포트를 만들 때는 "표면 숫자"만 보지 말고 <b>원본 데이터(근무시간×시급)로 재검증</b>하는 습관이 신뢰도를 높입니다 (연습문제 3-4번 "비용 원장 검증" 참고).</li>
</ul>

<h2>4. 이 실습 DB의 데이터 구조 한눈에 보기</h2>
<p><code>interval_volume</code>(예측/실제 인입, AHT, 응대/포기 건수) · <code>interval_staffing</code>(계획/실제 근무인원) · <code>contacts</code>(티켓 단위 원본) · <code>shifts</code>·<code>agents</code>(스케줄/인력마스터) · <code>monthly_costs</code>(월별 비용) · <code>sla_targets</code>(채널별 목표). "데이터 스키마" 탭에서 전체 컬럼을 확인하세요.</p>

<h2>5. 예상 면접 질문 (기술 + 경험 기반)</h2>
<p>WFM 매니저는 SQL 실무 역량뿐 아니라 <b>실제 운영 경험과 의사결정 근거</b>를 검증받는 자리입니다. 경험 질문은 STAR(상황-과제-행동-결과) 구조로 1~2분 내로 답하는 연습을 해보세요.</p>

<div class="qa-item">
  <div class="q">Q1. 인입 예측이 크게 빗나갔던 경험이 있나요? 원인과 대응은?</div>
  <div class="a">이 실습 DB에는 예측 모델이 반영하지 못한 "프로모션 급증일"이 포함되어 있습니다 (SQL 연습문제 1-4번으로 직접 찾아보세요). 실제 경험을 이 구조(정상 패턴 vs 이벤트/시즌 변수로 인한 이탈)로 설명하면 설득력이 높습니다.</div>
</div>
<div class="qa-item">
  <div class="q">Q2. 서비스 레벨이 목표에 미달했을 때 어떻게 원인을 진단했나요?</div>
  <div class="a">"인력이 부족했다" 한 마디보다, 예측 오차/스케줄 미스매치/shrinkage 증가/특정 시간대 집중 부족 중 어디가 원인이었는지 데이터로 분해해서 설명하는 것이 좋습니다. 연습문제 2-2, 2-5번이 이런 분해 연습입니다.</div>
</div>
<div class="qa-item">
  <div class="q">Q3. 아웃소싱(BPO) 인력 운영이나 비용 협상 경험이 있나요?</div>
  <div class="a">볼륨 예측을 BPO와 어떻게 공유했는지, 품질(SLA/CSAT) 기준을 계약에 어떻게 반영했는지, 정산 근거(건당 단가 vs 시급제)를 어떻게 검증했는지를 구체적으로 준비하세요.</div>
</div>
<div class="qa-item">
  <div class="q">Q4. SQL/BigQuery로 어떤 대시보드나 리포트를 만들어봤나요?</div>
  <div class="a">단순 지표 나열보다 "그 지표로 어떤 의사결정을 했는지"까지 연결하세요. 예: "채널별 MAPE 대시보드로 주간 예측 모델 파라미터를 조정했다" 처럼.</div>
</div>
<div class="qa-item">
  <div class="q">Q5. 예측/스케줄링 업무를 자동화하거나 AI 도구(RPA, Claude 등)로 효율화한 경험이 있나요?</div>
  <div class="a">공고에서 우대사항으로 명시한 부분입니다. 반복적인 엑셀 작업을 스크립트/쿼리로 대체했거나, 이상치 탐지·보고서 초안 작성에 LLM을 활용한 경험이 있다면 준비하세요.</div>
</div>
<div class="qa-item">
  <div class="q">Q6. 쏘카 같은 카셰어링 서비스의 CS 인입은 어떤 변수의 영향을 많이 받을까요?</div>
  <div class="a">생각해볼 변수: 주말/공휴일 이용 급증, 여행 성수기, 신차종 출시/서비스 개편, 프로모션/쿠폰, 사고·보험 이슈, 반납 지연, 앱 장애. 이 실습 DB도 요일 패턴(주말↑)과 프로모션 급증일을 반영해 만들었습니다.</div>
</div>
<div class="qa-item">
  <div class="q">Q7. (실습) 이 데이터로 "이번 달 인력 운영 현황"을 3분 안에 브리핑해야 한다면 어떤 쿼리/지표를 준비하시겠어요?</div>
  <div class="a">권장 체크리스트: ① 채널별 서비스레벨 달성 여부 ② 예측 정확도(MAPE) ③ shrinkage율 상위 구간 ④ 팀/고용형태별 인건비와 건당 비용 ⑤ 문의 유형 TOP5(개선 포인트). "SQL 연습문제" 탭에서 각 카테고리 문제를 이어서 풀어보면 이 브리핑을 그대로 준비할 수 있습니다.</div>
</div>
<div class="qa-item">
  <div class="q">Q8. Genesys(제네시스) 같은 CX 솔루션을 다뤄본 경험이 있나요? 없다면 어떻게 답해야 할까요?</div>
  <div class="a">써본 적이 있다면 어떤 모듈(Forecast/Schedule/실시간 관제 화면)을 주로 썼고, 거기서 뽑은 데이터를 어떻게 가공했는지 구체적으로 말하세요. 안 써봤다면 솔직히 인정하되 "인터벌 단위 예측·스케줄·실시간 준수율(RTA)이라는 개념 자체는 도구가 달라도 동일하고, 실제로 채팅/전화 데이터를 이 개념으로 분석해봤다"는 식으로 개념 이해도를 강조하세요. 아래 6번 섹션의 용어 매핑표를 보면서 준비하면 좋습니다.</div>
</div>

<h2>6. 쏘카가 쓰는 CX 솔루션 — 제네시스(Genesys)</h2>
<p>쏘카 채용공고 우대사항에도 명시된 <b>Genesys Cloud CX</b>는 콜/채팅/이메일 등 옴니채널 상담을 처리하는 CCaaS(Contact Center as a Service) 플랫폼입니다. 그 안의 <b>WEM(Workforce Engagement Management)</b> 모듈이 예측·스케줄링·실시간 준수율(RTA) 기능을 제공합니다. SQL 실무에서는 보통 Genesys가 쌓은 원본 인터랙션 데이터를 BigQuery 등 DW로 내려받아(ETL) 분석하는 구조이기 때문에, "Genesys 화면에서 본 지표를 SQL로 검증/재가공한 경험"이 실무형 어필 포인트가 됩니다.</p>

<h3>Genesys 용어 ↔ 이 실습 DB 매핑</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0;">
  <tr style="background:#1d2740;"><th style="text-align:left;padding:6px 10px;color:#6ee7b7;">Genesys 용어</th><th style="text-align:left;padding:6px 10px;color:#6ee7b7;">의미</th><th style="text-align:left;padding:6px 10px;color:#6ee7b7;">이 실습 DB</th></tr>
  <tr><td style="padding:6px 10px;border-top:1px solid #2a3455;">Interaction</td><td style="padding:6px 10px;border-top:1px solid #2a3455;">고객과의 개별 상담 1건</td><td style="padding:6px 10px;border-top:1px solid #2a3455;"><code>contacts</code> 1행</td></tr>
  <tr><td style="padding:6px 10px;border-top:1px solid #2a3455;">Media Type</td><td style="padding:6px 10px;border-top:1px solid #2a3455;">Voice/Chat/Email 등 채널 구분</td><td style="padding:6px 10px;border-top:1px solid #2a3455;"><code>channel</code></td></tr>
  <tr><td style="padding:6px 10px;border-top:1px solid #2a3455;">Forecast (WEM)</td><td style="padding:6px 10px;border-top:1px solid #2a3455;">인터벌 단위 인입량/AHT 예측</td><td style="padding:6px 10px;border-top:1px solid #2a3455;"><code>interval_volume.forecast_volume / forecast_aht_sec</code></td></tr>
  <tr><td style="padding:6px 10px;border-top:1px solid #2a3455;">Schedule</td><td style="padding:6px 10px;border-top:1px solid #2a3455;">에이전트별 근무 스케줄</td><td style="padding:6px 10px;border-top:1px solid #2a3455;"><code>shifts</code></td></tr>
  <tr><td style="padding:6px 10px;border-top:1px solid #2a3455;">RTA (Real-Time Adherence)</td><td style="padding:6px 10px;border-top:1px solid #2a3455;">스케줄 대비 실제 근태 준수율 실시간 모니터링</td><td style="padding:6px 10px;border-top:1px solid #2a3455;"><code>interval_staffing.scheduled_agents</code> vs <code>actual_agents</code></td></tr>
  <tr><td style="padding:6px 10px;border-top:1px solid #2a3455;">Service Level</td><td style="padding:6px 10px;border-top:1px solid #2a3455;">목표시간 내 응대율</td><td style="padding:6px 10px;border-top:1px solid #2a3455;"><code>interval_volume.answered_within_target</code></td></tr>
  <tr><td style="padding:6px 10px;border-top:1px solid #2a3455;">Queue / Agent Group</td><td style="padding:6px 10px;border-top:1px solid #2a3455;">채널·팀별 상담 대기열/그룹</td><td style="padding:6px 10px;border-top:1px solid #2a3455;"><code>channel</code>, <code>agents.team</code></td></tr>
</table>
<p>실무에서 자주 나오는 표현도 챙겨두면 좋습니다: <b>Adherence(근태 준수율)</b> = RTA 화면에서 상담사가 스케줄대로 로그인/휴게를 지켰는지의 비율, <b>Conformance</b> = 하루 전체 근무시간 총량 준수 여부(시간대는 달라도 총량만 맞으면 인정). 이 실습 DB의 shifts.status(연차/병가/결근)와 interval_staffing의 scheduled vs actual 차이가 바로 이 개념을 SQL로 재현한 것입니다.</p>

<h2>7. 실전 팁</h2>
<ul>
  <li>SQL 문제를 풀 때 <b>결과 숫자 자체보다 "왜 이 지표를 이렇게 정의했는가"</b>를 말로 설명하는 연습을 함께 하세요. 면접관은 쿼리 문법보다 지표 설계 감각을 봅니다.</li>
  <li>경력 5년차 포지션이므로, 단순 실무 숙련도보다 <b>정책/기준을 개선한 경험</b>(예: shrinkage 산정 기준을 바꿔 서비스레벨을 몇 %p 개선)을 구체적 수치로 말할 수 있어야 합니다.</li>
  <li>장애인 우대 전형이 명시되어 있으니, 필요한 경우 편의 지원 요청 사항을 면접 전 채용 담당자에게 미리 안내받는 것도 좋습니다.</li>
  <li>Genesys를 직접 안 써봤다면 숨기지 말고, "개념(예측/스케줄/RTA)은 도구 불문 동일하다"는 전제로 이 실습 DB에서 연습한 내용을 근거로 자신 있게 설명하세요.</li>
</ul>
`;
