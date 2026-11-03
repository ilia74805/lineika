import { LESSONS, lessonsFor, subjectsFor } from "./curriculum";
import { calculate, rankLessons, solve } from "./engine";

type Tab = "chat" | "calc" | "books" | "cursor";
type Field = { ref: string; context: string; value: string; empty: boolean };

const tabs: { id: Tab; label: string }[] = [
  { id: "chat", label: "Чат" },
  { id: "calc", label: "Счёт" },
  { id: "books", label: "Уроки" },
  { id: "cursor", label: "Курсор" },
];

let tab: Tab = "cursor";
let expr = "";
let angle: "deg" | "rad" = "deg";
let grade = 7;
let subject = subjectsFor(7)[0] || "Алгебра";
let query = "";
let openId = "";
let fields: Field[] = [];
let picked = "";
let answer = "";
let logLines: string[] = [];
let busy = false;
let chatQ = "";
let chatHtml = "";

const nav = document.querySelector("#tabs") as HTMLElement;
const view = document.querySelector("#view") as HTMLElement;

function h(html: string) {
  view.innerHTML = html;
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&" + "amp;";
    if (ch === "<") return "&" + "lt;";
    if (ch === ">") return "&" + "gt;";
    if (ch === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}

async function page<T>(msg: Record<string, unknown>): Promise<T> {
  const [win] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!win?.id) throw new Error("Нет активной вкладки");
  const reply = await chrome.tabs.sendMessage(win.id, msg);
  if (!reply) throw new Error("Страница не ответила. Обнови её и открой обычный сайт, не новую вкладку.");
  return reply as T;
}

function paintTabs() {
  nav.innerHTML = "";
  for (const item of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.setAttribute("aria-selected", String(item.id === tab));
    button.addEventListener("click", () => {
      tab = item.id;
      paint();
    });
    nav.appendChild(button);
  }
}

function paint() {
  paintTabs();
  if (tab === "chat") paintChat();
  else if (tab === "calc") paintCalc();
  else if (tab === "books") paintBooks();
  else paintCursor();
}

function paintChat() {
  h(`
    <label>Задача или тема
      <textarea id="q">${escape(chatQ)}</textarea>
    </label>
    <div class="row">
      <button class="act primary" id="ask" type="button">Решить локально</button>
    </div>
    <article class="card" id="out">${chatHtml || '<p class="muted">Считает на этом компьютере, без облака. Уравнения до 2-й степени, доли, проценты, геометрия, физика, химия, орфограммы. Остальное ищет в конспектах.</p>'}</article>
  `);
  const q = document.querySelector("#q") as HTMLTextAreaElement;
  q.addEventListener("input", () => {
    chatQ = q.value;
  });
  document.querySelector("#ask")?.addEventListener("click", () => {
    const solved = solve(chatQ, LESSONS);
    const ranked = rankLessons(chatQ, LESSONS)[0];
    const steps = solved.steps.map((step) => escape(step)).join("\n");
    chatHtml = `<h2>${escape(solved.ok ? solved.answer : solved.title)}</h2><p class="steps">${steps}</p>`;
    if (ranked) {
      chatHtml += `<p class="muted">${ranked.lesson.grade} кл. · ${escape(ranked.lesson.topic)}</p><p class="lesson">${escape(ranked.lesson.summary)}</p>`;
    }
    answer = solved.answer;
    paint();
  });
}

function paintCalc() {
  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "^", "+", "(", ")", "sqrt(", "C"];
  h(`
    <article class="card">
      <p class="muted">${angle === "deg" ? "градусы" : "радианы"}</p>
      <p class="screen" id="screen">${escape(expr || "0")}</p>
    </article>
    <div class="row">
      <button class="act" id="ang" type="button">${angle === "deg" ? "Перейти в радианы" : "Перейти в градусы"}</button>
      <button class="act primary" id="eq" type="button">=</button>
    </div>
    <div class="keys" id="keys"></div>
  `);
  const screen = document.querySelector("#screen") as HTMLElement;
  const box = document.querySelector("#keys") as HTMLElement;
  for (const key of keys) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = key === "sqrt(" ? "\u221a" : key;
    button.addEventListener("click", () => {
      if (key === "C") expr = "";
      else expr += key;
      screen.textContent = expr || "0";
    });
    box.appendChild(button);
  }
  document.querySelector("#ang")?.addEventListener("click", () => {
    angle = angle === "deg" ? "rad" : "deg";
    paint();
  });
  document.querySelector("#eq")?.addEventListener("click", () => {
    const result = calculate(expr, angle);
    expr = result.ok ? result.value : result.error;
    answer = result.ok ? result.value : "";
    paint();
  });
}

