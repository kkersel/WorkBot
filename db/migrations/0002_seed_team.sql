-- Seed initial team from the legacy data.json (pre-webapp bot).
-- Safe to re-run: all inserts are ON CONFLICT-upserts.

-- Users (first_name NOT NULL — we put something so the join in status works.
-- Once each user /start-s the bot, upsert_user() will refresh with their real
-- Telegram profile.)
INSERT INTO users (id, first_name) VALUES
  (271321007, 'Александр'),
  (5059656897, 'Deos'),
  (528674097, 'sladkospaal'),
  (471902405, 'Никита')
ON CONFLICT (id) DO UPDATE SET first_name = COALESCE(users.first_name, EXCLUDED.first_name);

-- Schedules
-- Александр: 5/2 с 2026-04-20
INSERT INTO schedules (user_id, type, work_days, rest_days, start_date, respect_holidays, label)
VALUES (271321007, 'cycle', 5, 2, '2026-04-20', true, '5/2')
ON CONFLICT (user_id) DO UPDATE SET
  type='cycle', work_days=5, rest_days=2, weekly_mask=NULL,
  start_date='2026-04-20', respect_holidays=true, label='5/2';

-- Deos: 3/3 с 2026-03-31
INSERT INTO schedules (user_id, type, work_days, rest_days, start_date, respect_holidays, label)
VALUES (5059656897, 'cycle', 3, 3, '2026-03-31', true, '3/3')
ON CONFLICT (user_id) DO UPDATE SET
  type='cycle', work_days=3, rest_days=3, weekly_mask=NULL,
  start_date='2026-03-31', respect_holidays=true, label='3/3';

-- sladkospaal: 5/2 с 2026-04-20
INSERT INTO schedules (user_id, type, work_days, rest_days, start_date, respect_holidays, label)
VALUES (528674097, 'cycle', 5, 2, '2026-04-20', true, '5/2')
ON CONFLICT (user_id) DO UPDATE SET
  type='cycle', work_days=5, rest_days=2, weekly_mask=NULL,
  start_date='2026-04-20', respect_holidays=true, label='5/2';

-- Никита: unemployed (безработный)
INSERT INTO schedules (user_id, type, label)
VALUES (471902405, 'unemployed', 'безработный')
ON CONFLICT (user_id) DO UPDATE SET
  type='unemployed', work_days=NULL, rest_days=NULL, weekly_mask=NULL,
  start_date=NULL, label='безработный';

-- Gym: только у Deos = true, у остальных можно не создавать запись (по дефолту off)
INSERT INTO gym_plan (user_id, enabled, days, evening_poll, poll_hour_msk)
VALUES (5059656897, true,
        '{"1":{"label":"","optional":false},"3":{"label":"ноги","optional":true},"5":{"label":"","optional":false},"6":{"label":"","optional":false}}'::jsonb,
        true, 20)
ON CONFLICT (user_id) DO UPDATE SET enabled = true;
