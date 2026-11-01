// 구간 위험도 불러오기 + 경로 위험도 계산
// 데이터: public/data/risk/ (scripts/step5_export_web.py 가 만든 1km 칸 파일들)
// 실제 서비스에서는 백엔드 POST /routes 가 PostgreSQL 에 저장된 구간 위험도로 이 계산을 함 (FR-06)
import { RISK_DIR, RISK_MATCH_M, NIGHT_HOURS, DARK_HOURS } from '../config';
import { samplePath } from './geo';

const SAMPLE_M = 20; // 경로를 20m 간격 점으로 나눠서 검사
let metaPromise = null;
const tileCache = new Map(); // 칸 번호 → Promise(칸 데이터)

// 시간 구분 (화면 표시용)
export function timeInfo(hour) {
  const night = NIGHT_HOURS.includes(hour);
  const dark = DARK_HOURS.includes(hour);
  return {
    night, dark,
    label: night ? '심야 기준' : dark ? '야간 기준' : '주간 기준',
    desc: night
      ? '심야(22~04시)에는 골목·보안등에 더해 유흥주점 밀집 구간을 더 위험하게 계산해요.'
      : dark
        ? '어두운 시간(18~06시)에는 골목과 보안등 유무를 위험도에 반영해요.'
        : '낮에는 범죄주의구간·유동인구·CCTV·대피 거점을 기준으로 계산해요.',
  };
}

// 칸 정보 파일(meta.json) 한 번만 불러오기
export function loadRiskMeta() {
  if (!metaPromise) {
    metaPromise = fetch(RISK_DIR + '/meta.json')
      .then(r => {
        if (!r.ok) throw new Error('missing');
        return r.json();
      })
      .then(m => ({ ...m, tileSet: new Set(m.tiles) }))
      .catch(() => {
        metaPromise = null; // 다음에 다시 시도할 수 있게
        throw new Error('위험도 데이터가 없어요. 프로젝트 폴더에서 py scripts/step5_export_web.py 를 실행해 주세요.');
      });
  }
  return metaPromise;
}

const tileKey = (m, lat, lng) => Math.floor((lng - m.lng0) / m.tileLng) + '_' + Math.floor((lat - m.lat0) / m.tileLat);

// 칸 파일 하나 불러와서 계산하기 쉬운 모양으로 바꿈
function loadTile(m, key) {
  if (!m.tileSet.has(key)) return Promise.resolve(null); // 도로가 없는 칸 (산·강 등)
  if (!tileCache.has(key)) {
    const p = fetch(`${RISK_DIR}/t_${key}.json`)
      .then(r => r.json())
      .then(d => {
        const n = d.lat.length;
        const risk = new Uint8Array(n * 24);
        for (let i = 0; i < risk.length; i++) risk[i] = parseInt(d.risk.substr(i * 2, 2), 16); // 16진수 2글자 → 숫자
        return {
          n, risk,
          lat: Float64Array.from(d.lat, v => v / 1e5),
          lng: Float64Array.from(d.lng, v => v / 1e5),
          lamp: d.lamp, alley: d.alley, crime: d.crime,
          bar: d.bar || new Array(n).fill(0), // 예전 칸 파일에는 bar 가 없을 수 있음
        };
      })
      .catch(() => {
        tileCache.delete(key);
        return null;
      });
    tileCache.set(key, p);
  }
  return tileCache.get(key);
}

// 경로(점 배열) + 출발 시각 → 경로 위험도와 근거
export async function routeRisk(pts, hour) {
  const m = await loadRiskMeta();
  const samples = samplePath(pts, SAMPLE_M);

  // 경로 점 주변의 칸들을 모두 불러옴 (칸 경계 근처 구간도 찾을 수 있게 약간 넓게)
  const dLat = RISK_MATCH_M / 111320;
  const dLng = RISK_MATCH_M / (111320 * Math.cos((samples[0].lat * Math.PI) / 180));
  const keysOf = p => [...new Set([
    tileKey(m, p.lat - dLat, p.lng - dLng), tileKey(m, p.lat - dLat, p.lng + dLng),
    tileKey(m, p.lat + dLat, p.lng - dLng), tileKey(m, p.lat + dLat, p.lng + dLng),
  ])];
  const allKeys = [...new Set(samples.flatMap(keysOf))];
  const tiles = new Map(await Promise.all(allKeys.map(async k => [k, await loadTile(m, k)])));

  // 점마다 가장 가까운 도로 구간 찾기 (짧은 거리라 평면 거리로 계산)
  const kx = 111320 * Math.cos((samples[0].lat * Math.PI) / 180), ky = 111320;
  let riskSum = 0, matched = 0, lamp = 0, alley = 0, crimeHigh = 0, barZone = 0, motor = false;
  const night = NIGHT_HOURS.includes(hour);
  samples.forEach(p => {
    let best = null, bestD = RISK_MATCH_M * RISK_MATCH_M;
    keysOf(p).forEach(k => {
      const t = tiles.get(k);
      if (!t) return;
      for (let i = 0; i < t.n; i++) {
        const dx = (t.lng[i] - p.lng) * kx, dy = (t.lat[i] - p.lat) * ky;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { t, i }; }
      }
    });
    if (!best) { riskSum += m.hourMean[hour]; return; } // 근처에 구간이 없으면 대구 평균
    const { t, i } = best;
    const r = t.risk[i * 24 + hour];
    riskSum += r;
    matched++;
    if (r >= 100) motor = true;          // 자동차전용도로
    if (t.lamp[i]) lamp++;
    if (t.alley[i] >= 10) alley++;
    if (t.crime[i] >= 7) crimeHigh++;
    if (night && t.bar[i] >= 2) barZone++; // 심야에 100m 안 유흥주점 2곳 이상 = 밀집 구간
  });

  const n = samples.length;
  const pct = v => (matched ? Math.round((100 * v) / matched) : 0);
  return {
    risk: Math.round(riskSum / n),            // 경로 평균 위험도 (0~100)
    matchedPct: Math.round((100 * matched) / n),
    lampPct: pct(lamp),                       // 보안등 설치 구간 비율
    alleyPct: pct(alley),                     // 골목 비율
    crimeHighM: crimeHigh * SAMPLE_M,         // 범죄주의 7등급 이상 구간 길이(m)
    barZoneM: barZone * SAMPLE_M,             // 심야 유흥업소 밀집 구간 길이(m), 낮에는 0
    motor,
  };
}
