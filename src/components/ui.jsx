// 여러 화면에서 같이 쓰는 작은 부품들
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import Icon from './Icon';

// 이름표 + 입력칸 + 안내/오류 문구
export function Field({ id, label, type = 'text', value, onChange, placeholder, msg, msgKind, autoComplete, right, inputMode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <input id={id} className="input" type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode}
          aria-invalid={msg && msgKind === 'err' ? 'true' : 'false'} aria-describedby={msg ? id + '-msg' : undefined}
          onChange={e => onChange(e.target.value)} />
        {right}
      </div>
      {msg && <p id={id + '-msg'} className={'field-msg ' + (msgKind || '')}>{msg}</p>}
    </div>
  );
}

// 화면 위쪽 제목 줄
export function TopBar({ title, sub, onBack, right }) {
  return (
    <header className="topbar">
      {onBack && <button className="icon-btn" aria-label="뒤로 가기" onClick={onBack}><Icon name="back" size={22} /></button>}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: onBack ? 0 : 8 }}>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

// 하단 탭 (지도 / 보호자 / 내 정보) + 안내 중이면 돌아가기 줄
export function TabBar({ current }) {
  const app = useApp();
  const tabs = [['main', 'map', '지도'], ['guardians', 'users', '보호자'], ['myinfo', 'user', '내 정보']];
  const guiding = app.guide && !app.guide.arrived;
  return (
    <>
      {guiding && (
        <button className="resume-bar" onClick={() => app.go('guide')}>
          <Icon name="map" size={16} /><span className="grow">{app.guide.dest.name}(으)로 안내 중이에요 · 안내 화면으로 돌아가기</span>
        </button>
      )}
      <nav className="tabbar" aria-label="주요 메뉴">
        {tabs.map(([key, icon, label]) => (
          <button key={key} className="tab" aria-current={current === key ? 'page' : undefined} onClick={() => app.go(key)}>
            <Icon name={icon} size={22} />{label}
          </button>
        ))}
      </nav>
    </>
  );
}

// 아래에서 올라오는 시트
export function Sheet({ label, onClose, children }) {
  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-handle" />
        {children}
      </section>
    </div>
  );
}

// 손가락(또는 마우스)으로 끌어서 올리고 내리는 아래 시트 — 지도 화면용
//   peek     : 접혀 있어도 항상 보이는 윗줄. 이 부분(손잡이 포함)을 잡고 끌어요
//   children : 끌어 올리면 보이는 내용
//   above    : 시트 바로 위에 붙어서 같이 움직이는 것 (예: 내 위치·SOS 버튼 줄)
//   snaps    : 멈추는 높이 목록 (낮은 것부터). 'peek' = 윗줄만, 'full' = 내용 전부, 숫자 = 그 높이(px)
//              ['peek', 'full'] → 2단계(접힘·펼침),  ['peek', 320, 'full'] → 3단계(접힘·반쯤·펼침)
//   maxRatio : 끝까지 올렸을 때 지도 높이의 몇 %까지 덮을지. 내용이 더 길면 시트 안에서 스크롤
const FLICK_SPEED = 0.4; // 이보다 빠르게(px/ms) 튕기면 가까운 단계 대신 튕긴 방향의 다음 단계로
const DRAG_START_PX = 6; // 이만큼은 움직여야 '끌기'로 봄 (그보다 적으면 '누름')

