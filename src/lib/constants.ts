export const KINDS = ['걷기', '스트레칭', '근력운동', '체조', '자전거', '수영', '기타'];
export const LEVELS = ['가볍게', '보통', '힘들게'];
export const MEALS = ['아침', '점심', '저녁', '간식'];
export const MAIN3 = ['아침', '점심', '저녁'];
export const AMOUNTS = ['적게', '보통', '많이'];

/** 이번 주 운동 목표(분) */
export const WEEK_GOAL = 150;

/** 지금 시각에 맞는 끼니 */
export const autoMeal = (h = new Date().getHours()) => (h < 10 ? '아침' : h < 15 ? '점심' : h < 21 ? '저녁' : '간식');
