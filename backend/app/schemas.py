"""API 요청·응답 모양 + 입력값 검사 (SR-05)
파이썬 안에서는 snake_case(guardian_ids), 주고받는 JSON 은 camelCase(guardianIds) → 프론트 코드와 이름이 같음
검사 규칙은 프론트 화면(SignupScreen, GuardianScreen)의 규칙과 같게 맞춤
"""
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

ID_RE = re.compile(r"^[a-z0-9]{4,12}$")
PW_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,}$")
PHONE_RE = re.compile(r"^01[016789]-\d{3,4}-\d{4}$")


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── 인증 ──
def check_login_id(v: str) -> str:
    v = v.strip()
    if not ID_RE.match(v):
        raise ValueError("아이디는 영문 소문자·숫자 4~12자로 입력해 주세요.")
    return v


class SignupIn(Camel):
    id: str
    pw: str
    name: str

    @field_validator("id")
    @classmethod
    def _id(cls, v):
        return check_login_id(v)

    @field_validator("pw")
    @classmethod
    def _pw(cls, v):
        if not PW_RE.match(v):
            raise ValueError("8자 이상, 영문과 숫자를 함께 넣어 주세요.")
        if len(v.encode("utf-8")) > 72:  # bcrypt 는 72바이트까지만 처리함
            raise ValueError("비밀번호가 너무 길어요. 조금 짧게 정해 주세요.")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = v.strip()
        if not 1 <= len(v) <= 20:
            raise ValueError("이름은 1~20자로 입력해 주세요.")
        return v


class LoginIn(Camel):
    id: str = Field(max_length=50)
    pw: str = Field(max_length=200)


class UserOut(Camel):
    id: str              # 로그인 아이디
    name: str
    location_consent: bool | None


class LoginOut(Camel):
    token: str
    user: UserOut


class ConsentIn(Camel):
    location: bool       # 위치 수집 동의 여부


# ── 보호자 ──
class GuardianIn(Camel):
    name: str
    phone: str

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = v.strip()
        if not 1 <= len(v) <= 20:
            raise ValueError("보호자 이름은 1~20자로 입력해 주세요.")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("휴대폰 번호 형식이 아니에요. 예: 010-1234-5678")
        return v


class GuardianOut(Camel):
    id: int
    name: str
    phone: str


# ── 위치·공유 ──
class LatLng(Camel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class DestIn(LatLng):
    name: str = Field(max_length=100)


class ShareIn(Camel):
    type: Literal["normal", "sos"] = "normal"
    guardian_ids: list[int] = Field(max_length=20)
    pos: LatLng | None = None                      # 공유 시작 때 위치 (있으면)
    dest: DestIn | None = None                     # 보호자 화면에 보여줄 목적지
    route: list[tuple[float, float]] | None = Field(default=None, max_length=5000)  # 보호자 화면에 그릴 경로 [[위도, 경도], ...]


class LocationIn(LatLng):
    accuracy: int | None = Field(default=None, ge=0, le=100000)  # GPS 오차(m)


class LastPos(Camel):
    lat: float
    lng: float
    accuracy: int | None = None
    at: int              # 위치를 받은 시각 (밀리초)


class ShareOut(Camel):
    id: int
    token: str | None = None   # 링크 토큰. 만들 때 한 번만 알려줌 (서버에는 해시만 남음)
    type: str
    guardian_ids: list[int]
    started_at: int
    expires_at: int | None
    status: Literal["active", "ended", "expired"]
    reason: str | None = None
    last: LastPos | None = None


class PublicDest(Camel):
    name: str | None
    lat: float
    lng: float


class PublicShareOut(Camel):
    """보호자가 링크로 볼 수 있는 내용 (로그인 없음). 보호자 연락처 같은 건 넣지 않음 (SR-02)"""
    status: Literal["active"]
    type: str
    name: str            # 공유한 사용자 이름
    started_at: int
    expires_at: int | None
    last: LastPos | None
    dest: PublicDest | None
    route: list[tuple[float, float]] | None


# ── SOS ──
class SosIn(Camel):
    pos: LatLng | None = None        # 없으면 위치 미확인
    located_at: int | None = None    # 위치를 확인한 시각 (밀리초). 없으면 지금
    stale: bool = False              # True = 지금 위치가 아니라 마지막으로 받은 위치


class SosOut(Camel):
    id: int
    share_status: Literal["shared", "no_guardian"]
    share: ShareOut | None       # 새로 만든 긴급 공유(토큰 포함) 또는 일반 → 긴급으로 바뀐 공유(토큰 없음)