function paintBooks() {
  const subjects = subjectsFor(grade);
  if (!subjects.includes(subject)) subject = subjects[0] || "";
  const found = query.trim()
    ? rankLessons(query, LESSONS).slice(0, 12).map((row) => row.lesson)
    : lessonsFor(grade, subject).slice(0, 20);
  const options = Array.from({ length: 11 }, (_, i) => {
    const n = i + 1;
    return `<option value="${n}" ${n === grade ? "selected" : ""}>${n} класс</option>`;
  }).join("");
  h(`
    <label>Класс
      <select id="grade">${options}</select>
    </label>
    <label>Поиск по конспектам
      <input id="find" type="search" value="${escape(query)}" placeholder="фотосинтез, Ом, дробь" />
    </label>
    <div class="row" id="subs"></div>
    <div id="list"></div>
  `);
  (document.querySelector("#grade") as HTMLSelectElement).addEventListener("change", (event) => {
    grade = Number((event.target as HTMLSelectElement).value);
    query = "";
    openId = "";
    paint();
  });
  (document.querySelector("#find") as HTMLInputElement).addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    query = input.value;
    const pos = input.selectionStart ?? query.length;
    paint();
    const next = document.querySelector("#find") as HTMLInputElement | null;
    next?.focus();
    next?.setSelectionRange(pos, pos);
  });
  const subs = document.querySelector("#subs") as HTMLElement;
  if (!query.trim()) {
    for (const name of subjects) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "act";
      button.textContent = name;
      if (name === subject) button.classList.add("primary");
      button.addEventListener("click", () => {
        subject = name;
        openId = "";
        paint();
      });
      subs.appendChild(button);
    }
  }
  const list = document.querySelector("#list") as HTMLElement;
  for (const lesson of found) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hit";
    button.innerHTML = `<strong>${escape(lesson.topic)}</strong><small>${lesson.grade} кл. · ${escape(lesson.subject)}</small>`;
    button.addEventListener("click", () => {
      openId = openId === lesson.id ? "" : lesson.id;
      paint();
    });
    list.appendChild(button);
    if (openId === lesson.id) {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `<p class="lesson">${escape(lesson.summary)}</p><p class="steps">${lesson.rules.map(escape).join("\n")}</p><p class="muted">${escape(lesson.example)}</p>`;
      list.appendChild(card);
    }
  }
}

function paintCursor() {
  h(`
    <p class="muted">Курсор едет по открытой вкладке и печатает в поля. Пустое поле берёт, только если рядом виден текст задачи.</p>
    <div class="row">
      <button class="act" id="snap" type="button">Снимок</button>
      <button class="act primary" id="fill" type="button" ${busy ? "disabled" : ""}>Заполнить пустые</button>
      <button class="act" id="stop" type="button">Стоп</button>
    </div>
    <div id="fields"></div>
    <label>Вписать этот ответ в выбранное поле
      <input id="manual" type="text" value="${escape(answer)}" />
    </label>
    <button class="act" id="type" type="button">Вписать курсором</button>
    <pre class="log" id="log">${escape(logLines.join("\n"))}</pre>
  `);
  const list = document.querySelector("#fields") as HTMLElement;
  for (const field of fields) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hit" + (picked === field.ref ? " active" : "");
    button.innerHTML = `<strong>${escape(field.ref)}</strong><small>${escape(field.context || "без текста")} · ${field.empty ? "пусто" : escape(field.value)}</small>`;
    button.addEventListener("click", () => {
      picked = field.ref;
      paint();
    });
    list.appendChild(button);
  }
  (document.querySelector("#manual") as HTMLInputElement).addEventListener("input", (event) => {
    answer = (event.target as HTMLInputElement).value;
  });
  document.querySelector("#snap")?.addEventListener("click", async () => {
    await runSnap();
  });
  document.querySelector("#fill")?.addEventListener("click", async () => {
    busy = true;
    paint();
    pushLog("еду по пустым полям");
    try {
      const reply = await page<{ ok: boolean; filled?: number; error?: string }>({ type: "fill", onlyEmpty: true });
      pushLog(reply.ok ? `готово, полей: ${reply.filled ?? 0}` : reply.error || "не вышло");
    } catch (err) {
      pushLog(err instanceof Error ? err.message : "нет связи со страницей");
    }
    busy = false;
    await runSnap();
  });
  document.querySelector("#stop")?.addEventListener("click", () => {
    page({ type: "stop" }).catch(() => {});
    pushLog("стоп");
  });
  document.querySelector("#type")?.addEventListener("click", async () => {
    if (!picked) {
      pushLog("сначала выбери поле");
      return;
    }
    try {
      const reply = await page<{ ok: boolean; error?: string }>({ type: "type", ref: picked, text: answer });
      pushLog(reply.ok ? `вписано в ${picked}` : reply.error || "не вписалось");
    } catch (err) {
      pushLog(err instanceof Error ? err.message : "нет связи со страницей");
    }
  });
}

function pushLog(line: string) {
  logLines = [...logLines, line].slice(-24);
  const node = document.querySelector("#log");
  if (node) node.textContent = logLines.join("\n");
  else paint();
}

async function runSnap() {
  try {
    const reply = await page<{ ok: boolean; fields?: Field[]; error?: string }>({ type: "snapshot" });
    fields = reply.fields || [];
    if (!fields.some((field) => field.ref === picked)) picked = fields[0]?.ref || "";
    pushLog(`полей на странице: ${fields.length}`);
    if (tab === "cursor") paint();
  } catch (err) {
    pushLog(err instanceof Error ? err.message : "открой страницу с заданием");
    if (tab === "cursor") paint();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "log" && typeof msg.text === "string") pushLog(msg.text);
});

paint();
