CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  mood TEXT NOT NULL,
  created BIGINT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS letters_public ON letters (created DESC, id DESC) WHERE hidden = 0;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS letters_mood ON letters (mood, created DESC, id DESC) WHERE hidden = 0;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS letters_owner ON letters (owner, created DESC, id DESC);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reactions (
  letter TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'heard'),
  PRIMARY KEY (letter, owner, kind)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reports (
  letter TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  PRIMARY KEY (letter, owner)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  started BIGINT NOT NULL,
  count INTEGER NOT NULL
);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_letter_length() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF char_length(NEW.body) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Letter must contain 1 to 200 characters' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- statement-breakpoint
DROP TRIGGER IF EXISTS letters_length_guard ON letters;
-- statement-breakpoint
CREATE TRIGGER letters_length_guard BEFORE INSERT OR UPDATE OF body ON letters
FOR EACH ROW EXECUTE FUNCTION enforce_letter_length();
