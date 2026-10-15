/**
 * What is in the Pelotonic database, in plain language: every table and view, every column, how they link.
 * Shown on the Data page and kept honest by a test that compares it with the real schema.
 */

export interface ColumnDoc {
  name: string;
  meaning: string;
}

export interface TableDoc {
  name: string;
  kind: "table" | "view";
  summary: string;
  columns: ColumnDoc[];
  /** how it links to other tables, in a sentence */
  links?: string;
  /** a question worth asking of it, as SQL */
  example: { title: string; sql: string };
}

export const DICTIONARY: TableDoc[] = [
  {
    name: "team_snapshot",
    kind: "table",
    summary: "One row per captured UCI World Ranking (team ranking) date.",
    columns: [
      { name: "id", meaning: "Row number, used by team_rank." },
      { name: "season", meaning: "The season the ranking belongs to. UCI points start again at zero on 1 January." },
      { name: "date", meaning: "The ranking date shown on DataRide, as yyyy-mm-dd. Unique." },
      { name: "moment_id", meaning: "UCI's own number for this ranking snapshot." },
      { name: "complete", meaning: "1 if every team of the ranking was captured, 0 if only some pages were (the usual case: top 40)." },
    ],
    links: "team_rank.snapshot_id = team_snapshot.id",
    example: { title: "Which ranking dates have been captured?", sql: "SELECT season, date, complete, (SELECT COUNT(*) FROM team_rank r WHERE r.snapshot_id = s.id) AS teams FROM team_snapshot s ORDER BY date" },
  },
  {
    name: "team_rank",
    kind: "table",
    summary: "The teams of each captured ranking: position and points on that date.",
    columns: [
      { name: "snapshot_id", meaning: "Which ranking date: team_snapshot.id." },
      { name: "team_id", meaning: "UCI's team number. It stays with the team's licence when the name or code changes (UAE: UAD in 2025, UEX in 2026), so use it to follow a team over the years." },
      { name: "code", meaning: "The team's UCI code in that season, for example UAD." },
      { name: "name", meaning: "The team's name in that season." },
      { name: "nation", meaning: "The team's nation (UCI's three-letter code)." },
      { name: "rank", meaning: "Position in the ranking on that date." },
      { name: "points", meaning: "UCI World Ranking points, season to date." },
    ],
    links: "snapshot_id -> team_snapshot.id; team_id also appears in team_level",
    example: { title: "The top 10 of the newest captured ranking", sql: "SELECT rank, code, name, points FROM v_team_points WHERE date = (SELECT MAX(date) FROM team_snapshot) ORDER BY rank LIMIT 10" },
  },
  {
    name: "team_level",
    kind: "table",
    summary: "Which teams were WorldTeams or ProTeams in a season (from Wikipedia). Teams that are not listed are lower-level, mostly Continental.",
    columns: [
      { name: "season", meaning: "The season." },
      { name: "team_id", meaning: "UCI's team number, as in team_rank." },
      { name: "level", meaning: "WT = WorldTeam, PT = ProTeam." },
    ],
    links: "team_id = team_rank.team_id",
    example: { title: "WorldTeams and ProTeams per season", sql: "SELECT season, level, COUNT(*) AS teams FROM team_level GROUP BY season, level ORDER BY season DESC, level" },
  },
  {
    name: "race_result",
    kind: "table",
    summary: "One row per captured race edition (a race in one year). Each edition has its own UCI number.",
    columns: [
      { name: "uci_id", meaning: "UCI's number for this edition. The year in a uci.org address is ignored; this number decides the page." },
      { name: "year", meaning: "The year of the edition." },
      { name: "name", meaning: "The race name as UCI writes it." },
      { name: "class", meaning: "The UCI class, for example 1.UWT, 2.Pro, WC." },
      { name: "class_text", meaning: "The full class text from the page, for example '1.Pro - 1 day - UCI ProSeries'." },
      { name: "dates", meaning: "The dates as UCI writes them, for example '11 Oct 2026'." },
      { name: "country", meaning: "The country, when the capture knew it (the saved-page route does not)." },
      { name: "captured_at", meaning: "When it was captured (date and time)." },
      { name: "contributor", meaning: "Who captured it, when it came from a helper moderator." },
    ],
    links: "classification.uci_id = race_result.uci_id",
    example: { title: "Races captured so far, and by whom", sql: "SELECT year, name, class, dates, contributor FROM race_result ORDER BY year, name" },
  },
  {
    name: "classification",
    kind: "table",
    summary: "A result list of a race: the Final Classification, or a stage, and so on.",
    columns: [
      { name: "id", meaning: "Row number, used by result_row." },
      { name: "uci_id", meaning: "Which race edition: race_result.uci_id." },
      { name: "label", meaning: "The section that was open on the page, for example 'Final Classification' or a stage." },
      { name: "title", meaning: "The table's title, for example 'General Classification'." },
      { name: "total_rows", meaning: "How many rows the table had. Only the rows that score points are kept in result_row." },
    ],
    links: "uci_id -> race_result.uci_id; result_row.classification_id = classification.id",
    example: { title: "How many rows scored points, out of how many", sql: "SELECT r.name, r.year, c.label, c.total_rows, (SELECT COUNT(*) FROM result_row w WHERE w.classification_id = c.id) AS scoring_rows FROM classification c JOIN race_result r ON r.uci_id = c.uci_id ORDER BY r.year, r.name" },
  },
  {
    name: "result_row",
    kind: "table",
    summary: "One row per rider who scored UCI points in a result list.",
    columns: [
      { name: "classification_id", meaning: "Which result list: classification.id." },
      { name: "rank", meaning: "The place in that list. Empty when the page showed none." },
      { name: "rider", meaning: "First name and SURNAME as UCI writes them." },
      { name: "team", meaning: "The team name as written on the race page. This is a name, not a team number." },
      { name: "age", meaning: "The rider's age as shown." },
      { name: "nation", meaning: "The rider's nation (three-letter code)." },
      { name: "result", meaning: "The time or gap as shown, for example 4:31:46 or +02." },
      { name: "points", meaning: "UCI points this result gave." },
    ],
    links: "classification_id -> classification.id. The view v_results joins all three tables.",
    example: { title: "The riders who scored most in the captured races", sql: "SELECT rider, team, SUM(points) AS points, COUNT(*) AS results FROM v_results GROUP BY rider, team ORDER BY points DESC LIMIT 20" },
  },
  {
    name: "queue_race",
    kind: "table",
    summary: "The races still to capture, taken from the UCI hub pages you added.",
    columns: [
      { name: "uci_id", meaning: "UCI's number for this edition." },
      { name: "year", meaning: "The year." },
      { name: "name", meaning: "The race name." },
      { name: "start", meaning: "First day, yyyy-mm-dd." },
      { name: "end", meaning: "Last day, yyyy-mm-dd (the same for a one-day race)." },
      { name: "country", meaning: "The country (UCI's three-letter code)." },
      { name: "hub", meaning: "The hub page it came from, for example '2027 UCI WorldTour'." },
    ],
    links: "uci_id = race_result.uci_id once the race has been captured",
    example: { title: "Races in the queue that are not captured yet", sql: "SELECT q.year, q.name, q.start, q.hub FROM queue_race q WHERE q.uci_id NOT IN (SELECT uci_id FROM race_result) ORDER BY q.start" },
  },
  {
    name: "kv",
    kind: "table",
    summary: "Texts and settings you edit on the pages, stored with the data.",
    columns: [
      { name: "key", meaning: "The name: season (YAML), registry (YAML), layout (JSON), sharenote and a few more." },
      { name: "value", meaning: "The text." },
    ],
    example: { title: "What is saved", sql: "SELECT key, LENGTH(value) AS characters FROM kv ORDER BY key" },
  },
  {
    name: "meta",
    kind: "table",
    summary: "Facts about the database file itself.",
    columns: [
      { name: "key", meaning: "The name; for now schema_version." },
      { name: "value", meaning: "The value. A file whose schema version is newer than the tool's is refused." },
    ],
    example: { title: "The schema version", sql: "SELECT key, value FROM meta" },
  },
  {
    name: "v_team_points",
    kind: "view",
    summary: "team_rank with the season and date of its ranking: the easy way to ask about team points.",
    columns: [
      { name: "season", meaning: "The season." },
      { name: "date", meaning: "The ranking date." },
      { name: "team_id", meaning: "UCI's team number." },
      { name: "code", meaning: "The team's code that season." },
      { name: "name", meaning: "The team's name that season." },
      { name: "nation", meaning: "The team's nation." },
      { name: "rank", meaning: "Position on that date." },
      { name: "points", meaning: "UCI World Ranking points, season to date." },
    ],
    links: "Group by team_id to follow one team through renames.",
    example: { title: "One team over the years (UAE has UCI team number 595)", sql: "SELECT season, date, code, name, rank, points FROM v_team_points WHERE team_id = 595 ORDER BY date" },
  },
  {
    name: "v_results",
    kind: "view",
    summary: "Every point-scoring result with its race, in one table: the easy way to ask about riders and results.",
    columns: [
      { name: "uci_id", meaning: "UCI's number for the race edition." },
      { name: "year", meaning: "The year." },
      { name: "race", meaning: "The race name." },
      { name: "class", meaning: "The UCI class." },
      { name: "label", meaning: "The section of the page (for example Final Classification)." },
      { name: "title", meaning: "The result list's title." },
      { name: "rank", meaning: "The place." },
      { name: "rider", meaning: "The rider." },
      { name: "team", meaning: "The team name on the race page." },
      { name: "nation", meaning: "The rider's nation." },
      { name: "result", meaning: "Time or gap." },
      { name: "points", meaning: "UCI points." },
    ],
    example: { title: "Points per team from the race results", sql: "SELECT team, SUM(points) AS points, COUNT(DISTINCT uci_id) AS races FROM v_results GROUP BY team ORDER BY points DESC LIMIT 20" },
  },
];

/** The overview as Markdown, to paste into a post or a document. */
export function dictionaryMarkdown(docs: TableDoc[] = DICTIONARY): string {
  const nl = String.fromCharCode(10);
  const out: string[] = ["# Pelotonic data: tables and fields", ""];
  for (const t of docs) {
    out.push("## " + t.name + (t.kind === "view" ? " (view)" : ""), "", t.summary, "");
    out.push("|Field|Meaning|", "|:-|:-|");
    for (const c of t.columns) out.push("|`" + c.name + "`|" + c.meaning.replace(/\|/g, "/") + "|");
    if (t.links) out.push("", "Links: " + t.links);
    out.push("", "Example, " + t.example.title.toLowerCase() + ":", "", "```sql", t.example.sql, "```", "");
  }
  return out.join(nl);
}
