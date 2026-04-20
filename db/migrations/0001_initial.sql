-- WorkBot initial schema (Postgres / Supabase)
-- Idempotent where possible. Run once on fresh DB.

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Utility trigger: touch updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Users (Telegram users)
-- ============================================================
CREATE TABLE users (
    id            BIGINT PRIMARY KEY,                 -- Telegram user ID
    username      TEXT,
    first_name    TEXT NOT NULL,
    last_name     TEXT,
    photo_url     TEXT,
    city          TEXT NOT NULL DEFAULT 'Moscow',
    timezone      TEXT NOT NULL DEFAULT 'Europe/Moscow',
    language_code TEXT NOT NULL DEFAULT 'ru',
    is_premium    BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- Group chats the bot is in
-- ============================================================
CREATE TABLE chats (
    id         BIGINT PRIMARY KEY,                    -- Telegram chat ID (negative for groups)
    title      TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,        -- main group for broadcasts / invites
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_members (
    chat_id   BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chat_id, user_id)
);

-- ============================================================
-- Schedules
--   cycle      : work_days on / rest_days off, starting from start_date
--   weekly     : fixed weekly pattern via weekly_mask (bit 0 = Mon ... bit 6 = Sun)
--   custom     : fully manual via schedule_overrides
--   unemployed : no work at all
-- ============================================================
CREATE TABLE schedules (
    user_id          BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    type             TEXT NOT NULL
                     CHECK (type IN ('cycle','weekly','custom','unemployed')),
    work_days        SMALLINT,                         -- for cycle
    rest_days        SMALLINT,                         -- for cycle
    weekly_mask      SMALLINT,                         -- for weekly: bits Mon..Sun
    start_date       DATE,                             -- for cycle
    respect_holidays BOOLEAN NOT NULL DEFAULT true,    -- honor Russian production calendar
    label            TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER schedules_touch BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Per-day overrides: force a specific date to work / rest regardless of base schedule
CREATE TABLE schedule_overrides (
    id      BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date    DATE   NOT NULL,
    is_work BOOLEAN NOT NULL,
    note    TEXT,
    UNIQUE (user_id, date)
);
CREATE INDEX idx_overrides_user_date ON schedule_overrides(user_id, date);

-- ============================================================
-- Vacations
-- ============================================================
CREATE TABLE vacations (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    label      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);
CREATE INDEX idx_vacations_user_range ON vacations(user_id, start_date, end_date);

-- ============================================================
-- Gym
--   days JSON shape: { "<weekday 0..6>": { "label": string?, "optional": boolean? } }
--   0=Mon .. 6=Sun
-- ============================================================
CREATE TABLE gym_plan (
    user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled       BOOLEAN NOT NULL DEFAULT false,
    days          JSONB   NOT NULL DEFAULT '{}'::jsonb,
    evening_poll  BOOLEAN NOT NULL DEFAULT true,
    poll_hour_msk SMALLINT NOT NULL DEFAULT 20
                  CHECK (poll_hour_msk BETWEEN 0 AND 23),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER gym_plan_touch BEFORE UPDATE ON gym_plan
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE gym_attendance (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date         DATE   NOT NULL,
    going        BOOLEAN,                              -- NULL = no response yet
    responded_at TIMESTAMPTZ,
    UNIQUE (user_id, date)
);
CREATE INDEX idx_attendance_date ON gym_attendance(date);

-- ============================================================
-- Production calendar (Russia, from xmlcalendar.ru)
--   day_type: 1=holiday (non-working) | 2=short_day | 3=working_weekend
-- ============================================================
CREATE TABLE holidays (
    date        DATE PRIMARY KEY,
    day_type    SMALLINT NOT NULL CHECK (day_type IN (1,2,3)),
    description TEXT,
    country     TEXT NOT NULL DEFAULT 'RU'
);

-- ============================================================
-- AI Invites (group activities generated via Groq/Gemini)
-- ============================================================
CREATE TABLE invites (
    id            BIGSERIAL PRIMARY KEY,
    chat_id       BIGINT NOT NULL,
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    kind          TEXT NOT NULL,                      -- 'pool','bar','coffee','restaurant','bowling','karaoke','cinema','custom'
    prompt        TEXT,
    place_name    TEXT,
    place_address TEXT,
    place_url     TEXT,
    place_phone   TEXT,
    price_range   TEXT,
    ai_raw        JSONB,
    planned_at    TIMESTAMPTZ,
    message_id    BIGINT,
    status        TEXT NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed','confirmed','rejected','cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invites_chat ON invites(chat_id, created_at DESC);

CREATE TABLE invite_responses (
    invite_id    BIGINT NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response     TEXT NOT NULL CHECK (response IN ('yes','no','maybe')),
    responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (invite_id, user_id)
);

-- ============================================================
-- KV store (misc app state: last calendar sync, etc.)
-- ============================================================
CREATE TABLE kv (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER kv_touch BEFORE UPDATE ON kv
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
