export type Lesson = {
  id: string;
  grade: number;
  subject: string;
  topic: string;
  summary: string;
  rules: string[];
  example: string;
  keys: string[];
  deep: boolean;
};

export type Solution = {
  ok: boolean;
  answer: string;
  steps: string[];
  title: string;
  lessonId?: string;
};

type Tok =
  | { k: "num"; v: number }
  | { k: "var"; v: string }
  | { k: "op"; v: string }
  | { k: "fn"; v: string }
  | { k: "post"; v: string }
  | { k: "lp" }
  | { k: "rp" };

const FUNCS = new Set(["sqrt", "cbrt", "sin", "cos", "tan", "log", "ln", "abs"]);
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const STOP = new Set([
  "если",
  "это",
  "что",
  "как",
  "для",
  "или",
  "при",
  "надо",
  "найти",
  "реши",
  "решить",
  "задача",
  "класс",
  "какой",
  "какая",
  "какие",
  "почему",
  "можно",
  "будет",
  "когда",
  "была",
  "было",
  "были",
  "такое",
  "такой",
  "объясни",
  "расскажи",
  "просто",
  "очень",
]);

const SPELL: Record<string, { answer: string; rule: string }> = {
  ж_знь: { answer: "жизнь", rule: "Жи-ши пиши с буквой и." },
  маш_на: { answer: "машина", rule: "Жи-ши пиши с буквой и." },
  ш_на: { answer: "шина", rule: "Жи-ши пиши с буквой и." },
  ч_ща: { answer: "чаща", rule: "Ча-ща пиши с буквой а." },
  щ_ка: { answer: "щука", rule: "Чу-щу пиши с буквой у." },
  ц_рк: { answer: "цирк", rule: "Ци пиши с буквой и." },
  ч_до: { answer: "чудо", rule: "Чу-щу пиши с буквой у." },
  ч_й: { answer: "чай", rule: "Ча-ща пиши с буквой а." },
};

const MASS: Record<string, number> = {
  H: 1,
  He: 4,
  Li: 7,
  Be: 9,
  B: 11,
  C: 12,
  N: 14,
  O: 16,
  F: 19,
  Na: 23,
  Mg: 24,
  Al: 27,
  Si: 28,
  P: 31,
  S: 32,
  Cl: 35.5,
  K: 39,
  Ca: 40,
  Fe: 56,
  Cu: 64,
  Zn: 65,
  Br: 80,
  Ag: 108,
  I: 127,
  Ba: 137,
  Au: 197,
};

const SYMBOLS = Object.keys(MASS).sort((a, b) => b.length - a.length);

export function answersMatch(expected: string, value: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  if (!norm(value)) return false;
  if (norm(expected) === norm(value)) return true;
  const grab = (s: string) =>
    [...s.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
  const a = grab(expected);
  const b = grab(value);
  if (!a.length || a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return as.every((n, i) => Math.abs(n - bs[i]!) < 1e-6);
}

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "не определено";
  const r = Math.round(n * 1e9) / 1e9;
  if (Math.abs(r) < 1e-9) return "0";
  if (Math.abs(r - Math.round(r)) < 1e-8) return String(Math.round(r));
  return String(parseFloat(r.toFixed(6)));
}

function factorial(n: number): number {
  if (!Number.isFinite(n) || n < 0 || Math.abs(n - Math.round(n)) > 1e-8) {
    throw new Error("факториал только для целых ≥ 0");
  }
  const k = Math.round(n);
  if (k > 170) throw new Error("слишком большое число");
  let acc = 1;
  for (let i = 2; i <= k; i++) acc *= i;
  return acc;
}

function applyFn(name: string, a: number, deg: boolean): number {
  const rad = deg ? (a * Math.PI) / 180 : a;
  if (name === "sqrt") {
    if (a < 0) throw new Error("корень из отрицательного");
    return Math.sqrt(a);
  }
  if (name === "cbrt") return Math.cbrt(a);
  if (name === "sin") return Math.sin(rad);
  if (name === "cos") return Math.cos(rad);
  if (name === "tan") {
    const v = Math.tan(rad);
    if (!Number.isFinite(v) || Math.abs(v) > 1e12) throw new Error("тангенс не определён");
    return v;
  }
  if (name === "log") {
    if (a <= 0) throw new Error("логарифм не определён");
    return Math.log10(a);
  }
  if (name === "ln") {
    if (a <= 0) throw new Error("логарифм не определён");
    return Math.log(a);
  }
  if (name === "abs") return Math.abs(a);
  throw new Error("неизвестная функция");
}

export function prepMath(s: string): string {
  return s
    .replace(/,/g, ".")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−|–|—/g, "-")
    .replace(/π/g, "pi")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/√/g, "sqrt")
    .replace(/\*\*/g, "^")
    .replace(/х/gi, "x")
    .replace(/\s+/g, "");
}

