"""DB 테이블 정의 (요구사항 규격서 5장 내부 데이터 요구사항)
  users          사용자 계정 + 위치 동의
  guardians      보호자 (IDR-05)
  shares         위치공유 상태 (IDR-07) + 공유 중 최근 위치 (IDR-03)
  share_guardians 공유 ↔ 받는 보호자 연결
  sos_events     긴급 신고 기록 (IDR-06, 실제 112 접수·출동 상태는 관리하지 않음)
시각은 모두 UTC(세계 표준시)로 저장하고, API 응답에서는 밀리초 숫자로 바꿔서 줌
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now_utc():
    return datetime.now(timezone.utc)


def as_utc(dt):
    """SQLite 는 시간대 정보를 버리고 저장하므로, 읽을 때 UTC 로 다시 붙여 줌 (PostgreSQL 은 그대로)"""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def to_ms(dt):
    """datetime → 밀리초 숫자 (프론트에서 쓰는 형식). 없으면 None"""
    dt = as_utc(dt)
    return int(dt.timestamp() * 1000) if dt else None


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login_id: Mapped[str] = mapped_column(String(12), unique=True, index=True)   # 로그인 아이디 (영문 소문자·숫자 4~12자)
    name: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(100))                      # bcrypt 해시. 원문은 저장하지 않음 (SR-02)
    location_consent: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # 위치 동의: True / False / None(아직 안 정함)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Guardian(Base):
    """보호자: 사용자별로 따로 관리하고, 그 사용자만 보고 고칠 수 있음 (IDR-05)"""
    __tablename__ = "guardians"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(20))
    phone: Mapped[str] = mapped_column(String(13))   # 010-1234-5678 형식
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


# 공유 하나를 어떤 보호자들이 받는지 (공유 1개 ↔ 보호자 여러 명)
share_guardians = Table(
    "share_guardians", Base.metadata,
    Column("share_id", ForeignKey("shares.id", ondelete="CASCADE"), primary_key=True),
    Column("guardian_id", ForeignKey("guardians.id", ondelete="CASCADE"), primary_key=True),
)


class Share(Base):
    """위치공유 (IDR-07). 링크 토큰은 원문 대신 해시만 저장 → DB가 새도 링크를 만들 수 없음"""
    __tablename__ = "shares"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))                               # 'normal'(일반) / 'sos'(긴급)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # 링크 토큰의 SHA-256 해시
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # SOS 공유는 없음 (상황 종료 때까지)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(10), nullable=True)   # user / arrived / sos / expired / replaced / consent

    # 공유 중 최근 위치 1개만 보관 (IDR-03). 공유가 끝나면 지움 (5장 위치정보 정리 기준)
    last_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_accuracy: Mapped[int | None] = mapped_column(Integer, nullable=True)   # GPS 오차(m)
    last_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 보호자 화면에 보여줄 목적지·경로 (공유가 끝나면 지움)
    dest_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dest_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    dest_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    route: Mapped[list | None] = mapped_column(JSON, nullable=True)           # [[위도, 경도], ...]

    user: Mapped[User] = relationship()
    guardians: Mapped[list[Guardian]] = relationship(secondary=share_guardians)

    def is_active(self):
        return self.ended_at is None

    def close(self, reason, at=None):
        """공유 종료: 종료 시각·이유를 남기고, 위치·경로는 바로 지움"""
        if self.ended_at is not None:
            return
        self.ended_at = at or now_utc()
        self.end_reason = reason
        self.last_lat = self.last_lng = self.last_accuracy = self.last_at = None
        self.dest_name = self.dest_lat = self.dest_lng = None
        self.route = None

    def expire_if_due(self, now=None):
        """만료 시각이 지났으면 만료 처리. 모든 공유 관련 요청에서 먼저 부름 (SR-03 매 요청 검증)"""
        now = now or now_utc()
        if self.ended_at is None and self.expires_at is not None and as_utc(self.expires_at) <= now:
            self.close("expired", as_utc(self.expires_at))
            return True
        return False


class SosEvent(Base):
    """긴급 신고 기록 (IDR-06). 보존 기간은 설계 단계에서 확정 (규격서 5장)"""
    __tablename__ = "sos_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)           # SOS 때 쓴 위치 (없으면 위치 미확인)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    located_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # 그 위치를 확인한 시각
    location_stale: Mapped[bool] = mapped_column(Boolean, default=False)    # True = 현재가 아닌 마지막 위치
    share_id: Mapped[int | None] = mapped_column(ForeignKey("shares.id", ondelete="SET NULL"), nullable=True)
    share_status: Mapped[str] = mapped_column(String(12))                   # shared(공유함) / no_guardian(보호자 없음)
    report_ready: Mapped[bool] = mapped_column(Boolean, default=True)       # 112 신고 문안 생성 여부 (문안은 앱에서 만듦)

    share: Mapped[Share | None] = relationship()
