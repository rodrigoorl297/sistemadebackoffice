-- SOU+BLU — Treinamentos (tutoriais, palestras, prova e penalidade por prazo)

CREATE TABLE IF NOT EXISTS trainings (
  id text PRIMARY KEY,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'tutorial',
  description text DEFAULT '',
  content_body text DEFAULT '',
  video_url text DEFAULT '',
  resource_url text DEFAULT '',
  created_by text,
  partner_root_id text,
  audience_roles jsonb NOT NULL DEFAULT '["*"]'::jsonb,
  deadline_at timestamptz,
  penalty_points integer NOT NULL DEFAULT 0,
  passing_score integer NOT NULL DEFAULT 70,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_attempts (
  id text PRIMARY KEY,
  training_id text NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  score integer DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  penalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trainings_partner ON trainings(partner_root_id);
CREATE INDEX IF NOT EXISTS idx_trainings_deadline ON trainings(deadline_at);
CREATE INDEX IF NOT EXISTS idx_training_attempts_user ON training_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_training_attempts_training ON training_attempts(training_id);

ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trainings_all ON trainings;
CREATE POLICY trainings_all ON trainings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS training_attempts_all ON training_attempts;
CREATE POLICY training_attempts_all ON training_attempts FOR ALL USING (true) WITH CHECK (true);
