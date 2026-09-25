/** youtu.be/, ?v=, /shorts/, /embed/, /live/ 뒤의 11자, 또는 11자 ID 만 입력한 경우 */
export const ytIdOf = (u: string | null | undefined): string | null => {
  const s = (u || '').trim();
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null;
};

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// --- IFrame Player API (필요한 부분만) ---------------------------------------
export interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YT_PLAYING = 1;
export const YT_ENDED = 0;

let ytPromise: Promise<YTNamespace> | null = null;

export const loadYT = (): Promise<YTNamespace> =>
  ytPromise ||
  (ytPromise = new Promise<YTNamespace>((res, rej) => {
    if (window.YT?.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) res(window.YT);
    };
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = () => {
      ytPromise = null;
      sc.remove();
      rej(new Error('youtube api'));
    };
    document.head.appendChild(sc);
  }));
