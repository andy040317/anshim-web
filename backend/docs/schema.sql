-- 안심귀갓길 DB 테이블 정의 (backend/app/models.py 에서 자동 생성, 직접 고치지 마세요)

CREATE TABLE users (
	id SERIAL NOT NULL, 
	login_id VARCHAR(12) NOT NULL, 
	name VARCHAR(20) NOT NULL, 
	password_hash VARCHAR(100) NOT NULL, 
	location_consent BOOLEAN, 
	consent_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_users_login_id ON users (login_id);

CREATE TABLE guardians (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	name VARCHAR(20) NOT NULL, 
	phone VARCHAR(13) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_guardians_user_id ON guardians (user_id);

CREATE TABLE shares (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	kind VARCHAR(10) NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	ended_at TIMESTAMP WITH TIME ZONE, 
	end_reason VARCHAR(10), 
	last_lat FLOAT, 
	last_lng FLOAT, 
	last_accuracy INTEGER, 
	last_at TIMESTAMP WITH TIME ZONE, 
	dest_name VARCHAR(100), 
	dest_lat FLOAT, 
	dest_lng FLOAT, 
	route JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ix_shares_token_hash ON shares (token_hash);

CREATE INDEX ix_shares_user_id ON shares (user_id);

CREATE TABLE share_guardians (
	share_id INTEGER NOT NULL, 
	guardian_id INTEGER NOT NULL, 
	PRIMARY KEY (share_id, guardian_id), 
	FOREIGN KEY(share_id) REFERENCES shares (id) ON DELETE CASCADE, 
	FOREIGN KEY(guardian_id) REFERENCES guardians (id) ON DELETE CASCADE
);

CREATE TABLE sos_events (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	ended_at TIMESTAMP WITH TIME ZONE, 
	lat FLOAT, 
	lng FLOAT, 
	located_at TIMESTAMP WITH TIME ZONE, 
	location_stale BOOLEAN NOT NULL, 
	share_id INTEGER, 
	share_status VARCHAR(12) NOT NULL, 
	report_ready BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(share_id) REFERENCES shares (id) ON DELETE SET NULL
);

CREATE INDEX ix_sos_events_user_id ON sos_events (user_id);
