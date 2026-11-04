import type { Lesson } from "./engine";

// Заглушка: настоящие конспекты 1–11 классов ещё не добавлены.
// Формат записи — тип Lesson из engine.ts.
export const LESSONS: Lesson[] = [];

export function lessonsFor(grade: number, subject: string): Lesson[] {
  return LESSONS.filter((lesson) => lesson.grade === grade && lesson.subject === subject);
}

export function subjectsFor(grade: number): string[] {
  return [...new Set(LESSONS.filter((lesson) => lesson.grade === grade).map((lesson) => lesson.subject))];
}