function tokenize(input: string): Tok[] {
  const s = input;
  const tokens: Tok[] = [];
  let i = 0;
  const isValue = () => {
    const prev = tokens[tokens.length - 1];
    return !!prev && (prev.k === "num" || prev.k === "var" || prev.k === "rp" || prev.k === "post");
  };
  while (i < s.length) {
    const c = s[i]!;
    if (/[0-9.]/.test(c)) {
      if (isValue()) tokens.push({ k: "op", v: "*" });
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j]!)) j++;
      const raw = s.slice(i, j);
      if (raw === "." || raw.split(".").length > 2) throw new Error("плохое число");
      tokens.push({ k: "num", v: Number(raw) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      if (isValue()) tokens.push({ k: "op", v: "*" });
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j]!)) j++;
      const name = s.slice(i, j).toLowerCase();
      const next = s[j];
      if (next === "(" && FUNCS.has(name)) tokens.push({ k: "fn", v: name });
      else if (CONSTS[name] !== undefined) tokens.push({ k: "num", v: CONSTS[name]! });
      else tokens.push({ k: "var", v: name });
      i = j;
      continue;
    }
    if (c === "(") {
      if (isValue()) tokens.push({ k: "op", v: "*" });
      tokens.push({ k: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ k: "rp" });
      i++;
      continue;
    }
    if (c === "%" || c === "!") {
      tokens.push({ k: "post", v: c });
      i++;
      continue;
    }
    if ("+-*/^".includes(c)) {
      if (c === "-" && !isValue()) tokens.push({ k: "op", v: "u-" });
      else tokens.push({ k: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`не понял «${c}»`);
  }
  return tokens;
}

function toRpn(tokens: Tok[]): Tok[] {
  const out: Tok[] = [];
  const stack: Tok[] = [];
  const prec: Record<string, number> = { "+": 2, "-": 2, "*": 3, "/": 3, "u-": 5, "^": 6 };
  const rightAssoc: Record<string, boolean> = { "^": true, "u-": true };
  for (const tok of tokens) {
    if (tok.k === "num" || tok.k === "var") out.push(tok);
    else if (tok.k === "fn") stack.push(tok);
    else if (tok.k === "post") out.push(tok);
    else if (tok.k === "op") {
      while (stack.length) {
        const top = stack[stack.length - 1]!;
        if (top.k === "fn") {
          out.push(stack.pop()!);
          continue;
        }
        if (
          top.k === "op" &&
          (prec[top.v]! > prec[tok.v]! ||
            (prec[top.v] === prec[tok.v] && !rightAssoc[tok.v]))
        ) {
          out.push(stack.pop()!);
          continue;
        }
        break;
      }
      stack.push(tok);
    } else if (tok.k === "lp") stack.push(tok);
    else if (tok.k === "rp") {
      while (stack.length && stack[stack.length - 1]!.k !== "lp") out.push(stack.pop()!);
      if (!stack.length) throw new Error("скобки не сходятся");
      stack.pop();
      if (stack.length && stack[stack.length - 1]!.k === "fn") out.push(stack.pop()!);
    }
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.k === "lp" || top.k === "rp") throw new Error("скобки не сходятся");
    out.push(top);
  }
  return out;
}

