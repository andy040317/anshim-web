// 선 아이콘 모음 (24×24). 사용: <Icon name="search" size={20} />
export const ICONS = {
  back: ['M15 18l-6-6 6-6'], close: ['M6 6l12 12M18 6 6 18'], plus: ['M12 5v14M5 12h14'], check: ['m5 12 5 5 9-10'],
  search: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'm20 20-3.5-3.5'],
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
  pin: ['M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z', 'M14.5 9a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'],
  locate: ['M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', 'M12 2v3M12 19v3M2 12h3M19 12h3'],
  cctv: ['M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'm16 11 6-3v8l-6-3'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  fire: ['M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 2 4 1-3 0-5 1-8z'],
  store: ['M3 9l2-5h14l2 5', 'M4 9v11h16V9', 'M10 20v-6h4v6'],
  map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14M15 6v14'],
  users: ['M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.5a6.5 6.5 0 0 1 3.5 5.5'],
  user: ['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M4 21a8 8 0 0 1 16 0'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  sun: ['M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  alert: ['M12 3 2 21h20L12 3z', 'M12 10v5M12 18h.01'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 11v5M12 8h.01'],
  left: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 6 6v5'], right: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0-6 6v5'],
  straight: ['M12 20V4', 'M6 10l6-6 6 6'], flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'], edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  lock: ['M6 11h12v10H6z', 'M8 11V7a4 4 0 0 1 8 0v4'], message: ['M4 5h16v11H8l-4 4z'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  layers: ['M12 3 2 8l10 5 10-5z', 'M2 13l10 5 10-5'],
  logout: ['M14 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h11'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7v5l3 2'],
  signal: ['M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16'],
  swap: ['M7 4v16M7 4 3 8M7 4l4 4', 'M17 20V4M17 20l-4-4M17 20l4-4'],
};

export default function Icon({ name, size = 20, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(ICONS[name] || []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// 카카오맵 오버레이(HTML 문자열)에 넣을 때 쓰는 SVG 문자열
export function iconSvg(name, size = 14, color = 'currentColor') {
  const paths = (ICONS[name] || []).map(d => `<path d="${d}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
