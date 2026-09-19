#!/usr/bin/env python3
"""
쏘카 WFM 매니저 면접 대비용 연습 데이터 생성기.

Channeltalk류 CS 인입 데이터를 흉내 낸 가상의 SQLite DB를 만든다.
현실의 카셰어링 CS 센터를 상정해:
  - 채널(채팅/전화/이메일)별 인입량 예측치 vs 실적치
  - 30분 인터벌 단위 스케줄(근무자수) vs 실제 근무자수(결근/연차 반영)
  - 티켓(문의) 단위 원본 데이터 (대기시간/처리시간/CSAT/카테고리)
  - SLA 목표, 월별 인건비/아웃소싱 비용
을 생성해 예측 정확도, 서비스레벨, 오큐펀시/shrinkage, 인력 운영 비용 등을
SQL로 직접 계산해볼 수 있게 한다.

재현성을 위해 random.seed 고정. 외부 패키지 없이 표준 라이브러리만 사용.
"""
import math
import random
import sqlite3
from datetime import date, timedelta, datetime

random.seed(42)

DB_PATH = "public/channeltalk.db"
END_DATE = date(2026, 9, 18)  # 오늘(2026-09-19) 기준 어제까지
DAYS = 60
START_DATE = END_DATE - timedelta(days=DAYS - 1)

CHANNELS = ["채팅", "전화", "이메일"]
BASE_DAILY_VOLUME = {"채팅": 320, "전화": 140, "이메일": 70}
BASE_AHT = {"채팅": 380, "전화": 280, "이메일": 520}  # seconds

DOW_MULT = {0: 1.15, 1: 0.95, 2: 0.90, 3: 0.95, 4: 1.05, 5: 1.35, 6: 1.25}  # Mon..Sun

INTERVAL_MINUTES = 30
DAY_START_HOUR = 9
DAY_END_HOUR = 21  # exclusive
N_INTERVALS = (DAY_END_HOUR - DAY_START_HOUR) * 60 // INTERVAL_MINUTES

CATEGORIES = ["예약/변경", "결제/환불", "차량 문제", "사고/보험", "이용방법", "쏘카존/반납", "기타"]

SHIFT_TEMPLATES = {
    "T1": ("09:00", "18:00", "12:00", "13:00"),   # FT 오전
    "T2": ("10:00", "19:00", "13:00", "14:00"),   # FT 오전~오후
    "T3": ("12:00", "21:00", "17:00", "18:00"),   # FT 오후~마감
    "T4": ("13:00", "21:00", "16:30", "17:00"),   # BPO 오후 (짧은 휴게)
    "T5": ("09:00", "15:00", None, None),          # 파트타임 오전
    "T6": ("15:00", "21:00", None, None),          # 파트타임 오후
}

KOREAN_SURNAMES = list("김이박최정강조윤장임")
KOREAN_GIVEN = ["민준", "서연", "지훈", "수아", "도윤", "하은", "예준", "지우", "시우", "채원",
                "준서", "다은", "우진", "나은", "현우", "소율", "건우", "유나", "승현", "지민"]


def time_to_minutes(hhmm):
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def interval_labels():
    labels = []
    for i in range(N_INTERVALS):
        total_min = DAY_START_HOUR * 60 + i * INTERVAL_MINUTES
        h, m = divmod(total_min, 60)
        labels.append(f"{h:02d}:{m:02d}")
    return labels


INTERVALS = interval_labels()


def intraday_weights():
    """두 개의 피크(점심 11~13시, 저녁 18~20시)를 갖는 인입 비중 곡선."""
    weights = []
    for lbl in INTERVALS:
        hour = time_to_minutes(lbl) / 60
        w = 0.35
        w += 1.0 * math.exp(-((hour - 12.0) ** 2) / (2 * 1.3 ** 2))
        w += 1.3 * math.exp(-((hour - 19.0) ** 2) / (2 * 1.5 ** 2))
        weights.append(w)
    total = sum(weights)
    return [w / total for w in weights]