function evalRpn(rpn: Tok[], vars: Record<string, number>, deg: boolean): number {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.k === "num") st.push(tok.v);
    else if (tok.k === "var") {
      if (!(tok.v in vars)) throw new Error(`нет значения «${tok.v}»`);
      st.push(vars[tok.v]!);
    } else if (tok.k === "post") {
      const a = st.pop();
      if (a === undefined) throw new Error("выражение оборвалось");
      st.push(tok.v === "%" ? a / 100 : factorial(a));
    } else if (tok.k === "op") {
      if (tok.v === "u-") {
        const a = st.pop();
        if (a === undefined) throw new Error("выражение оборвалось");
        st.push(-a);
        continue;
      }
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("выражение оборвалось");
      if (tok.v === "+") st.push(a + b);
      else if (tok.v === "-") st.push(a - b);
      else if (tok.v === "*") st.push(a * b);
      else if (tok.v === "/") {
        if (b === 0) throw new Error("деление на ноль");
        st.push(a / b);
      } else if (tok.v === "^") st.push(Math.pow(a, b));
      else throw new Error("операция");
    } else if (tok.k === "fn") {
      const a = st.pop();
      if (a === undefined) throw new Error("выражение оборвалось");
      st.push(applyFn(tok.v, a, deg));
    }
  }
  if (st.length !== 1 || !Number.isFinite(st[0]!)) throw new Error("не сошлось");
  return st[0]!;
}

export function evaluateExpr(expr: string, vars: Record<string, number>, deg: boolean): number {
  const src = prepMath(expr);
  if (!src) throw new Error("пусто");
  return evalRpn(toRpn(tokenize(src)), vars, deg);
}

export function calculate(
  expr: string,
  angle: "deg" | "rad",
): { ok: true; value: string } | { ok: false; error: string } {
  try {
    const value = formatNum(evaluateExpr(expr, {}, angle === "deg"));
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ошибка" };
  }
}

export function toKeySequence(raw: string): string[] | null {
  const s = prepMath(raw);
  if (!s) return null;
  const keys: string[] = [];
  const named = ["sqrt", "cbrt", "sin", "cos", "tan", "log", "ln", "abs", "pi"];
  let i = 0;
  while (i < s.length) {
    const name = named.find((n) => s.startsWith(n, i));
    if (name) {
      keys.push(name);
      i += name.length;
      continue;
    }
    const c = s[i]!;
    if ("0123456789.+-*/%^()!".includes(c)) {
      keys.push(c);
      i++;
      continue;
    }
    return null;
  }
  return keys;
}

