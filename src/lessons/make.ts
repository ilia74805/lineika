import type { Lesson } from "../engine";

// Короткий конструктор записи конспекта. Ключевые слова (keys) — в нижнем регистре,
// по ним мини-модель ищет тему.
export function make(
  grade: number,
  subject: string,
  topic: string,
  summary: string,
  rules: string[],
  example: string,
  keys: string[],
): Lesson {
  return {
    id: `${grade}|${subject}|${topic}`,
    grade,
    subject,
    topic,
    summary,
    rules,
    example,
    keys,
    deep: false,
  };
}