INTRADAY_WEIGHTS = intraday_weights()

# 프로모션/이벤트로 인입이 튀는 날 (예측 모델이 반영하지 못한 변수 사례용)
ALL_DATES = [START_DATE + timedelta(days=i) for i in range(DAYS)]
PROMO_DATES = set(random.sample(ALL_DATES, 6))


def build_agents(conn):
    agents = []
    agent_id = 1
    # 정규직 15명 (팀A, 주로 T1/T2/T3), BPO 15명 (팀B, 주로 T3/T4), 파트타임 6명 (팀C, T5/T6)
    roster_plan = (
        [("정규직", "A팀", "T1") for _ in range(6)]
        + [("정규직", "A팀", "T2") for _ in range(5)]
        + [("정규직", "A팀", "T3") for _ in range(4)]
        + [("BPO", "B팀", "T3") for _ in range(6)]
        + [("BPO", "B팀", "T4") for _ in range(9)]
        + [("파트타임", "C팀", "T5") for _ in range(3)]
        + [("파트타임", "C팀", "T6") for _ in range(3)]
    )
    random.shuffle(roster_plan)

    for emp_type, team, template in roster_plan:
        name = random.choice(KOREAN_SURNAMES) + random.choice(KOREAN_GIVEN)
        skill = random.choices([1, 2, 3], weights=[0.25, 0.45, 0.30])[0]
        if emp_type == "정규직":
            hourly_cost = random.randint(16000, 21000)
        elif emp_type == "BPO":
            hourly_cost = random.randint(12500, 15500)
        else:
            hourly_cost = random.randint(11000, 13500)
        hire_date = START_DATE - timedelta(days=random.randint(30, 900))
        # 주 2일 고정 휴무 (요일 인덱스 0=월 ... 6=일), agent_id 기반으로 분산
        off1 = agent_id % 7
        off2 = (agent_id * 3 + 2) % 7
        off_days = {off1, off2} if off1 != off2 else {off1, (off1 + 3) % 7}

        agents.append({
            "agent_id": agent_id,
            "name": name,
            "team": team,
            "employment_type": emp_type,
            "hire_date": hire_date.isoformat(),
            "skill_level": skill,
            "hourly_cost_krw": hourly_cost,
            "template": template,
            "off_days": off_days,
        })
        agent_id += 1

    conn.executemany(
        "INSERT INTO agents (agent_id, name, team, employment_type, hire_date, skill_level, hourly_cost_krw) "
        "VALUES (:agent_id, :name, :team, :employment_type, :hire_date, :skill_level, :hourly_cost_krw)",
        agents,
    )
    return agents


def build_shifts(conn, agents):
    shift_rows = []
    shift_id = 1
    for d in ALL_DATES:
        weekday = d.weekday()
        for a in agents:
            if weekday in a["off_days"]:
                continue
            start, end, brk_start, brk_end = SHIFT_TEMPLATES[a["template"]]
            break_minutes = 60 if brk_start and a["template"] != "T4" else (30 if brk_start else 0)

            status = "근무"
            roll = random.random()
            if roll < 0.03:
                status = "연차"
            elif roll < 0.05:
                status = "병가"
            elif roll < 0.06:
                status = "결근"

            shift_rows.append({
                "shift_id": shift_id,
                "agent_id": a["agent_id"],
                "work_date": d.isoformat(),
                "shift_start": start,
                "shift_end": end,
                "break_start": brk_start,
                "break_end": brk_end,
                "break_minutes": break_minutes,
                "status": status,
            })
            shift_id += 1

    conn.executemany(
        "INSERT INTO shifts (shift_id, agent_id, work_date, shift_start, shift_end, break_start, break_end, "
        "break_minutes, status) VALUES (:shift_id, :agent_id, :work_date, :shift_start, :shift_end, "
        ":break_start, :break_end, :break_minutes, :status)",
        shift_rows,
    )
    return shift_rows