export function DragSheet({ label, peek, children, above, snaps = ['peek', 'full'], maxRatio = 0.7 }) {
  const wrapRef = useRef(null);   // 시트 + above 를 감싼 상자 (통째로 위아래로 움직임)
  const sheetRef = useRef(null);  // 시트
  const headRef = useRef(null);   // 손잡이 + 윗줄 = 끄는 곳
  const bodyRef = useRef(null);   // 아래 내용 칸 (넘치면 스크롤)
  const innerRef = useRef(null);  // 아래 내용 (높이 재기용)
  const drag = useRef(null);      // 끄는 중 기록 (시작 위치, 속도 등)
  const justDragged = useRef(false); // 방금 끌었으면 이어서 오는 '누름'을 무시하기 위한 표시
  const bodyId = useId();
  const [size, setSize] = useState({ peek: 0, full: 0 }); // 잰 높이(px): 윗줄만 / 내용 전부
  const [index, setIndex] = useState(0);    // 지금 멈춰 있는 단계 (0 = 가장 낮음)
  const [dragH, setDragH] = useState(null); // 끄는 중의 시트 높이 (끌지 않을 때는 null)

  // 시트 높이 재기: 처음 그릴 때 + 내용이나 화면 크기가 바뀔 때마다
  useLayoutEffect(() => {
    const area = wrapRef.current.parentElement; // 시트가 들어 있는 지도 영역
    const measure = () => {
      const sheet = sheetRef.current;
      const border = sheet.offsetHeight - sheet.clientHeight; // 시트 윗선 두께
      const peekH = headRef.current.offsetHeight + border;
      const fullH = Math.max(peekH, Math.min(peekH + innerRef.current.offsetHeight, area.clientHeight * maxRatio));
      setSize(s => (s.peek === peekH && s.full === fullH ? s : { peek: peekH, full: fullH }));
    };
    measure();
    const ro = new ResizeObserver(measure); // ResizeObserver: 요소 크기가 바뀌면 알려주는 브라우저 기능
    [headRef.current, innerRef.current, area].forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, [maxRatio]);

  // 단계별 높이(px)
  const heights = snaps.map(s => (s === 'peek' ? size.peek : s === 'full' ? size.full : Math.min(Math.max(s, size.peek), size.full)));
  const last = heights.length - 1;
  const shown = dragH ?? heights[index];     // 지금 보이는 시트 높이 (끄는 중이면 손가락 위치)
  const bodyHidden = shown <= size.peek + 1; // 아래 내용이 하나도 안 보이는 상태

  // 내용이 안 보일 때는 키보드(Tab)로도 들어가지 않게 막음 (inert: 안의 요소를 누를 수 없게 하는 기능)
  useEffect(() => { if (bodyRef.current) bodyRef.current.inert = bodyHidden; }, [bodyHidden]);

  // 손을 뗐을 때 멈출 단계: 빠르게 튕겼으면 그 방향의 다음 단계, 아니면 가장 가까운 단계
  const settle = (h, speed) => {
    let next = 0;
    heights.forEach((hh, i) => { if (Math.abs(hh - h) < Math.abs(heights[next] - h)) next = i; });
    if (speed > FLICK_SPEED) {          // 위로 튕김
      const up = heights.findIndex(hh => hh > h + 1);
      next = up === -1 ? last : up;
    } else if (speed < -FLICK_SPEED) {  // 아래로 튕김
      next = 0;
      heights.forEach((hh, i) => { if (hh < h - 1) next = i; });
    }
    setIndex(next);
  };

  // ── 끌기 (Pointer 이벤트: 터치·마우스·펜을 한 번에 처리) ──
  const onPointerDown = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 마우스는 왼쪽 버튼만
    justDragged.current = false;
    drag.current = { id: e.pointerId, y0: e.clientY, h0: heights[index], h: heights[index], y: e.clientY, t: e.timeStamp, speed: 0, moving: false };
  };
  const onPointerMove = e => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = d.y0 - e.clientY; // 위로 끌면 +, 아래로 끌면 -
    if (!d.moving) {
      if (Math.abs(dy) < DRAG_START_PX) return;
      d.moving = true;
      e.currentTarget.setPointerCapture(e.pointerId); // 손가락이 윗줄 밖으로 나가도 계속 따라가게
    }
    if (e.timeStamp > d.t) d.speed = (d.y - e.clientY) / (e.timeStamp - d.t); // 속도 (px/ms, 위로 +)
    d.y = e.clientY;
    d.t = e.timeStamp;
    d.h = Math.min(heights[last], Math.max(heights[0], d.h0 + dy)); // 가장 낮은~가장 높은 단계 사이로 제한
    setDragH(d.h);
  };
  const onPointerEnd = e => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moving) return; // 끌지 않았으면 아래 onHeadClick 이 '누름'으로 처리
    justDragged.current = true;
    settle(d.h, e.timeStamp - d.t > 120 ? 0 : d.speed); // 멈췄다가 손을 뗀 건 튕김이 아님
    setDragH(null);
  };

  // 윗줄 누름(또는 손잡이에서 키보드 Enter): 한 단계 위로, 맨 위면 맨 아래로
  const onHeadClick = e => {
    if (justDragged.current) { justDragged.current = false; return; }
    // 윗줄 안에 다른 버튼·링크가 있으면 그건 그 버튼의 일로 둠
    if (e.target.closest('a, input, select, textarea, button:not(.dsheet-handle)')) return;
    setIndex(i => (i < last ? i + 1 : 0));
  };

  return (
    // translateY: 시트를 (전체 높이 - 보이는 높이)만큼 아래로 내려서 나머지를 지도 영역 밖으로 숨김
    <div ref={wrapRef} className={'dsheet-wrap' + (dragH !== null ? ' dragging' : '')} style={{ transform: `translateY(${size.full - shown}px)` }}>
      {above}
      <section ref={sheetRef} className="dsheet" aria-label={label} style={{ height: size.full || undefined }}>
        <div ref={headRef} className="dsheet-head" onClick={onHeadClick}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          <button type="button" className="dsheet-handle" aria-controls={bodyId} aria-expanded={bodyHidden ? 'false' : 'true'}
            aria-label={label + (index < last ? ' 펼치기' : ' 접기')} />
          {peek}
        </div>
        <div ref={bodyRef} id={bodyId} className="dsheet-body">
          <div ref={innerRef} className="dsheet-inner">{children}</div>
        </div>
      </section>
    </div>
  );
}

// 켜고 끄는 스위치
export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked ? 'true' : 'false'} className="switch-row" disabled={disabled} onClick={() => onChange(!checked)}>
      <span>{label}{hint && <small>{hint}</small>}</span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}

// 글자 복사 버튼 (복사가 막힌 환경이면 안내)
export function CopyButton({ text, label = '복사' }) {
  const app = useApp();
  const fail = () => app.showToast('복사하지 못했어요. 글자를 길게 눌러 직접 복사해 주세요.');
  const copy = () => {
    try { navigator.clipboard.writeText(text).then(() => app.showToast('복사했어요.'), fail); } catch (e) { fail(); }
  };
  return <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Icon name="copy" size={16} />{label}</button>;
}

// 심야/주간 표시
export function TimePill({ night, text }) {
  return (
    <span className={'time-pill ' + (night ? 'night' : 'day')}>
      <Icon name={night ? 'moon' : 'sun'} size={13} />{text || (night ? '심야 가중치 적용 중' : '주간 기준')}
    </span>
  );
}