function nums(q: string): number[] {
  return [...q.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
}

function fitPoly(expr: string): { a: number; b: number; c: number } | null {
  let y0: number;
  let y1: number;
  let y2: number;
  let y3: number;
  try {
    const f = (x: number) => evaluateExpr(expr, { x }, true);
    y0 = f(0);
    y1 = f(1);
    y2 = f(2);
    y3 = f(3);
  } catch {
    return null;
  }
  if (![y0, y1, y2, y3].every(Number.isFinite)) return null;
  const c = y0;
  const a = (y2 - 2 * y1 + y0) / 2;
  const b = y1 - a - c;
  const pred = a * 9 + b * 3 + c;
  if (Math.abs(pred - y3) > 1e-3 * (1 + Math.abs(y3))) return null;
  return { a, b, c };
}

function polyAnswer(a: number, b: number, c: number): { answer: string; steps: string[] } {
  const eps = 1e-8;
  if (Math.abs(a) < eps) {
    if (Math.abs(b) < eps) {
      const answer = Math.abs(c) < eps ? "бесконечно много решений" : "нет решений";
      return { answer, steps: ["После переноса переменная исчезла.", answer] };
    }
    const x = -c / b;
    return {
      answer: `x = ${formatNum(x)}`,
      steps: [
        `Привожу к виду ${formatNum(b)}x + (${formatNum(c)}) = 0.`,
        `Делю: x = ${formatNum(-c)} / ${formatNum(b)} = ${formatNum(x)}.`,
      ],
    };
  }
  const d = b * b - 4 * a * c;
  const head = `Привожу к виду ${formatNum(a)}x² + (${formatNum(b)})x + (${formatNum(c)}) = 0.`;
  const disc = `Дискриминант D = ${formatNum(b)}² − 4·${formatNum(a)}·${formatNum(c)} = ${formatNum(d)}.`;
  if (d < -1e-8) {
    return { answer: "нет действительных корней", steps: [head, disc, "D < 0, действительных корней нет."] };
  }
  if (Math.abs(d) < 1e-8) {
    const x = -b / (2 * a);
    return { answer: `x = ${formatNum(x)}`, steps: [head, disc, `Один корень: x = ${formatNum(x)}.`] };
  }
  const s = Math.sqrt(d);
  const r1 = (-b - s) / (2 * a);
  const r2 = (-b + s) / (2 * a);
  const lo = Math.min(r1, r2);
  const hi = Math.max(r1, r2);
  return {
    answer: `x = ${formatNum(lo)} и x = ${formatNum(hi)}`,
    steps: [head, disc, `x = ${formatNum(lo)} и x = ${formatNum(hi)}.`],
  };
}

function parseFormula(s: string): number | null {
  let i = 0;
  function parseSeq(stop?: string): number | null {
    let total = 0;
    let guard = 0;
    while (i < s.length && s[i] !== stop) {
      if (guard++ > 80) return null;
      let group = 0;
      if (s[i] === "(") {
        i++;
        const inner = parseSeq(")");
        if (inner === null || s[i] !== ")") return null;
        i++;
        group = inner;
      } else {
        const rest = s.slice(i);
        const sym = SYMBOLS.find((sym) => rest.startsWith(sym));
        if (!sym) return null;
        i += sym.length;
        group = MASS[sym]!;
      }
      let num = "";
      while (i < s.length && /\d/.test(s[i]!)) num += s[i++];
      total += group * (num ? Number(num) : 1);
    }
    return total;
  }
  const v = parseSeq();
  if (v === null || i !== s.length) return null;
  return v;
}

function canonicalizeFormula(src: string): string | null {
  if (/[A-Z]/.test(src)) return /^[A-Za-z0-9()]+$/.test(src) ? src : null;
  const lowerSyms = SYMBOLS.map((s) => s.toLowerCase()).sort((a, b) => b.length - a.length);
  let i = 0;
  let out = "";
  const s = src.toLowerCase();
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "(" || ch === ")" || /\d/.test(ch)) {
      out += ch;
      i++;
      continue;
    }
    const sym = lowerSyms.find((sym) => s.startsWith(sym, i));
    if (!sym) return null;
    out += SYMBOLS.find((x) => x.toLowerCase() === sym)!;
    i += sym.length;
  }
  return out;
}

function done(title: string, answer: string, steps: string[], lessonId?: string): Solution {
  return { ok: true, title, answer, steps, lessonId };
}

function fail(title: string, steps: string[]): Solution {
  return { ok: false, title, answer: "", steps };
}

export function rankLessons(q: string, lessons: Lesson[]): { lesson: Lesson; score: number }[] {
  const terms = q
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/i)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const gradeMatch = q.match(/(\d{1,2})\s*класс/);
  const grade = gradeMatch ? Number(gradeMatch[1]) : null;
  return lessons
    .map((lesson) => {
      const hay = `${lesson.topic} ${lesson.subject} ${lesson.summary} ${lesson.keys.join(" ")}`.toLowerCase();
      const keys = lesson.keys.map((k) => k.toLowerCase());
      let score = 0;
      for (const t of terms) {
        if (keys.some((k) => k === t || k.includes(t))) score += 3;
        else if (lesson.topic.toLowerCase().includes(t)) score += 2;
        else if (hay.includes(t)) score += 1;
      }
      if (grade && grade === lesson.grade) score += 2;
      if (lesson.subject.toLowerCase() && q.toLowerCase().includes(lesson.subject.toLowerCase())) score += 2;
      if (lesson.deep) score += 2;
      return { lesson, score };
    })
    .filter((row) => row.score >= 3)
    .sort((a, b) => b.score - a.score || Number(b.lesson.deep) - Number(a.lesson.deep));
}

function tryEquation(q: string): Solution | null {
  if (!q.includes("=")) return null;
  const parts = q.split("=");
  if (parts.length !== 2) return null;
  const leftSrc = prepMath(parts[0]!);
  const rightSrc = prepMath(parts[1]!);
  if (!leftSrc || !rightSrc) return null;
  if (!/[x]/.test(leftSrc + rightSrc)) return null;
  if (!/^[\d.x+\-*/^()%!a-z]+$/i.test(leftSrc) || !/^[\d.x+\-*/^()%!a-z]+$/i.test(rightSrc)) {
    return null;
  }
  const left = fitPoly(leftSrc);
  const right = fitPoly(rightSrc);
  if (!left || !right) return null;
  const solved = polyAnswer(left.a - right.a, left.b - right.b, left.c - right.c);
  return done("Уравнение", solved.answer, ["Мини-модель сводит обе части к многочлену не выше 2-й степени.", ...solved.steps]);
}