def interval_covered(interval_label, start, end):
    t = time_to_minutes(interval_label)
    return time_to_minutes(start) <= t < time_to_minutes(end)


def on_break(interval_label, brk_start, brk_end):
    if not brk_start:
        return False
    t = time_to_minutes(interval_label)
    return time_to_minutes(brk_start) <= t < time_to_minutes(brk_end)


def build_staffing(conn, shift_rows):
    """날짜/인터벌별 scheduled_agents(계획) vs actual_agents(휴게 제외 + 결근/연차/병가 반영)."""
    by_date = {}
    for s in shift_rows:
        by_date.setdefault(s["work_date"], []).append(s)

    rows = []
    for d in ALL_DATES:
        ds = d.isoformat()
        day_shifts = by_date.get(ds, [])
        for lbl in INTERVALS:
            scheduled = sum(1 for s in day_shifts if interval_covered(lbl, s["shift_start"], s["shift_end"]))
            actual = sum(
                1 for s in day_shifts
                if s["status"] == "근무"
                and interval_covered(lbl, s["shift_start"], s["shift_end"])
                and not on_break(lbl, s["break_start"], s["break_end"])
            )
            rows.append((ds, lbl, scheduled, actual))

    conn.executemany(
        "INSERT INTO interval_staffing (work_date, interval_start, scheduled_agents, actual_agents) "
        "VALUES (?, ?, ?, ?)",
        rows,
    )


def build_volume(conn):
    """채널별 예측 인입량/실제 인입량, 예측 AHT/실제 AHT."""
    rows = []
    for d in ALL_DATES:
        dow_mult = DOW_MULT[d.weekday()]
        is_promo = d in PROMO_DATES
        for ch in CHANNELS:
            daily_base = BASE_DAILY_VOLUME[ch]
            for i, lbl in enumerate(INTERVALS):
                w = INTRADAY_WEIGHTS[i]
                planned = daily_base * dow_mult * w  # 예측 모델이 아는 패턴(요일+시간대)
                forecast_volume = max(0, round(planned + random.gauss(0, planned * 0.05)))

                actual_mult = random.gauss(1.0, 0.10)
                if is_promo:
                    actual_mult *= random.uniform(1.5, 2.0)  # 예측이 반영 못한 프로모션 효과
                actual_volume = max(0, round(planned * actual_mult))

                forecast_aht = BASE_AHT[ch]
                actual_aht = max(60, round(random.gauss(BASE_AHT[ch], BASE_AHT[ch] * 0.15)))

                rows.append({
                    "work_date": d.isoformat(),
                    "interval_start": lbl,
                    "channel": ch,
                    "forecast_volume": forecast_volume,
                    "actual_volume": actual_volume,
                    "forecast_aht_sec": forecast_aht,
                    "actual_aht_sec": actual_aht,
                })

    conn.executemany(
        "INSERT INTO interval_volume (work_date, interval_start, channel, forecast_volume, actual_volume, "
        "forecast_aht_sec, actual_aht_sec, answered_calls, abandoned_calls, answered_within_target) "
        "VALUES (:work_date, :interval_start, :channel, :forecast_volume, :actual_volume, "
        ":forecast_aht_sec, :actual_aht_sec, 0, 0, 0)",
        rows,
    )
    return rows


SLA_TARGET_SEC = {"채팅": 60, "전화": 30, "이메일": 3600}


def service_level_bucket(pressure):
    """offered load / capacity 근사치에 따른 (서비스레벨, 포기율) 근사."""
    if pressure <= 0.75:
        return random.uniform(0.92, 0.97), random.uniform(0.01, 0.02)
    if pressure <= 0.90:
        return random.uniform(0.78, 0.90), random.uniform(0.03, 0.06)
    if pressure <= 1.05:
        return random.uniform(0.55, 0.75), random.uniform(0.08, 0.15)
    return random.uniform(0.30, 0.55), random.uniform(0.15, 0.30)


