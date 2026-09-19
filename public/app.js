// 앱 로직: 탭 전환, sql.js 초기화, 문제 목록/에디터/결과 렌더링

let db = null;
let currentQuestion = null;

// ---------- 탭 전환 ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
  });
});

// ---------- sql.js 초기화 & DB 로드 ----------
const dbStatus = document.getElementById("db-status");

initSqlJs({ locateFile: (file) => `vendor/${file}` })
  .then((SQL) => fetch("channeltalk.db").then((r) => r.arrayBuffer()).then((buf) => [SQL, buf]))
  .then(([SQL, buf]) => {
    db = new SQL.Database(new Uint8Array(buf));
    dbStatus.textContent = "✅ DB 로딩 완료 (channeltalk.db)";
    runQuery(document.getElementById("sql-editor").value);
  })
  .catch((err) => {
    dbStatus.textContent = "❌ DB 로딩 실패: " + err.message;
    console.error(err);
  });

// ---------- 쿼리 실행 ----------
const resultArea = document.getElementById("result-area");
const runStatus = document.getElementById("run-status");

function runQuery(sql) {
  if (!db) {
    resultArea.innerHTML = '<div class="error-msg">DB가 아직 로딩 중입니다. 잠시만 기다려주세요.</div>';
    return;
  }
  const t0 = performance.now();
  try {
    const results = db.exec(sql);
    const ms = (performance.now() - t0).toFixed(1);
    if (results.length === 0) {
      resultArea.innerHTML = '<div class="error-msg" style="color:#9aa4c0;">쿼리가 실행되었지만 반환된 결과가 없습니다. (SELECT 문인지 확인하세요)</div>';
      runStatus.textContent = `실행 완료 (${ms}ms)`;
      return;
    }
    resultArea.innerHTML = "";
    results.forEach((res) => {
      const table = document.createElement("table");
      table.className = "result";
      const thead = document.createElement("tr");
      res.columns.forEach((c) => {
        const th = document.createElement("th");
        th.textContent = c;
        thead.appendChild(th);
      });
      table.appendChild(thead);
      res.values.forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((v) => {
          const td = document.createElement("td");
          td.textContent = v === null ? "NULL" : v;
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      resultArea.appendChild(table);
    });
    runStatus.textContent = `${results[0].values.length}행 반환 (${ms}ms)`;
  } catch (err) {
    resultArea.innerHTML = `<div class="error-msg">${err.message}</div>`;
    runStatus.textContent = "오류 발생";
  }
}

document.getElementById("btn-run").addEventListener("click", () => {
  runQuery(document.getElementById("sql-editor").value);
});

document.getElementById("sql-editor").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runQuery(document.getElementById("sql-editor").value);
  }
});

// ---------- 사이드바: 문제 목록 렌더링 ----------
const sidebar = document.getElementById("sidebar");

QUESTION_BANK.forEach((cat) => {
  const catEl = document.createElement("div");
  catEl.className = "cat-title";
  catEl.textContent = cat.category;
  sidebar.appendChild(catEl);

  cat.items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "q-item";
    el.innerHTML = `<span>${item.title}</span><span class="lvl ${item.level}">${item.level}</span>`;
    el.addEventListener("click", () => selectQuestion(item, el));
    sidebar.appendChild(el);
  });
});

function selectQuestion(item, el) {
  currentQuestion = item;
  document.querySelectorAll(".q-item").forEach((e) => e.classList.remove("active"));
  el.classList.add("active");

  document.getElementById("q-title").textContent = item.title;
  document.getElementById("q-prompt").textContent = item.prompt;
  document.getElementById("toggle-row").style.display = "flex";

  const hintBox = document.getElementById("hint-box");
  hintBox.textContent = "💡 " + item.hint;
  hintBox.classList.remove("show");

  const solutionBox = document.getElementById("solution-box");
  document.getElementById("solution-code").textContent = item.solution;
  solutionBox.classList.remove("show");

  document.getElementById("sql-editor").value = `-- ${item.title}\n-- 여기에 쿼리를 작성해보세요\n`;
  document.getElementById("sql-editor").focus();
}

document.getElementById("btn-hint").addEventListener("click", () => {
  document.getElementById("hint-box").classList.toggle("show");
});
document.getElementById("btn-solution").addEventListener("click", () => {
  document.getElementById("solution-box").classList.toggle("show");
});
document.getElementById("btn-load-solution").addEventListener("click", () => {
  if (!currentQuestion) return;
  document.getElementById("sql-editor").value = currentQuestion.solution;
  runQuery(currentQuestion.solution);
  document.getElementById("solution-box").classList.add("show");
});

