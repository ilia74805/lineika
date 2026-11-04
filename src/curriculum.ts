import type { Lesson } from "./engine";
import { GRADE_1 } from "./lessons/grade1";
import { GRADE_2 } from "./lessons/grade2";
import { GRADE_3 } from "./lessons/grade3";
import { GRADE_4 } from "./lessons/grade4";
import { GRADE_5 } from "./lessons/grade5";
import { GRADE_6 } from "./lessons/grade6";
import { GRADE_7 } from "./lessons/grade7";
import { GRADE_8 } from "./lessons/grade8";
import { GRADE_9 } from "./lessons/grade9";
import { GRADE_10 } from "./lessons/grade10";
import { GRADE_11 } from "./lessons/grade11";

// Конспекты программы 1–11 классов. Написаны по общей школьной программе,
// не по конкретному учебнику: сверяй с тем, по чему учится класс.
export const LESSONS: Lesson[] = [
  ...GRADE_1,
  ...GRADE_2,
  ...GRADE_3,
  ...GRADE_4,
  ...GRADE_5,
  ...GRADE_6,
  ...GRADE_7,
  ...GRADE_8,
  ...GRADE_9,
  ...GRADE_10,
  ...GRADE_11,
];

export function lessonsFor(grade: number, subject: string): Lesson[] {
  return LESSONS.filter((lesson) => lesson.grade === grade && lesson.subject === subject);
}

export function subjectsFor(grade: number): string[] {
  return [...new Set(LESSONS.filter((lesson) => lesson.grade === grade).map((lesson) => lesson.subject))];
}
