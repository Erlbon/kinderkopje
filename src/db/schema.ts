import type { Database } from "sql.js";

/**
 * The Pelotonic database (SQLite). One file holds everything the pages share:
 * team ranking snapshots, race results, the capture queue, team levels and the settings texts.
 * Bump SCHEMA_VERSION and add a step to MIGRATIONS when a table changes.
 */
export const SCHEMA_VERSION = 2;

const V1 = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- settings and texts edited on the pages (season YAML, race registry, table layout ...)
CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- UCI World Ranking, team ranking, one row per captured date
CREATE TABLE team_snapshot (
  id INTEGER PRIMARY KEY,
  season INTEGER NOT NULL,
  date TEXT NOT NULL UNIQUE,
  moment_id INTEGER,
  complete INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE team_rank (
  snapshot_id INTEGER NOT NULL REFERENCES team_snapshot(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL,        -- UCI team id (stays with the licence through renames)
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  nation TEXT NOT NULL,
  rank INTEGER NOT NULL,
  points REAL NOT NULL,
  PRIMARY KEY (snapshot_id, team_id)
);
CREATE INDEX team_rank_team ON team_rank(team_id);

-- WorldTeam / ProTeam per season
CREATE TABLE team_level (
  season INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('WT','PT')),
  PRIMARY KEY (season, team_id)
);

-- race results from the UCI race pages
CREATE TABLE race_result (
  uci_id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  class TEXT,
  class_text TEXT,
  dates TEXT,
  country TEXT,
  captured_at TEXT
);
CREATE TABLE classification (
  id INTEGER PRIMARY KEY,
  uci_id INTEGER NOT NULL REFERENCES race_result(uci_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  title TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  UNIQUE (uci_id, label, title)
);
CREATE TABLE result_row (
  classification_id INTEGER NOT NULL REFERENCES classification(id) ON DELETE CASCADE,
  rank INTEGER,
  rider TEXT NOT NULL,
  team TEXT NOT NULL,
  age INTEGER,
  nation TEXT NOT NULL,
  result TEXT NOT NULL,
  points REAL NOT NULL
);
CREATE INDEX result_row_class ON result_row(classification_id);

-- races still to capture (from the UCI hub pages)
CREATE TABLE queue_race (
  uci_id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  country TEXT NOT NULL,
  hub TEXT NOT NULL
);

-- handy views for the SQL box on the Data page
CREATE VIEW v_team_points AS
  SELECT s.season, s.date, r.team_id, r.code, r.name, r.nation, r.rank, r.points
  FROM team_rank r JOIN team_snapshot s ON s.id = r.snapshot_id;
CREATE VIEW v_results AS
  SELECT q.uci_id, q.year, q.name AS race, q.class, c.label, c.title, w.rank, w.rider, w.team, w.nation, w.result, w.points
  FROM result_row w
  JOIN classification c ON c.id = w.classification_id
  JOIN race_result q ON q.uci_id = c.uci_id;
`;

// 2: who captured a race result (helper moderators put their name on the file they send back)
const V2 = `
ALTER TABLE race_result ADD COLUMN contributor TEXT;
`;

/** Step n creates schema version n from n-1. Exported so tests can build an old database. */
export const MIGRATIONS: Record<number, string> = { 1: V1, 2: V2 };

export function schemaVersion(db: Database): number {
  const t = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'");
  if (!t.length) return 0;
  const v = db.exec("SELECT value FROM meta WHERE key='schema_version'");
  return v.length ? Number(v[0]!.values[0]![0]) : 0;
}

/** Bring a database to the current schema. A file from a newer version of the tool is refused. */
export function migrate(db: Database): void {
  const have = schemaVersion(db);
  if (have > SCHEMA_VERSION) {
    throw new Error(
      "This database was made by a newer version of Pelotonic (schema " + have + ", this one knows " + SCHEMA_VERSION + "). Update the tool first.",
    );
  }
  for (let v = have + 1; v <= SCHEMA_VERSION; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]!);
      db.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)", [String(v)]);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  db.exec("PRAGMA foreign_keys = ON");
}