function tryArithmetic(q: string): Solution | null {
  let text = q
    .replace(/сколько будет|посчитай|вычисли|найди значение|равно\??/gi, "")
    .replace(/квадратный корень из|корень из/gi, "sqrt")
    .trim();
  if (!text) return null;
  if (text.includes("=")) return null;
  const math = prepMath(text);
  if (!/^[\d.+\-*/^()%!a-z]+$/i.test(math)) return null;
  if (!/\d/.test(math)) return null;
  if (/[a-z]/.test(math.replace(/sqrt|cbrt|sin|cos|tan|log|ln|abs|pi|e/g, ""))) return null;
  try {
    const value = formatNum(evaluateExpr(math, {}, true));
    return done("Счёт", value, [`Выражение: ${text}`, `Значение: ${value}`]);
  } catch {
    return null;
  }
}

export function solve(question: string, lessons: Lesson[]): Solution {
  const q = question.trim().replace(/\s+/g, " ");
  if (!q) return fail("Пусто", ["Напиши задачу или открой учебник."]);

  const blank = q.toLowerCase().match(/[а-яё]_[а-яё]+|[а-яё]+_[а-яё]/);
  if (blank && SPELL[blank[0]]) {
    const hit = SPELL[blank[0]]!;
    return done("Орфограмма", hit.answer, [hit.rule, `В слове пропуск: ${hit.answer}.`]);
  }

  const percentOf = q.match(/(\d+(?:[.,]\d+)?)\s*%\s*от\s*(\d+(?:[.,]\d+)?)/i);
  if (percentOf) {
    const p = Number(percentOf[1]!.replace(",", "."));
    const base = Number(percentOf[2]!.replace(",", "."));
    const value = (p / 100) * base;
    return done("Проценты", formatNum(value), [
      `${formatNum(p)}% — это ${formatNum(p)}/100 = ${formatNum(p / 100)}.`,
      `${formatNum(p / 100)} · ${formatNum(base)} = ${formatNum(value)}.`,
    ]);
  }

  const share = q.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*от\s*(\d+(?:[.,]\d+)?)/i);
  if (share) {
    const a = Number(share[1]!.replace(",", "."));
    const b = Number(share[2]!.replace(",", "."));
    const base = Number(share[3]!.replace(",", "."));
    if (b !== 0) {
      const value = (a / b) * base;
      return done("Доля", formatNum(value), [
        `Доля ${formatNum(a)}/${formatNum(b)} = ${formatNum(a / b)}.`,
        `${formatNum(a / b)} · ${formatNum(base)} = ${formatNum(value)}.`,
      ]);
    }
  }

  const whatPercent = q.match(
    /сколько процентов(?:\s+составляет)?\s+(\d+(?:[.,]\d+)?)\s+от\s+(\d+(?:[.,]\d+)?)/i,
  );
  if (whatPercent) {
    const a = Number(whatPercent[1]!.replace(",", "."));
    const b = Number(whatPercent[2]!.replace(",", "."));
    if (b !== 0) {
      const value = (a / b) * 100;
      return done("Проценты", `${formatNum(value)}%`, [
        `Делю часть на целое: ${formatNum(a)} / ${formatNum(b)} = ${formatNum(a / b)}.`,
        `Умножаю на 100: ${formatNum(value)}%.`,
      ]);
    }
  }

  if (/(?:^|[^а-яёa-z])нод(?:[^а-яёa-z]|$)/i.test(q) || /наибольш(ий|его)\s+общ(ий|его)\s+делител/i.test(q)) {
    const ns = nums(q).map((n) => Math.round(n));
    if (ns.length >= 2 && ns.every((n) => n > 0)) {
      const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
      const value = ns.reduce((a, b) => gcd(a, b));
      return done("НОД", formatNum(value), [`НОД(${ns.join(", ")}) = ${formatNum(value)}.`]);
    }
  }

  if (/(?:^|[^а-яёa-z])нок(?:[^а-яёa-z]|$)/i.test(q) || /наименьш(ее|его)\s+общ(ее|его)\s+кратн/i.test(q)) {
    const ns = nums(q).map((n) => Math.round(n));
    if (ns.length >= 2 && ns.every((n) => n > 0)) {
      const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
      const lcm = ns.reduce((a, b) => (a / gcd(a, b)) * b);
      return done("НОК", formatNum(lcm), [`НОК(${ns.join(", ")}) = ${formatNum(lcm)}.`]);
    }
  }

  if (/молярн|молекулярн/.test(q.toLowerCase())) {
    const token = q.match(/([A-Za-z][A-Za-z0-9()]*|\b[a-z][a-z0-9()]*)/);
    const raw = token?.[1];
    if (raw && /[a-z]/i.test(raw) && !/моляр|масс|формул/i.test(raw)) {
      const canon = canonicalizeFormula(raw);
      const mass = canon ? parseFormula(canon) : null;
      if (canon && mass !== null) {
        return done("Молярная масса", `${formatNum(mass)} г/моль`, [
          `Формула ${canon}: складываю атомные массы с учётом индексов.`,
          `M(${canon}) = ${formatNum(mass)} г/моль.`,
        ]);
      }
    }
  }

  const low = q.toLowerCase();
  const ns = nums(q);

  if (/площад/.test(low) && /треугольник/.test(low) && ns.length >= 2) {
    const area = 0.5 * ns[0]! * ns[1]!;
    return done("Площадь треугольника", formatNum(area), [
      "S = (1/2) · основание · высота.",
      `S = 1/2 · ${formatNum(ns[0]!)} · ${formatNum(ns[1]!)} = ${formatNum(area)}.`,
    ]);
  }

  if (/площад/.test(low) && /прямоугольник/.test(low) && ns.length >= 2) {
    const area = ns[0]! * ns[1]!;
    return done("Площадь прямоугольника", formatNum(area), [
      "S = длина · ширина.",
      `S = ${formatNum(ns[0]!)} · ${formatNum(ns[1]!)} = ${formatNum(area)}.`,
    ]);
  }

  if (/площад/.test(low) && /квадрат/.test(low) && ns.length >= 1) {
    const area = ns[0]! * ns[0]!;
    return done("Площадь квадрата", formatNum(area), [
      "S = a².",
      `S = ${formatNum(ns[0]!)}² = ${formatNum(area)}.`,
    ]);
  }

  if (/площад/.test(low) && /круг/.test(low) && ns.length >= 1) {
    const area = Math.PI * ns[0]! * ns[0]!;
    return done("Площадь круга", formatNum(area), [
      "S = πr².",
      `S = π · ${formatNum(ns[0]!)}² ≈ ${formatNum(area)}.`,
    ]);
  }

  if ((/длин/.test(low) && /окружност/.test(low)) || (/периметр/.test(low) && /круг/.test(low))) {
    if (ns.length >= 1) {
      const len = 2 * Math.PI * ns[0]!;
      return done("Длина окружности", formatNum(len), [
        "C = 2πr.",
        `C = 2π · ${formatNum(ns[0]!)} ≈ ${formatNum(len)}.`,
      ]);
    }
  }

  if ((/катет/.test(low) && /гипотенуз/.test(low)) || /пифагор/.test(low)) {
    if (ns.length >= 2) {
      const h = Math.sqrt(ns[0]! ** 2 + ns[1]! ** 2);
      return done("Теорема Пифагора", formatNum(h), [
        "c = √(a² + b²).",
        `c = √(${formatNum(ns[0]!)}² + ${formatNum(ns[1]!)}²) = ${formatNum(h)}.`,
      ]);
    }
  }

  if (/объ[её]м/.test(low) && /куб/.test(low) && ns.length >= 1) {
    const v = ns[0]! ** 3;
    return done("Объём куба", formatNum(v), [`V = a³ = ${formatNum(ns[0]!)}³ = ${formatNum(v)}.`]);
  }

  if (/скорост/.test(low) && ns.length >= 2) {
    const v = ns[0]! / ns[1]!;
    const unit = /км/.test(low) ? "км/ч" : /мин/.test(low) ? "м/мин" : "м/с";
    return done("Скорость", `${formatNum(v)} ${unit}`, [
      "v = s / t.",
      `v = ${formatNum(ns[0]!)} / ${formatNum(ns[1]!)} = ${formatNum(v)} ${unit}.`,
    ]);
  }

  if (/сил[аеу]/.test(low) && /масс/.test(low) && /ускор/.test(low) && ns.length >= 2) {
    const f = ns[0]! * ns[1]!;
    return done("Второй закон Ньютона", `${formatNum(f)} Н`, [
      "F = ma.",
      `F = ${formatNum(ns[0]!)} · ${formatNum(ns[1]!)} = ${formatNum(f)} Н.`,
    ]);
  }

  if (/сила тока|ток/.test(low) && /напряжен/.test(low) && /сопротив/.test(low) && ns.length >= 2) {
    const i = ns[0]! / ns[1]!;
    return done("Закон Ома", `${formatNum(i)} А`, [
      "I = U / R.",
      `I = ${formatNum(ns[0]!)} / ${formatNum(ns[1]!)} = ${formatNum(i)} А.`,
    ]);
  }

  if (/плотн/.test(low) && /масс/.test(low) && ns.length >= 2) {
    const rho = ns[0]! / ns[1]!;
    return done("Плотность", `${formatNum(rho)}`, [
      "ρ = m / V.",
      `ρ = ${formatNum(ns[0]!)} / ${formatNum(ns[1]!)} = ${formatNum(rho)}.`,
    ]);
  }

  const equation = tryEquation(q);
  if (equation) return equation;

  const arithmetic = tryArithmetic(q);
  if (arithmetic) return arithmetic;

  const ranked = rankLessons(q, lessons);
  const best = ranked[0];
  if (best) {
    const lesson = best.lesson;
    const steps = [...lesson.rules];
    if (lesson.example) steps.push(`Пример. ${lesson.example}`);
    if (!lesson.deep) steps.push("Это конспект программы, не дословный текст учебника.");
    return done(
      `${lesson.grade} класс · ${lesson.subject}`,
      lesson.summary,
      steps,
      lesson.id,
    );
  }

  return fail("Не узнала", [
    "Мини-модель считает школьные выражения, уравнения до 2-й степени, доли, проценты, НОД и НОК, площади, скорость, силу, закон Ома и молярную массу.",
    "По остальным урокам ищет конспект. Если тема не нашлась — спроси Grok отдельно, это уже не локальная модель.",
  ]);
}

