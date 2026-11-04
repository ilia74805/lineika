import { LESSONS } from "./curriculum";
import { solve } from "./engine";

const REF = "data-lineika-ref";
let aborted = false;
let cursorXY = { x: 24, y: 24 };

type Field = {
  ref: string;
  context: string;
  value: string;
  empty: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(text: string) {
  chrome.runtime.sendMessage({ type: "log", text }).catch(() => {});
}

function visible(el: Element) {
  const box = el.getBoundingClientRect();
  if (box.width < 24 || box.height < 16) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
}

function fieldValue(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return el.innerText || "";
}

function nearby(el: HTMLElement) {
  const bits: string[] = [];
  const aria = el.getAttribute("aria-label");
  const placeholder = el.getAttribute("placeholder");
  if (aria) bits.push(aria);
  if (placeholder) bits.push(placeholder);
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent) bits.push(label.textContent);
  }
  const prev = el.previousElementSibling;
  if (prev?.textContent) bits.push(prev.textContent);
  const parent = el.parentElement;
  if (parent && parent !== document.body && parent !== document.documentElement) {
    const clone = parent.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, button, select, #lineika-cursor").forEach((node) => node.remove());
    const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
    if (text && text.length < 280) bits.push(text);
  }
  return [...new Set(bits)].join(" ").replace(/\s+/g, " ").trim().slice(0, 360);
}

function isAnswerField(el: HTMLElement) {
  if (el.closest("#lineika-cursor")) return false;
  if (el instanceof HTMLInputElement) {
    const skip = ["password", "hidden", "file", "checkbox", "radio", "submit", "button", "email", "tel", "url", "color", "date", "range"];
    if (skip.includes(el.type)) return false;
  }
  if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false;
  return visible(el);
}

function collect(): Field[] {
  const nodes = [...document.querySelectorAll("input, textarea, [contenteditable='true']")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement && isAnswerField(node),
  );
  return nodes.slice(0, 30).map((el, index) => {
    const ref = el.getAttribute(REF) || `p1:e${index + 1}`;
    el.setAttribute(REF, ref);
    const value = fieldValue(el).trim();
    return { ref, context: nearby(el), value, empty: value.length === 0 };
  });
}

function looksLikeTask(text: string) {
  return /[=+\-*/%^]|от\s+\d|класс|найди|вычисли|уравнен|катет|площад|периметр|скорост|моляр|нод|нок|[а-яё]_[а-яё]/i.test(
    text,
  );
}

function cursor() {
  let el = document.getElementById("lineika-cursor");
  if (el) return el;
  el = document.createElement("div");
  el.id = "lineika-cursor";
  el.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 2 L3 18 L7.2 13.6 L10.2 20 L13 18.8 L10 12.6 L16.5 12.2 Z" fill="#1c1916"/></svg><span></span>';
  const style = el.style;
  style.position = "fixed";
  style.left = "0";
  style.top = "0";
  style.zIndex = "2147483647";
  style.pointerEvents = "none";
  style.display = "flex";
  style.alignItems = "flex-start";
  style.gap = "6px";
  style.transform = "translate(24px, 24px)";
  const tag = el.querySelector("span");
  if (tag) {
    tag.style.font = "12px/1.3 Segoe UI, sans-serif";
    tag.style.background = "#fbf8f3";
    tag.style.color = "#1c1916";
    tag.style.border = "1px solid #1c1916";
    tag.style.borderRadius = "999px";
    tag.style.padding = "2px 8px";
    tag.style.maxWidth = "180px";
    tag.style.whiteSpace = "nowrap";
    tag.style.overflow = "hidden";
    tag.style.textOverflow = "ellipsis";
  }
  document.documentElement.appendChild(el);
  return el;
}

function glide(x: number, y: number, label: string) {
  const el = cursor();
  const tag = el.querySelector("span");
  if (tag) tag.textContent = label;
  const from = { ...cursorXY };
  const start = performance.now();
  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / 340);
      const eased = 1 - (1 - t) ** 3;
      const cx = from.x + (x - from.x) * eased;
      const cy = from.y + (y - from.y) * eased;
      el.style.transform = `translate(${cx}px, ${cy}px)`;
      if (t < 1 && !aborted) requestAnimationFrame(frame);
      else {
        cursorXY = { x, y };
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

function writeValue(el: HTMLElement, value: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  el.textContent = value;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
}

async function aim(el: HTMLElement, label: string) {
  el.scrollIntoView({ block: "center", inline: "nearest" });
  await sleep(40);
  const box = el.getBoundingClientRect();
  await glide(box.left + Math.min(28, box.width / 3), box.top + box.height / 2, label);
}

async function typeInto(el: HTMLElement, text: string, label: string) {
  await aim(el, label);
  el.focus();
  let acc = "";
  for (const ch of text) {
    if (aborted) return false;
    acc += ch;
    writeValue(el, acc);
    await sleep(18);
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return fieldValue(el).trim() === text.trim();
}

async function fill(onlyEmpty: boolean) {
  aborted = false;
  const fields = collect();
  let filled = 0;
  for (const field of fields) {
    if (aborted) break;
    if (onlyEmpty && !field.empty) continue;
    if (!looksLikeTask(field.context)) {
      log(`${field.ref} — рядом не задача, пропуск`);
      continue;
    }
    const solved = solve(field.context, LESSONS);
    if (!solved.ok || !solved.answer || solved.answer.length > 80) {
      log(`${field.ref} — мини-модель не взяла`);
      continue;
    }
    const el = document.querySelector(`[${REF}="${CSS.escape(field.ref)}"]`);
    if (!(el instanceof HTMLElement)) continue;
    log(`${field.ref} — ${solved.title}: ${solved.answer}`);
    const ok = await typeInto(el, solved.answer, solved.answer);
    log(ok ? `${field.ref} — вписано` : `${field.ref} — страница не приняла текст`);
    if (ok) filled += 1;
    await sleep(80);
  }
  return { ok: true as const, filled, fields };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object" || msg.type === "log") return;
  const run = async () => {
    if (msg.type === "ping") return { ok: true };
    if (msg.type === "stop") {
      aborted = true;
      return { ok: true };
    }
    if (msg.type === "snapshot") return { ok: true, fields: collect() };
    if (msg.type === "fill") return fill(msg.onlyEmpty !== false);
    if (msg.type === "type") {
      aborted = false;
      const el = document.querySelector(`[${REF}="${CSS.escape(String(msg.ref || ""))}"]`);
      if (!(el instanceof HTMLElement)) return { ok: false, error: "поле не найдено, обнови снимок" };
      const text = String(msg.text || "");
      if (!text) return { ok: false, error: "пустой ответ" };
      const wrote = await typeInto(el, text, text);
      return { ok: wrote, error: wrote ? "" : "страница не приняла текст" };
    }
    return { ok: false, error: "неизвестная команда" };
  };
  run()
    .then(sendResponse)
    .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : "ошибка" }));
  return true;
});
