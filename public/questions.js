// 쏘카 WFM 매니저 면접 대비 SQL 연습문제 세트
// 각 문제는 실제 채용공고의 4대 업무(예측/인력계획/비용관리/성과지표)를 기준으로 분류했다.

const QUESTION_BANK = [
  {
    category: "1. 인입 예측 (Forecasting)",
    items: [
      {
        title: "채널별 일 평균 인입량",
        level: "쉬움",
        prompt:
          "채널(channel)별로 일자당 평균 실제 인입량(actual_volume 합계의 일 평균)을 구하세요. 큰 값 순으로 정렬합니다.",
        hint: "interval_volume을 (work_date, channel)로 먼저 GROUP BY 해서 일별 합계를 만들고, 그 결과를 다시 channel로 평균 내야 합니다. 서브쿼리 또는 CTE를 활용하세요.",
        solution: `WITH daily AS (
  SELECT work_date, channel, SUM(actual_volume) AS daily_volume
  FROM interval_volume
  GROUP BY work_date, channel
)
SELECT channel, ROUND(AVG(daily_volume), 1) AS avg_daily_volume
FROM daily
GROUP BY channel
ORDER BY avg_daily_volume DESC;`,
      },
      {
        title: "요일별 인입 패턴",
        level: "쉬움",
        prompt:
          "요일별(월~일) 채팅 채널의 평균 인입량을 구하세요. SQLite의 strftime('%w', work_date)는 0=일요일 ~ 6=토요일을 반환합니다.",
        hint: "strftime('%w', work_date)로 요일 숫자를 뽑고, CASE 문으로 한글 요일명으로 매핑하세요.",
        solution: `SELECT
  CASE strftime('%w', work_date)
    WHEN '0' THEN '일' WHEN '1' THEN '월' WHEN '2' THEN '화'
    WHEN '3' THEN '수' WHEN '4' THEN '목' WHEN '5' THEN '금'
    WHEN '6' THEN '토' END AS dow,
  ROUND(AVG(actual_volume), 1) AS avg_volume
FROM interval_volume
WHERE channel = '채팅'
GROUP BY strftime('%w', work_date)
ORDER BY strftime('%w', work_date);`,
      },
      {
        title: "예측 오차(MAPE) 계산",
        level: "중간",
        prompt:
          "채널별 예측 정확도를 MAPE(Mean Absolute Percentage Error)로 계산하세요. MAPE = 평균(|실제-예측|/실제) * 100. actual_volume=0인 인터벌은 제외합니다.",
        hint: "ABS(actual_volume - forecast_volume) * 1.0 / actual_volume 을 먼저 계산한 뒤 AVG. 0으로 나누기를 WHERE로 방지하세요.",
        solution: `SELECT channel,
  ROUND(AVG(ABS(actual_volume - forecast_volume) * 1.0 / actual_volume) * 100, 1) AS mape_pct
FROM interval_volume
WHERE actual_volume > 0
GROUP BY channel
ORDER BY mape_pct DESC;`,
      },
      {
        title: "예측 오차가 가장 컸던 날 TOP 5",
        level: "중간",
        prompt:
          "일자별 전체 채널 합산 기준으로, 예측치 대비 실제치 오차율(|실제-예측|/예측)이 가장 컸던 날짜 TOP 5를 구하세요. (프로모션/이벤트로 예측이 빗나간 날을 찾는 문제입니다.)",
        hint: "work_date로 GROUP BY 해서 SUM(forecast_volume), SUM(actual_volume)을 구한 뒤 오차율을 계산, ORDER BY ... DESC LIMIT 5.",
        solution: `SELECT work_date,
  SUM(forecast_volume) AS forecast_total,
  SUM(actual_volume) AS actual_total,
  ROUND(ABS(SUM(actual_volume) - SUM(forecast_volume)) * 1.0 / SUM(forecast_volume) * 100, 1) AS error_pct
FROM interval_volume
GROUP BY work_date
ORDER BY error_pct DESC
LIMIT 5;`,
      },
      {
        title: "인터벌(시간대)별 인입 비중 곡선",
        level: "중간",
        prompt:
          "채팅 채널의 30분 인터벌(interval_start)별 실제 인입량 비중(%)을 구해 하루 중 피크 타임을 찾으세요. 전체 대비 각 인터벌의 비중 합이 100%가 되어야 합니다.",
        hint: "전체 합계는 윈도우 함수 SUM() OVER() 또는 서브쿼리로 구하고, 인터벌별 합계를 나눠 비중을 계산하세요.",
        solution: `SELECT interval_start,
  SUM(actual_volume) AS volume,
  ROUND(100.0 * SUM(actual_volume) / SUM(SUM(actual_volume)) OVER (), 2) AS pct_of_day
FROM interval_volume
WHERE channel = '채팅'
GROUP BY interval_start
ORDER BY interval_start;`,
      },
    ],
  },
  {
    category: "2. 인력 계획 및 운영 (Capacity & Scheduling)",
    items: [
      {
        title: "스케줄 대비 실제 근무자 갭(Shrinkage)",
        level: "쉬움",
        prompt:
          "날짜/인터벌별로 계획 인원(scheduled_agents) 대비 실제 근무 가능 인원(actual_agents)의 차이와 shrinkage율(%)을 구하세요. shrinkage율이 가장 높은 상위 10개 인터벌을 보여주세요.",
        hint: "shrinkage% = (scheduled - actual) / scheduled * 100",
        solution: `SELECT work_date, interval_start, scheduled_agents, actual_agents,
  ROUND((scheduled_agents - actual_agents) * 100.0 / scheduled_agents, 1) AS shrinkage_pct
FROM interval_staffing
WHERE scheduled_agents > 0
ORDER BY shrinkage_pct DESC
LIMIT 10;`,
      },
      {
        title: "필요 인원 대비 과부족 인터벌 찾기",
        level: "어려움",
        prompt:
          "인터벌별 총 필요초(Σ actual_volume * actual_aht_sec, 전 채널 합산)를 가용 캐파(actual_agents * 1800초 * 목표 점유율 85%)로 나눈 값을 '부하율(load ratio)'로 정의하세요. 부하율이 1.0을 넘는(=인력 부족) 인터벌 수를 날짜별로 집계하세요.",
        hint: "interval_volume을 (work_date, interval_start)로 먼저 채널 합산한 뒤 interval_staffing과 JOIN하세요.",
        solution: `WITH demand AS (
  SELECT work_date, interval_start, SUM(actual_volume * actual_aht_sec) AS load_sec
  FROM interval_volume
  GROUP BY work_date, interval_start
)
SELECT d.work_date, COUNT(*) AS understaffed_intervals
FROM demand d
JOIN interval_staffing s
  ON s.work_date = d.work_date AND s.interval_start = d.interval_start
WHERE d.load_sec * 1.0 / (s.actual_agents * 1800 * 0.85) > 1.0
GROUP BY d.work_date
ORDER BY understaffed_intervals DESC
LIMIT 15;`,
      },
      {
        title: "팀별/고용형태별 인원 구성",
        level: "쉬움",
        prompt:
          "팀(team)과 고용형태(employment_type)별 인원수와 평균 시급을 구하세요.",
        hint: "agents 테이블만으로 충분합니다.",
        solution: `SELECT team, employment_type, COUNT(*) AS headcount,
  ROUND(AVG(hourly_cost_krw)) AS avg_hourly_cost
FROM agents
GROUP BY team, employment_type
ORDER BY team;`,
      },
      {
        title: "결근/연차/병가로 인한 손실 근무시간",
        level: "중간",
        prompt:
          "상태(status)가 '근무'가 아닌(연차/병가/결근) shift가 가장 많은 상위 10명의 agent를 이름과 함께 구하세요.",
        hint: "shifts와 agents를 JOIN하고 status <> '근무' 조건으로 필터링, agent_id로 COUNT.",
        solution: `SELECT a.name, a.team, s.status, COUNT(*) AS cnt
FROM shifts s
JOIN agents a ON a.agent_id = s.agent_id
WHERE s.status != '근무'
GROUP BY a.agent_id, s.status
ORDER BY cnt DESC
LIMIT 10;`,
      },
      {
        title: "요일 x 인터벌 필요인원 히트맵 데이터",
        level: "어려움",
        prompt:
          "요일별 x 인터벌별 평균 부하율(위 문제의 정의 재사용: 총필요초 / (actual_agents*1800*0.85))을 구해 스케줄 재편성의 근거 데이터를 만드세요.",
        hint: "먼저 CTE로 일자/인터벌별 load_sec와 부하율을 만들고, 거기에 요일을 붙여 다시 AVG.",
        solution: `WITH demand AS (
  SELECT work_date, interval_start, SUM(actual_volume * actual_aht_sec) AS load_sec
  FROM interval_volume GROUP BY work_date, interval_start
),
ratio AS (
  SELECT d.work_date, d.interval_start,
    d.load_sec * 1.0 / (s.actual_agents * 1800 * 0.85) AS load_ratio
  FROM demand d
  JOIN interval_staffing s
    ON s.work_date = d.work_date AND s.interval_start = d.interval_start
)
SELECT
  CASE strftime('%w', work_date)
    WHEN '0' THEN '일' WHEN '1' THEN '월' WHEN '2' THEN '화'
    WHEN '3' THEN '수' WHEN '4' THEN '목' WHEN '5' THEN '금'
    WHEN '6' THEN '토' END AS dow,
  interval_start,
  ROUND(AVG(load_ratio), 2) AS avg_load_ratio
FROM ratio
GROUP BY dow, interval_start
ORDER BY dow, interval_start;`,
      },
    ],
  },
  {
    category: "3. 비용 관리 (Cost Management)",
    items: [
      {
        title: "월별 총 인건비",
        level: "쉬움",
        prompt: "월(month)별 전체 인건비 합계와 전월 대비 증감액을 구하세요.",
        hint: "LAG() 윈도우 함수로 이전 행(전월) 값을 가져올 수 있습니다.",
        solution: `WITH m AS (
  SELECT month, SUM(labor_cost_krw) AS total_cost
  FROM monthly_costs GROUP BY month
)
SELECT month, total_cost,
  total_cost - LAG(total_cost) OVER (ORDER BY month) AS mom_change
FROM m
ORDER BY month;`,
      },
      {
        title: "건당 처리 비용 (Cost per Contact)",
        level: "중간",
        prompt:
          "팀별로 '건당 처리 비용' = 월 인건비 / 해당 팀 agent가 처리한 상담 건수(resolved=1) 를 구하세요. 9월(2026-09) 기준으로 계산합니다.",
        hint: "contacts를 agent_id로 agents와 JOIN해 팀별 처리건수를 구하고, monthly_costs와 team+month로 JOIN하세요.",
        solution: `WITH handled AS (
  SELECT a.team, COUNT(*) AS resolved_cnt
  FROM contacts c
  JOIN agents a ON a.agent_id = c.agent_id
  WHERE c.resolved = 1 AND substr(c.work_date,1,7) = '2026-09'
  GROUP BY a.team
)
SELECT mc.team, mc.labor_cost_krw, h.resolved_cnt,
  ROUND(mc.labor_cost_krw * 1.0 / h.resolved_cnt) AS cost_per_contact
FROM monthly_costs mc
JOIN handled h ON h.team = mc.team
WHERE mc.month = '2026-09';`,
      },
      {
        title: "정규직 vs BPO 시간당 생산성 비교",
        level: "어려움",
        prompt:
          "고용형태(employment_type)별로 '근무 1시간당 처리 건수'를 구하세요. (해당 고용형태 agent들이 처리한 resolved=1 건수 합계) / (해당 고용형태 shifts의 총 근무시간 합계).",
        hint: "worked_hours는 monthly_costs에 이미 집계되어 있습니다. 이를 employment_type별로 다시 합산해 재사용하세요.",
        solution: `WITH hrs AS (
  SELECT employment_type, SUM(worked_hours) AS total_hours
  FROM monthly_costs GROUP BY employment_type
),
handled AS (
  SELECT a.employment_type, COUNT(*) AS resolved_cnt
  FROM contacts c
  JOIN agents a ON a.agent_id = c.agent_id
  WHERE c.resolved = 1
  GROUP BY a.employment_type
)
SELECT h.employment_type, h.resolved_cnt, ROUND(hrs.total_hours,1) AS total_hours,
  ROUND(h.resolved_cnt / hrs.total_hours, 2) AS contacts_per_hour
FROM handled h
JOIN hrs ON hrs.employment_type = h.employment_type
ORDER BY contacts_per_hour DESC;`,
      },
      {
        title: "비용 원장 검증 (Raw Data Reconciliation)",
        level: "어려움",
        prompt:
          "monthly_costs 테이블의 labor_cost_krw 값이 shifts+agents 원본 데이터로 재계산한 값과 일치하는지 검증하는 쿼리를 작성하세요. 차이가 있는 행이 있다면 함께 출력하세요.",
        hint: "shifts에서 근무시간(분)을 계산 → 시간으로 환산 후 hourly_cost_krw를 곱해 재계산, monthly_costs와 LEFT JOIN 후 차액 계산.",
        solution: `WITH recompute AS (
  SELECT substr(s.work_date,1,7) AS month, a.team, a.employment_type,
    ROUND(SUM(
      ((CAST(substr(s.shift_end,1,2) AS INT)*60 + CAST(substr(s.shift_end,4,2) AS INT))
      -(CAST(substr(s.shift_start,1,2) AS INT)*60 + CAST(substr(s.shift_start,4,2) AS INT))
      - s.break_minutes) / 60.0 * a.hourly_cost_krw
    )) AS recomputed_cost
  FROM shifts s
  JOIN agents a ON a.agent_id = s.agent_id
  WHERE s.status = '근무'
  GROUP BY month, a.team, a.employment_type
)
SELECT mc.month, mc.team, mc.employment_type, mc.labor_cost_krw, r.recomputed_cost,
  mc.labor_cost_krw - r.recomputed_cost AS diff
FROM monthly_costs mc
JOIN recompute r
  ON r.month = mc.month AND r.team = mc.team AND r.employment_type = mc.employment_type
WHERE mc.labor_cost_krw != r.recomputed_cost;
-- 결과가 0건이면 두 계산 방식이 완전히 일치한다는 뜻입니다.`,
      },
    ],
  },
  {
    category: "4. 성과 지표 관리 & 데이터 기반 개선",
    items: [
      {
        title: "채널별 서비스 레벨(SLA) 달성률",
        level: "쉬움",
        prompt:
          "채널별로 실제 서비스레벨(목표시간 내 응대율 = answered_within_target/answered_calls)을 구하고, sla_targets의 목표치와 비교해 달성 여부(달성/미달)를 표시하세요.",
        hint: "interval_volume을 channel로 GROUP BY 한 뒤 sla_targets와 JOIN.",
        solution: `SELECT iv.channel,
  ROUND(100.0*SUM(iv.answered_within_target)/SUM(iv.answered_calls), 1) AS actual_sl_pct,
  ROUND(t.target_service_level_pct*100, 1) AS target_sl_pct,
  CASE WHEN SUM(iv.answered_within_target)*1.0/SUM(iv.answered_calls) >= t.target_service_level_pct
       THEN '달성' ELSE '미달' END AS status
FROM interval_volume iv
JOIN sla_targets t ON t.channel = iv.channel
GROUP BY iv.channel;`,
      },
      {
        title: "상담사별 CSAT/처리건수 랭킹",
        level: "중간",
        prompt:
          "상담사별 평균 CSAT과 총 처리건수(resolved=1)를 구하고, 처리건수 20건 이상인 상담사 중 CSAT 상위 10명을 구하세요.",
        hint: "HAVING 절로 최소 처리건수 조건을 겁니다.",
        solution: `SELECT a.name, a.team, COUNT(*) AS resolved_cnt, ROUND(AVG(c.csat_score),2) AS avg_csat
FROM contacts c
JOIN agents a ON a.agent_id = c.agent_id
WHERE c.resolved = 1
GROUP BY a.agent_id
HAVING resolved_cnt >= 20
ORDER BY avg_csat DESC
LIMIT 10;`,
      },
      {
        title: "First Contact Resolution(FCR) 추이",
        level: "중간",
        prompt: "주차(week)별 FCR율 추이를 구하세요. SQLite의 strftime('%Y-%W', work_date)로 주차를 만들 수 있습니다.",
        hint: "resolved=1인 건 중 first_contact_resolution=1 비율.",
        solution: `SELECT strftime('%Y-%W', work_date) AS week,
  ROUND(100.0*SUM(first_contact_resolution)/SUM(resolved), 1) AS fcr_pct
FROM contacts
GROUP BY week
ORDER BY week;`,
      },
      {
        title: "문의 카테고리(Pain Point) TOP 5",
        level: "쉬움",
        prompt: "문의 카테고리(category)별 건수와 전체 대비 비중을 구해 TOP 5를 뽑으세요.",
        hint: "COUNT(*)와 전체 합 대비 비율을 함께 구합니다.",
        solution: `SELECT category, COUNT(*) AS cnt,
  ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM contacts), 1) AS pct
FROM contacts
GROUP BY category
ORDER BY cnt DESC
LIMIT 5;`,
      },
      {
        title: "포기율(Abandon Rate)과 대기시간의 관계",
        level: "어려움",
        prompt:
          "채널별로 응대된(비포기) 콜의 평균 대기시간(wait_sec)과, 그 인터벌들의 포기율(abandon rate)을 함께 구해 대기시간이 길어질수록 포기율이 올라가는지 확인하는 쿼리를 작성하세요. (인터벌 단위로 평균 대기시간을 구간화해서 그룹핑)",
        hint: "answered 건들의 평균 wait_sec을 10초 단위 구간(bucket)으로 나눈 뒤, 같은 인터벌의 abandoned_calls/actual_volume과 연결하는 것이 핵심입니다. CASE로 구간을 만들어 보세요.",
        solution: `WITH answered_wait AS (
  SELECT work_date, interval_start, channel, AVG(wait_sec) AS avg_wait
  FROM contacts
  WHERE abandoned = 0
  GROUP BY work_date, interval_start, channel
),
joined AS (
  SELECT aw.channel, aw.avg_wait, iv.abandoned_calls, iv.actual_volume
  FROM answered_wait aw
  JOIN interval_volume iv
    ON iv.work_date = aw.work_date AND iv.interval_start = aw.interval_start AND iv.channel = aw.channel
)
SELECT channel,
  CASE
    WHEN avg_wait < 30 THEN '0-30s'
    WHEN avg_wait < 60 THEN '30-60s'
    WHEN avg_wait < 120 THEN '60-120s'
    ELSE '120s+'
  END AS wait_bucket,
  ROUND(100.0*SUM(abandoned_calls)/SUM(actual_volume), 1) AS abandon_rate_pct,
  COUNT(*) AS n_intervals
FROM joined
GROUP BY channel, wait_bucket
ORDER BY channel, wait_bucket;`,
      },
    ],
  },
];