const proc = (globalThis as { process?: { argv?: string[]; exit?: (code: number) => void } }).process;
const isCheck = typeof proc !== "undefined" && !!proc.argv?.includes("--check");
if (isCheck) {
  const samples = [
    ["48 + 27", "75"],
    ["3/4 от 36", "27"],
    ["15% от 240", "36"],
    ["2x + 5 = 17", "x = 6"],
    ["2(x-3)=10", "x = 8"],
    ["x^2 - 5x + 6 = 0", "x = 2 и x = 3"],
    ["площадь треугольника основание 8 высота 5", "20"],
    ["катеты 3 и 4, найти гипотенузу", "5"],
    ["скорость если путь 120 км и время 2 ч", "60 км/ч"],
    ["сила если масса 4 кг и ускорение 3 м/с^2", "12 Н"],
    ["молярная масса H2O", "18 г/моль"],
    ["молярная масса Ca(OH)2", "74 г/моль"],
    ["НОД чисел 12 и 18", "6"],
    ["НОК чисел 4 и 6", "12"],
    ["орфограмма жи-ши: ж_знь", "жизнь"],
    ["sqrt(144)", "12"],
    ["sin(30)", "0.5"],
    ["5!", "120"],
    ["-3^2", "-9"],
    ["сколько процентов составляет 12 от 48", "25%"],
  ] as const;
  let bad = 0;
  for (const [q, expect] of samples) {
    const got = solve(q, []).answer;
    if (got !== expect) {
      bad++;
      console.log("FAIL", JSON.stringify(q), "got", JSON.stringify(got), "want", expect);
    }
  }
  const keys = toKeySequence("15%*240");
  if (!keys || keys.join("") !== "15%*240") {
    bad++;
    console.log("FAIL keys", keys);
  }
  console.log(bad ? `failed ${bad}` : "all ok");
  proc?.exit?.(bad ? 1 : 0);
}
