// Состояние прохождения. Всё, что видит игрок, выводится отсюда.
// Показатели дружбы и внимания игрок не видит: только поведение мира.

export const DAY_LENGTH = 75; // секунд на весь день и ночь
export const NIGHT_AT = 50; // с этой секунды дня начинается ночь

export type SpecialistId = "jeweler" | "mathematician" | "gardener";
export type NpcId = SpecialistId | "friend";

function makeState() {
  return {
    day: 1,
    dayTime: 0,
    missedToday: 0, // сколько улик пропущено за день (не записаны)
    tense: false, // город настроен против героя с наступлением ночи
    diary: [] as string[], // записанные улики
    friendship: { jeweler: 0, mathematician: 0, gardener: 0, friend: 0 } as Record<NpcId, number>,
    attention: { jeweler: 0, mathematician: 0, gardener: 0 } as Record<SpecialistId, number>,
    gone: new Set<NpcId>(),
    bossDefeated: false,
  };
}

export let state = makeState();

export function resetState(): void {
  state = makeState();
}