def build_answer_abandon_and_contacts(conn, agents):
    """interval_staffing의 actual_agents 대비 부하로 응대율/포기율을 정하고,
    그 결과로 answered/abandoned 건수를 채운 뒤 티켓 단위 contacts를 생성한다."""
    cur = conn.cursor()
    cur.execute(
        "SELECT work_date, interval_start, actual_agents FROM interval_staffing"
    )
    staffing = {(r[0], r[1]): r[2] for r in cur.fetchall()}

    cur.execute(
        "SELECT rowid, work_date, interval_start, channel, actual_volume, actual_aht_sec FROM interval_volume"
    )
    vol_rows = cur.fetchall()

    # 날짜+인터벌 단위로 채널 합산 부하 계산
    demand_by_slot = {}
    for _, wd, itv, ch, actual_volume, actual_aht in vol_rows:
        key = (wd, itv)
        demand_by_slot.setdefault(key, 0)
        demand_by_slot[key] += actual_volume * actual_aht

    pressure_by_slot = {}
    for key, load_sec in demand_by_slot.items():
        agents_present = max(1, staffing.get(key, 1))
        capacity_sec = agents_present * INTERVAL_MINUTES * 60 * 0.85  # target occupancy 85%
        pressure_by_slot[key] = load_sec / capacity_sec

    # 근무 중 & 해당 인터벌에 휴게가 아닌 agent 목록 (contacts 배정용)
    cur.execute(
        "SELECT agent_id, work_date, shift_start, shift_end, break_start, break_end, status FROM shifts"
    )
    shift_rows = cur.fetchall()
    working_by_slot = {}
    for agent_id, wd, s_start, s_end, b_start, b_end, status in shift_rows:
        if status != "근무":
            continue
        for lbl in INTERVALS:
            if interval_covered(lbl, s_start, s_end) and not on_break(lbl, b_start, b_end):
                working_by_slot.setdefault((wd, lbl), []).append(agent_id)

    agent_skill = {a["agent_id"]: a["skill_level"] for a in agents}

    update_rows = []
    contact_rows = []
    contact_id = 1

    for rowid, wd, itv, ch, actual_volume, actual_aht in vol_rows:
        pressure = pressure_by_slot.get((wd, itv), 1.0)
        sl_frac, ab_frac = service_level_bucket(pressure)
        # 채널별 약간의 변동
        sl_frac = min(0.99, max(0.05, sl_frac + random.uniform(-0.03, 0.03)))
        ab_frac = min(0.6, max(0.0, ab_frac + random.uniform(-0.02, 0.02)))

        abandoned = round(actual_volume * ab_frac)
        answered = actual_volume - abandoned
        answered_within_target = round(answered * sl_frac)

        update_rows.append((answered, abandoned, answered_within_target, rowid))

        pool = working_by_slot.get((wd, itv), [])
        target_sec = SLA_TARGET_SEC[ch]

        for _ in range(max(0, answered)):
            agent_id = random.choice(pool) if pool else None
            if sl_frac >= 0.9:
                wait_sec = max(1, round(random.expovariate(1 / (target_sec * 0.35))))
            elif sl_frac >= 0.7:
                wait_sec = max(1, round(random.expovariate(1 / (target_sec * 0.7))))
            else:
                wait_sec = max(1, round(random.expovariate(1 / (target_sec * 1.6))))
            handle_sec = max(30, round(random.gauss(actual_aht, actual_aht * 0.25)))
            resolved = 1 if random.random() < 0.95 else 0
            fcr = 1 if resolved and random.random() < 0.78 else 0
            if resolved:
                csat = random.choices([5, 4, 3, 2, 1], weights=[0.42, 0.30, 0.15, 0.08, 0.05])[0]
            else:
                csat = random.choices([3, 2, 1], weights=[0.3, 0.4, 0.3])[0]
            contact_rows.append({
                "contact_id": contact_id,
                "work_date": wd,
                "interval_start": itv,
                "channel": ch,
                "agent_id": agent_id,
                "wait_sec": wait_sec,
                "handle_sec": handle_sec,
                "resolved": resolved,
                "first_contact_resolution": fcr,
                "csat_score": csat,
                "abandoned": 0,
                "category": random.choice(CATEGORIES),
            })
            contact_id += 1

        for _ in range(max(0, abandoned)):
            wait_sec = round(target_sec * random.uniform(1.2, 3.5))
            contact_rows.append({
                "contact_id": contact_id,
                "work_date": wd,
                "interval_start": itv,
                "channel": ch,
                "agent_id": None,
                "wait_sec": wait_sec,
                "handle_sec": 0,
                "resolved": 0,
                "first_contact_resolution": 0,
                "csat_score": None,
                "abandoned": 1,
                "category": random.choice(CATEGORIES),
            })
            contact_id += 1

    cur.executemany(
        "UPDATE interval_volume SET answered_calls=?, abandoned_calls=?, answered_within_target=? WHERE rowid=?",
        update_rows,
    )
    conn.executemany(
        "INSERT INTO contacts (contact_id, work_date, interval_start, channel, agent_id, wait_sec, handle_sec, "
        "resolved, first_contact_resolution, csat_score, abandoned, category) "
        "VALUES (:contact_id, :work_date, :interval_start, :channel, :agent_id, :wait_sec, :handle_sec, "
        ":resolved, :first_contact_resolution, :csat_score, :abandoned, :category)",
        contact_rows,
    )
    print(f"contacts rows: {len(contact_rows)}")


