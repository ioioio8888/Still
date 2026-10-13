CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  mood TEXT NOT NULL,
  created BIGINT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
);
CREATE INDEX IF NOT EXISTS letters_public ON letters (created DESC, id DESC) WHERE hidden = 0;
CREATE INDEX IF NOT EXISTS letters_mood ON letters (mood, created DESC, id DESC) WHERE hidden = 0;
CREATE INDEX IF NOT EXISTS letters_owner ON letters (owner, created DESC, id DESC);
CREATE TABLE IF NOT EXISTS reactions (
  letter TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'heard'),
  PRIMARY KEY (letter, owner, kind)
);
CREATE TABLE IF NOT EXISTS reports (
  letter TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  PRIMARY KEY (letter, owner)
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  started BIGINT NOT NULL,
  count INTEGER NOT NULL
);