// ---------- 스키마 뷰 ----------
const SCHEMA_DOCS = [
  {
    table: "agents",
    desc: "상담사 마스터",
    cols: [
      ["agent_id", "PK"],
      ["name", "이름"],
      ["team", "A팀(정규직) / B팀(BPO) / C팀(파트타임)"],
      ["employment_type", "정규직 / BPO / 파트타임"],
      ["hire_date", "입사일"],
      ["skill_level", "숙련도 1~3"],
      ["hourly_cost_krw", "시급(원)"],
    ],
  },
  {
    table: "shifts",
    desc: "일자별 근무 스케줄 (계획 + 실제 상태)",
    cols: [
      ["shift_id", "PK"],
      ["agent_id", "FK → agents"],
      ["work_date", "근무일 (YYYY-MM-DD)"],
      ["shift_start / shift_end", "근무 시작/종료 시각 (HH:MM)"],
      ["break_start / break_end", "휴게 시작/종료 시각 (없으면 NULL)"],
      ["break_minutes", "휴게시간(분)"],
      ["status", "근무 / 연차 / 병가 / 결근"],
    ],
  },
  {
    table: "interval_staffing",
    desc: "30분 인터벌 단위 계획/실제 근무 인원 (스케줄 갭·shrinkage 분석용)",
    cols: [
      ["work_date, interval_start", "복합 PK. interval_start는 '09:00'~'20:30'"],
      ["scheduled_agents", "스케줄 상 계획 인원 (shift 존재 여부 기준)"],
      ["actual_agents", "결근/연차/병가/휴게 제외한 실제 가용 인원"],
    ],
  },
  {
    table: "interval_volume",
    desc: "30분 인터벌 x 채널 단위 인입량/AHT/응대·포기 실적",
    cols: [
      ["work_date, interval_start, channel", "복합 PK. channel: 채팅/전화/이메일"],
      ["forecast_volume / actual_volume", "예측 인입량 / 실제 인입량"],
      ["forecast_aht_sec / actual_aht_sec", "예측 평균처리시간(초) / 실제"],
      ["answered_calls / abandoned_calls", "응대 건수 / 포기 건수"],
      ["answered_within_target", "SLA 목표시간 내 응대 건수"],
    ],
  },
  {
    table: "contacts",
    desc: "티켓(문의) 단위 원본 데이터",
    cols: [
      ["contact_id", "PK"],
      ["work_date, interval_start, channel", "발생 일시/채널"],
      ["agent_id", "담당 상담사 (포기건이면 NULL)"],
      ["wait_sec / handle_sec", "대기시간 / 처리시간(초)"],
      ["resolved / first_contact_resolution", "해결 여부 / 1회 해결 여부(FCR)"],
      ["csat_score", "고객만족도 1~5 (NULL 가능)"],
      ["abandoned", "포기 여부 (1이면 agent_id NULL, handle_sec=0)"],
      ["category", "문의 유형 (예약/변경, 결제/환불, 차량 문제 등)"],
    ],
  },
  {
    table: "sla_targets",
    desc: "채널별 서비스 레벨 목표",
    cols: [
      ["channel", "PK"],
      ["target_answer_sec", "목표 응답시간(초)"],
      ["target_service_level_pct", "목표 서비스레벨 (0~1)"],
    ],
  },
  {
    table: "monthly_costs",
    desc: "월 x 팀 x 고용형태별 인건비 집계 (shifts 원본에서 계산됨)",
    cols: [
      ["month, team, employment_type", "복합 PK"],
      ["labor_cost_krw", "인건비 합계(원)"],
      ["headcount", "해당 그룹 근무 인원수"],
      ["worked_hours", "총 근무시간"],
    ],
  },
];

const schemaView = document.getElementById("view-schema");
schemaView.innerHTML =
  '<p style="color:#9aa4c0;font-size:13px;margin-bottom:16px;">전체 60일치(2026-07-21 ~ 2026-09-18) 가상 데이터입니다. 아래 스키마를 참고해 SQL 연습문제 탭에서 직접 쿼리를 작성해보세요.</p>' +
  SCHEMA_DOCS.map(
    (t) => `
    <div class="schema-table">
      <h3>${t.table} <span style="color:#9aa4c0;font-weight:400;font-size:12px;">— ${t.desc}</span></h3>
      <table>${t.cols.map((c) => `<tr><td class="col-name">${c[0]}</td><td class="col-desc">${c[1]}</td></tr>`).join("")}</table>
    </div>`
  ).join("");

// ---------- 개념 노트 뷰 ----------
document.getElementById("view-notes").innerHTML = NOTES_HTML;