def build_sla_targets(conn):
    rows = [
        ("채팅", 60, 0.80),
        ("전화", 30, 0.85),
        ("이메일", 3600, 0.90),
    ]
    conn.executemany(
        "INSERT INTO sla_targets (channel, target_answer_sec, target_service_level_pct) VALUES (?, ?, ?)",
        rows,
    )


def build_monthly_costs(conn):
    """shifts(실근무)와 hourly_cost 기반으로 월별/팀별/고용형태별 인건비를 집계."""
    conn.execute("""
        INSERT INTO monthly_costs (month, team, employment_type, labor_cost_krw, headcount, worked_hours)
        SELECT
            substr(s.work_date, 1, 7) AS month,
            a.team,
            a.employment_type,
            ROUND(SUM(
                (
                    (CAST(substr(s.shift_end,1,2) AS INTEGER)*60 + CAST(substr(s.shift_end,4,2) AS INTEGER))
                  - (CAST(substr(s.shift_start,1,2) AS INTEGER)*60 + CAST(substr(s.shift_start,4,2) AS INTEGER))
                  - s.break_minutes
                ) / 60.0 * a.hourly_cost_krw
            )) AS labor_cost_krw,
            COUNT(DISTINCT a.agent_id) AS headcount,
            ROUND(SUM(
                (
                    (CAST(substr(s.shift_end,1,2) AS INTEGER)*60 + CAST(substr(s.shift_end,4,2) AS INTEGER))
                  - (CAST(substr(s.shift_start,1,2) AS INTEGER)*60 + CAST(substr(s.shift_start,4,2) AS INTEGER))
                  - s.break_minutes
                ) / 60.0
            ), 1) AS worked_hours
        FROM shifts s
        JOIN agents a ON a.agent_id = s.agent_id
        WHERE s.status = '근무'
        GROUP BY month, a.team, a.employment_type
    """)


