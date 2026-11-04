import { LESSONS, lessonsFor, subjectsFor } from "./curriculum";
import { calculate, rankLessons, solve } from "./engine";

type Tab = "chat" | "calc" | "books" | "cursor";
type Field = { ref: string; context: string; value: string; empty: boolean };

const tabs: { id: Tab; label: string }[] = [
  { id: "chat", label: "Решить" },
  { id: "calc", label: "Счёт" },
  { id: "books", label: "Уроки" },
  { id: "cursor", label: "Курсор" },
];

let tab: Tab = "chat";
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

const MODEL_URL_KEY = "lineika.modelUrl";
const MODEL_NAME_KEY = "lineika.model";
const DEFAULT_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:3b";

// Настройки храним в браузере панели: это удобство, а не данные для Claude.
function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // без хранилища просто не запомним
  }
}

async function askModel(question: string): Promise<string> {
  const base = readSetting(MODEL_URL_KEY, DEFAULT_URL).replace(/\/$/, "");
  const model = readSetting(MODEL_NAME_KEY, DEFAULT_MODEL);
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "Ты помогаешь школьнику. Отвечай по-русски. Сначала кратко перескажи условие, затем реши по шагам и объясни каждый шаг. В последней строке напиши «Ответ: ...».",
          },
          { role: "user", content: question },
        ],
      }),
    });
  } catch {
    throw new Error(`Нет связи с Ollama по адресу ${base}. Запусти Ollama и проверь настройку в блоке «Модель».`);
  }
  if (!res.ok) {
    throw new Error(`Ollama ответила ${res.status}. Проверь, что модель «${model}» скачана: ollama pull ${model}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() || "Модель ничего не вернула.";
}

let modelBusy = false;

function paintChat() {
  h(`
    <label>Задача или тема
      <textarea id="q">${escape(chatQ)}</textarea>
    </label>
    <div class="row">
      <button id="ask" type="button">Решить</button>
      <button id="askm" type="button" ${modelBusy ? "disabled" : ""}>Спросить модель</button>
    </div>
    <article id="out">${chatHtml || '<p>Решает правилами на этом компьютере, без облака: уравнения любой степени и системы, доли, проценты, геометрия, физика, химия, орфограммы. Остальное ищет в конспектах. Для сложных условий — кнопка «Спросить модель».</p>'}</article>
    <details>
      <summary>Модель</summary>
      <label>Адрес Ollama
        <input id="murl" type="text" value="${escape(readSetting(MODEL_URL_KEY, DEFAULT_URL))}" />
      </label>
      <label>Модель
        <input id="mname" type="text" value="${escape(readSetting(MODEL_NAME_KEY, DEFAULT_MODEL))}" />
      </label>
      <p>Скачать и поставить Ollama: <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a>. Потом в терминале: <code>ollama pull ${escape(readSetting(MODEL_NAME_KEY, DEFAULT_MODEL))}</code>. Если модель не отвечает из расширения, запусти Ollama с переменной <code>OLLAMA_ORIGINS=chrome-extension://*</code>.</p>
    </details>
  `);
  const q = document.querySelector("#q") as HTMLTextAreaElement;
  q.addEventListener("input", () => {
    chatQ = q.value;
  });
  (document.querySelector("#murl") as HTMLInputElement).addEventListener("change", (event) => {
    writeSetting(MODEL_URL_KEY, (event.target as HTMLInputElement).value.trim() || DEFAULT_URL);
  });
  (document.querySelector("#mname") as HTMLInputElement).addEventListener("change", (event) => {
    writeSetting(MODEL_NAME_KEY, (event.target as HTMLInputElement).value.trim() || DEFAULT_MODEL);
  });
  document.querySelector("#ask")?.addEventListener("click", () => {
    const solved = solve(chatQ, LESSONS);
    const ranked = rankLessons(chatQ, LESSONS)[0];
    const steps = solved.steps.map((step) => escape(step)).join("\n");
    chatHtml = `<h2>${escape(solved.ok ? solved.answer : solved.title)}</h2><p>${steps}</p>`;
    if (ranked) {
      chatHtml += `<p>${ranked.lesson.grade} кл. · ${escape(ranked.lesson.topic)}</p><p>${escape(ranked.lesson.summary)}</p>`;
    }
    answer = solved.answer;
    paint();
  });
  document.querySelector("#askm")?.addEventListener("click", async () => {
    const question = chatQ.trim();
    if (!question) {
      chatHtml = "<p>Сначала напиши задачу.</p>";
      paint();
      return;
    }
    modelBusy = true;
    chatHtml = "<p>Модель думает…</p>";
    paint();
    try {
      const text = await askModel(question);
      chatHtml = `<p>${escape(text).replace(/\n/g, "<br>")}</p>`;
      answer = (text.match(/Ответ:\s*(.+)$/m)?.[1] ?? "").trim();
    } catch (err) {
      chatHtml = `<p>${escape(err instanceof Error ? err.message : "Ошибка модели")}</p>`;
    }
    modelBusy = false;
    paint();
  });
}

function paintCalc() {
  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "^", "+", "(", ")", "sqrt(", "C"];
  h(`
    <article>
      <p>${angle === "deg" ? "градусы" : "радианы"}</p>
      <p id="screen">${escape(expr || "0")}</p>
    </article>
    <div>
      <button id="ang" type="button">${angle === "deg" ? "Перейти в радианы" : "Перейти в градусы"}</button>
      <button id="eq" type="button">=</button>
    </div>
    <div id="keys"></div>
  `);
  const screen = document.querySelector("#screen") as HTMLElement;
  const box = document.querySelector("#keys") as HTMLElement;
  for (const key of keys) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = key === "sqrt(" ? "√" : key;
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
    <div id="subs"></div>
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
    button.innerHTML = `<strong>${escape(lesson.topic)}</strong><small>${lesson.grade} кл. · ${escape(lesson.subject)}</small>`;
    button.addEventListener("click", () => {
      openId = openId === lesson.id ? "" : lesson.id;
      paint();
    });
    list.appendChild(button);
    if (openId === lesson.id) {
      const card = document.createElement("article");
      card.innerHTML = `<p>${escape(lesson.summary)}</p><p>${lesson.rules.map(escape).join("\n")}</p><p>${escape(lesson.example)}</p>`;
      list.appendChild(card);
    }
  }
}

let stopRequested = false;

// Курсор: правила, а если они не справились — локальная модель. Вписывает курсором.
async function runAgent() {
  busy = true;
  stopRequested = false;
  paint();
  let useModel = true;
  let written = 0;
  try {
    await runSnap();
    const todo = fields.filter((f) => f.empty && f.context.length >= 8 && /\d|=|найд|реши|вычисл|сколько/i.test(f.context));
    pushLog(`заданий на странице: ${todo.length}`);
    for (const field of todo.slice(0, 10)) {
      if (stopRequested) {
        pushLog("остановлено");
        break;
      }
      // Длинные условия правила понимают плохо: правило «скорость» поделило бы
      // любые два числа в тексте. Для них сразу спрашиваем модель.
      let text = "";
      if (field.context.length <= 120) {
        const local = solve(field.context, LESSONS);
        if (local.ok && !local.lessonId && local.answer && local.answer.length <= 80) text = local.answer;
      }
      let via = "правила";
      if (!text && useModel) {
        pushLog(`${field.ref} — спрашиваю модель`);
        try {
          const reply = await askModel(field.context);
          text = (reply.match(/Ответ:\s*(.+)$/m)?.[1] ?? "").trim().slice(0, 80);
          via = "модель";
        } catch (err) {
          pushLog(err instanceof Error ? err.message : "модель недоступна");
          useModel = false;
        }
      }
      if (!text) {
        pushLog(`${field.ref} — ответа нет, пропускаю`);
        continue;
      }
      pushLog(`${field.ref} — ${via}: ${text}`);
      const reply = await page<{ ok: boolean; error?: string }>({ type: "type", ref: field.ref, text });
      if (reply.ok) written += 1;
      pushLog(reply.ok ? `${field.ref} — вписано` : reply.error || "не вписалось");
    }
    pushLog(`готово, вписано: ${written}`);
  } catch (err) {
    pushLog(err instanceof Error ? err.message : "нет связи со страницей");
  }
  busy = false;
  await runSnap();
}

function paintCursor() {
  h(`
    <p>Курсор едет по открытой вкладке и печатает в поля. Пустое поле берёт, только если рядом виден текст задачи.</p>
    <div>
      <button id="snap" type="button">Снимок</button>
      <button id="fill" type="button" ${busy ? "disabled" : ""}>Заполнить пустые</button>
      <button id="stop" type="button">Стоп</button>
    </div>
    <div id="fields"></div>
    <label>Вписать этот ответ в выбранное поле
      <input id="manual" type="text" value="${escape(answer)}" />
    </label>
    <button id="type" type="button">Вписать курсором</button>
    <pre id="log">${escape(logLines.join("\n"))}</pre>
  `);
  const list = document.querySelector("#fields") as HTMLElement;
  for (const field of fields) {
    const button = document.createElement("button");
    button.type = "button";
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
    await runAgent();
  });
  document.querySelector("#stop")?.addEventListener("click", () => {
    stopRequested = true;
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