SCHEMA = """
CREATE TABLE agents (
    agent_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    team TEXT NOT NULL,               -- A팀(정규직) / B팀(BPO) / C팀(파트타임)
    employment_type TEXT NOT NULL,    -- 정규직 / BPO / 파트타임
    hire_date TEXT NOT NULL,
    skill_level INTEGER NOT NULL,     -- 1~3, 높을수록 숙련
    hourly_cost_krw INTEGER NOT NULL
);

CREATE TABLE shifts (
    shift_id INTEGER PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(agent_id),
    work_date TEXT NOT NULL,
    shift_start TEXT NOT NULL,
    shift_end TEXT NOT NULL,
    break_start TEXT,
    break_end TEXT,
    break_minutes INTEGER NOT NULL,
    status TEXT NOT NULL              -- 근무 / 연차 / 병가 / 결근
);

CREATE TABLE interval_staffing (
    work_date TEXT NOT NULL,
    interval_start TEXT NOT NULL,     -- 30분 단위, '09:00'~'20:30'
    scheduled_agents INTEGER NOT NULL, -- 스케줄 상 계획 인원
    actual_agents INTEGER NOT NULL,    -- 결근/연차/휴게 반영한 실제 가용 인원
    PRIMARY KEY (work_date, interval_start)
);

CREATE TABLE interval_volume (
    work_date TEXT NOT NULL,
    interval_start TEXT NOT NULL,
    channel TEXT NOT NULL,            -- 채팅 / 전화 / 이메일
    forecast_volume INTEGER NOT NULL,
    actual_volume INTEGER NOT NULL,
    forecast_aht_sec INTEGER NOT NULL,
    actual_aht_sec INTEGER NOT NULL,
    answered_calls INTEGER NOT NULL,
    abandoned_calls INTEGER NOT NULL,
    answered_within_target INTEGER NOT NULL,
    PRIMARY KEY (work_date, interval_start, channel)
);

CREATE TABLE contacts (
    contact_id INTEGER PRIMARY KEY,
    work_date TEXT NOT NULL,
    interval_start TEXT NOT NULL,
    channel TEXT NOT NULL,
    agent_id INTEGER REFERENCES agents(agent_id),  -- NULL이면 포기(abandoned)
    wait_sec INTEGER NOT NULL,
    handle_sec INTEGER NOT NULL,
    resolved INTEGER NOT NULL,
    first_contact_resolution INTEGER NOT NULL,
    csat_score INTEGER,               -- 1~5, NULL 가능
    abandoned INTEGER NOT NULL,
    category TEXT NOT NULL
);

CREATE TABLE sla_targets (
    channel TEXT PRIMARY KEY,
    target_answer_sec INTEGER NOT NULL,
    target_service_level_pct REAL NOT NULL
);

CREATE TABLE monthly_costs (
    month TEXT NOT NULL,
    team TEXT NOT NULL,
    employment_type TEXT NOT NULL,
    labor_cost_krw INTEGER NOT NULL,
    headcount INTEGER NOT NULL,
    worked_hours REAL NOT NULL,
    PRIMARY KEY (month, team, employment_type)
);

CREATE INDEX idx_contacts_date ON contacts(work_date);
CREATE INDEX idx_contacts_channel ON contacts(work_date, channel);
CREATE INDEX idx_shifts_date ON shifts(work_date);
"""


def main():
    import os
    os.makedirs("public", exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)

    agents = build_agents(conn)
    shift_rows = build_shifts(conn, agents)
    build_staffing(conn, shift_rows)
    build_volume(conn)
    build_answer_abandon_and_contacts(conn, agents)
    build_sla_targets(conn)
    build_monthly_costs(conn)

    conn.commit()

    cur = conn.cursor()
    for t in ["agents", "shifts", "interval_staffing", "interval_volume", "contacts", "sla_targets", "monthly_costs"]:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        print(t, cur.fetchone()[0])

    conn.close()
    print(f"\nDB 생성 완료: {DB_PATH}")
    print(f"기간: {START_DATE.isoformat()} ~ {END_DATE.isoformat()} ({DAYS}일)")
    print(f"프로모션 인입 급증일: {sorted(d.isoformat() for d in PROMO_DATES)}")


if __name__ == "__main__":
    main()
