-- Transform: pull data from source (cricket on :5434) through postgres_fdw
-- and populate analytics.* with normalized IPL + Men's T20I data.
-- Idempotent: truncates analytics.* tables before inserting.

-- =============================================================
-- 0. Foreign data wrapper connection to source cricket DB
-- =============================================================

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

DROP SCHEMA IF EXISTS source CASCADE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname = 'source_cricket') THEN
        CREATE SERVER source_cricket
            FOREIGN DATA WRAPPER postgres_fdw
            OPTIONS (host 'host.docker.internal', port '5434', dbname 'cricket', fetch_size '50000');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_user_mappings
        WHERE srvname = 'source_cricket' AND usename = current_user
    ) THEN
        CREATE USER MAPPING FOR CURRENT_USER SERVER source_cricket
            OPTIONS (user 'cricket_user', password 'cricket_pass');
    END IF;
END $$;

CREATE SCHEMA source;

IMPORT FOREIGN SCHEMA public
    LIMIT TO (matches, players, teams, series, grounds, innings, deliveries, delivery_xruns, batting_derived, bowling_derived)
    FROM SERVER source_cricket INTO source;

-- =============================================================
-- 1. Target matches: IPL + Men's T20I with ball-by-ball data
-- =============================================================

DROP TABLE IF EXISTS analytics._target_matches;
CREATE TABLE analytics._target_matches AS
SELECT
    m.match_id,
    m.id                                                        AS src_match_pk,
    CASE
        WHEN s.name IN ('IPL','Indian Premier League','Pepsi Indian Premier League')
            THEN 'IPL'
        WHEN m.international_class_id = 3
            THEN 'T20I'
    END                                                         AS match_format,
    EXTRACT(YEAR FROM m.start_date)::int                        AS season_year,
    s.name                                                      AS source_series_name
FROM source.matches m
LEFT JOIN source.series s ON s.series_id = m.series_id
WHERE m.match_format = 'T20'
  AND m.stage = 'FINISHED'
  AND EXISTS (SELECT 1 FROM source.deliveries d WHERE d.match_id = m.match_id)
  AND (
      s.name IN ('IPL','Indian Premier League','Pepsi Indian Premier League')
      OR m.international_class_id = 3
  );

CREATE INDEX ON analytics._target_matches(match_id);
CREATE INDEX ON analytics._target_matches(src_match_pk);

-- =============================================================
-- 2. Dimensions (copy broad — small tables, ensures FK integrity)
-- =============================================================

TRUNCATE analytics.players, analytics.teams, analytics.venues RESTART IDENTITY CASCADE;

-- Players: flatten styles arrays and classify bowler type
INSERT INTO analytics.players (
    player_id, name, long_name, date_of_birth, batting_hand, bowling_style, bowler_category, image_url
)
SELECT
    p.object_id,
    p.name,
    p.long_name,
    p.date_of_birth,
    CASE
        WHEN p.batting_styles IS NULL OR cardinality(p.batting_styles) = 0 THEN NULL
        WHEN p.batting_styles[1] = 'rhb' THEN 'right'
        WHEN p.batting_styles[1] = 'lhb' THEN 'left'
        ELSE NULL
    END,
    CASE
        WHEN p.bowling_styles IS NULL OR cardinality(p.bowling_styles) = 0 THEN NULL
        ELSE p.bowling_styles[1]
    END,
    CASE
        WHEN p.bowling_styles IS NULL OR cardinality(p.bowling_styles) = 0 THEN NULL
        WHEN p.bowling_styles[1] IN ('rf','rfm')     THEN 'fast'
        WHEN p.bowling_styles[1] IN ('rm','rmf')     THEN 'medium'
        WHEN p.bowling_styles[1] = 'ob'              THEN 'offspin'
        WHEN p.bowling_styles[1] IN ('lb','lbg')     THEN 'legspin'
        WHEN p.bowling_styles[1] IN ('sla','lws')    THEN 'left_arm_spin'
        WHEN p.bowling_styles[1] IN ('lf','lfm')     THEN 'left_arm_fast'
        WHEN p.bowling_styles[1] IN ('lm','lmf')     THEN 'left_arm_medium'
        ELSE NULL
    END,
    p.image_url
FROM source.players p
ON CONFLICT (player_id) DO NOTHING;

-- Fill orphan player references: ~50 player_object_ids are referenced by
-- source deliveries/scorecards but missing from source.players. Insert
-- placeholders so downstream FKs hold. UNNEST keeps this to a single pass
-- over deliveries (the largest foreign table).
INSERT INTO analytics.players (player_id, name)
SELECT DISTINCT pid, 'Unknown Player ' || pid
FROM (
    SELECT UNNEST(ARRAY[d.batsman_object_id, d.bowler_object_id, d.non_striker_object_id]) AS pid
    FROM source.deliveries d
    JOIN analytics._target_matches tm ON tm.match_id = d.match_id
    UNION
    SELECT bd.player_object_id FROM source.batting_derived bd
      JOIN analytics._target_matches tm ON tm.match_id = bd.match_id
    UNION
    SELECT bd.player_object_id FROM source.bowling_derived bd
      JOIN analytics._target_matches tm ON tm.match_id = bd.match_id
) refs
WHERE pid IS NOT NULL
ON CONFLICT (player_id) DO NOTHING;

-- Teams: object_id as PK
INSERT INTO analytics.teams (team_id, name, short_name, is_country)
SELECT
    t.object_id,
    t.name,
    NULLIF(t.abbreviation, ''),
    COALESCE(t.is_country, false)
FROM source.teams t
ON CONFLICT (team_id) DO NOTHING;

-- Venues: object_id as PK (fall back to internal id if object_id is NULL in source)
INSERT INTO analytics.venues (venue_id, name, city, country)
SELECT DISTINCT ON (COALESCE(g.object_id, g.id))
    COALESCE(g.object_id, g.id),
    g.name,
    split_part(g.location, ',', 1),          -- city portion of "City, Country"
    NULLIF(trim(split_part(g.location, ',', 2)), '')
FROM source.grounds g
ON CONFLICT (venue_id) DO NOTHING;

-- =============================================================
-- 3. matches
-- =============================================================

TRUNCATE analytics.matches CASCADE;

-- Upstream data has ~60 orphan toss_winner_team_id / winner_team_id values
-- that don't exist in teams (data-quality artifact). LEFT JOIN guards
-- against the FK violation by nulling them out.
INSERT INTO analytics.matches (
    match_id, match_format, season_year, tournament_label, match_title,
    start_date, venue_id, team1_id, team2_id,
    toss_winner_id, toss_choice, winner_id, result_text,
    is_floodlit, is_super_over
)
SELECT
    tm.match_id,
    tm.match_format,
    tm.season_year,
    CASE
        WHEN tm.match_format = 'IPL' THEN 'IPL ' || tm.season_year
        ELSE COALESCE(tm.source_series_name, 'T20I bilateral')
    END,
    m.title,
    m.start_date,
    COALESCE(g.object_id, g.id),
    m.team1_object_id,
    m.team2_object_id,
    tw.team_id,
    CASE m.toss_winner_choice WHEN 1 THEN 'bat' WHEN 2 THEN 'field' ELSE NULL END,
    w.team_id,
    m.result,
    CASE
        WHEN m.floodlit IN ('night','daynight') THEN true
        WHEN m.floodlit = 'day' THEN false
        ELSE NULL
    END,
    COALESCE(m.is_super_over, false)
FROM analytics._target_matches tm
JOIN source.matches m ON m.match_id = tm.match_id
LEFT JOIN source.grounds g ON g.id = m.ground_id
LEFT JOIN analytics.teams tw ON tw.team_id = m.toss_winner_team_id
LEFT JOIN analytics.teams w  ON w.team_id  = m.winner_team_id;

-- =============================================================
-- 4. innings
-- =============================================================

INSERT INTO analytics.innings (
    match_id, innings_number, batting_team_id, bowling_team_id,
    total_runs, wickets, overs, run_rate, fours, sixes, extras, target
)
SELECT
    i.match_id,
    i.innings_number::smallint,
    i.team_object_id,
    -- bowling team = the match's other team
    CASE
        WHEN m.team1_id = i.team_object_id THEN m.team2_id
        WHEN m.team2_id = i.team_object_id THEN m.team1_id
        ELSE NULL
    END,
    i.total_runs,
    i.total_wickets,
    NULLIF(i.total_overs, '')::numeric(4,1),
    i.run_rate,
    i.fours,
    i.sixes,
    i.extras,
    i.target
FROM source.innings i
JOIN analytics.matches m ON m.match_id = i.match_id
WHERE i.innings_number IN (1, 2);

-- =============================================================
-- 5. batting_scorecards
-- =============================================================

INSERT INTO analytics.batting_scorecards (
    match_id, innings_number, player_id, team_id, batting_position,
    runs, balls, fours, sixes, dots, strike_rate, is_not_out, dismissal_type
)
SELECT DISTINCT ON (bd.match_id, bd.innings_number, bd.player_object_id)
    bd.match_id,
    bd.innings_number::smallint,
    bd.player_object_id,
    i.batting_team_id,
    bd.batting_position::smallint,
    bd.runs,
    bd.balls,
    bd.fours,
    bd.sixes,
    bd.dots,
    bd.strike_rate,
    bd.is_not_out,
    CASE bd.dismissal_type
        WHEN '1'  THEN 'caught'
        WHEN '2'  THEN 'bowled'
        WHEN '3'  THEN 'lbw'
        WHEN '4'  THEN 'run out'
        WHEN '5'  THEN 'stumped'
        WHEN '6'  THEN 'hit wicket'
        WHEN '7'  THEN 'handled the ball'
        WHEN '8'  THEN 'obstructing the field'
        WHEN '9'  THEN 'hit the ball twice'
        WHEN '10' THEN 'timed out'
        WHEN '11' THEN 'retired out'
        WHEN '12' THEN 'other'
        WHEN '13' THEN 'retired not out'
        ELSE NULL
    END
FROM source.batting_derived bd
JOIN analytics.matches m ON m.match_id = bd.match_id
LEFT JOIN analytics.innings i ON i.match_id = bd.match_id AND i.innings_number = bd.innings_number
WHERE bd.player_object_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM analytics.players p WHERE p.player_id = bd.player_object_id);

-- =============================================================
-- 6. bowling_scorecards
-- =============================================================

INSERT INTO analytics.bowling_scorecards (
    match_id, innings_number, player_id, team_id, bowling_position,
    legal_balls, overs, runs, wickets, economy, dots,
    fours_conceded, sixes_conceded, wides, noballs
)
SELECT DISTINCT ON (bd.match_id, bd.innings_number, bd.player_object_id)
    bd.match_id,
    bd.innings_number::smallint,
    bd.player_object_id,
    i.bowling_team_id,
    bd.bowling_position::smallint,
    bd.legal_balls,
    bd.overs,
    bd.runs,
    bd.wickets,
    bd.economy,
    bd.dots,
    bd.fours_conceded,
    bd.sixes_conceded,
    bd.wides,
    bd.noballs
FROM source.bowling_derived bd
JOIN analytics.matches m ON m.match_id = bd.match_id
LEFT JOIN analytics.innings i ON i.match_id = bd.match_id AND i.innings_number = bd.innings_number
WHERE bd.player_object_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM analytics.players p WHERE p.player_id = bd.player_object_id);

-- =============================================================
-- 7. deliveries (with xruns inlined; largest table, ~1M rows)
-- =============================================================

INSERT INTO analytics.deliveries (
    delivery_id, match_id, innings_number, over_number, ball_number, phase,
    batsman_id, non_striker_id, bowler_id,
    batsman_runs, total_runs, extras_runs,
    is_four, is_six, is_wicket, dismissal_type,
    wides, noballs, byes, legbyes,
    pitch_line, pitch_length, shot_type, shot_control, wagon_zone,
    xruns, prob_0, prob_1, prob_2, prob_3, prob_4, prob_6, prob_wicket
)
SELECT
    d.id,
    d.match_id,
    d.innings_number::smallint,
    d.over_number::smallint,
    d.ball_number::smallint,
    CASE
        WHEN d.over_number BETWEEN 1  AND 6  THEN 'powerplay'
        WHEN d.over_number BETWEEN 7  AND 15 THEN 'middle'
        WHEN d.over_number BETWEEN 16 AND 20 THEN 'death'
        ELSE NULL
    END,
    d.batsman_object_id,
    d.non_striker_object_id,
    d.bowler_object_id,
    d.batsman_runs::smallint,
    d.total_runs::smallint,
    (COALESCE(d.wides,0) + COALESCE(d.noballs,0) + COALESCE(d.byes,0) + COALESCE(d.legbyes,0))::smallint,
    d.is_four,
    d.is_six,
    d.is_wicket,
    CASE d.dismissal_type
        WHEN '1'  THEN 'caught'
        WHEN '2'  THEN 'bowled'
        WHEN '3'  THEN 'lbw'
        WHEN '4'  THEN 'run out'
        WHEN '5'  THEN 'stumped'
        WHEN '6'  THEN 'hit wicket'
        WHEN '7'  THEN 'handled the ball'
        WHEN '8'  THEN 'obstructing the field'
        WHEN '9'  THEN 'hit the ball twice'
        WHEN '10' THEN 'timed out'
        WHEN '11' THEN 'retired out'
        WHEN '12' THEN 'other'
        WHEN '13' THEN 'retired not out'
        ELSE NULL
    END,
    d.wides::smallint,
    d.noballs::smallint,
    d.byes::smallint,
    d.legbyes::smallint,
    d.pitch_line,
    d.pitch_length,
    d.shot_type,
    d.shot_control::smallint,
    d.wagon_zone::smallint,
    dx.xruns::numeric(5,3),
    dx.prob_0::numeric(5,4),
    dx.prob_1::numeric(5,4),
    dx.prob_2::numeric(5,4),
    dx.prob_3::numeric(5,4),
    dx.prob_4::numeric(5,4),
    dx.prob_6::numeric(5,4),
    dx.prob_wicket::numeric(5,4)
FROM source.deliveries d
JOIN analytics.matches m  ON m.match_id = d.match_id
LEFT JOIN source.delivery_xruns dx ON dx.delivery_id = d.id;

-- =============================================================
-- 8. Cleanup + statistics
-- =============================================================

DROP TABLE analytics._target_matches;
DROP SCHEMA source CASCADE;

VACUUM ANALYZE analytics.players;
VACUUM ANALYZE analytics.teams;
VACUUM ANALYZE analytics.venues;
VACUUM ANALYZE analytics.matches;
VACUUM ANALYZE analytics.innings;
VACUUM ANALYZE analytics.batting_scorecards;
VACUUM ANALYZE analytics.bowling_scorecards;
VACUUM ANALYZE analytics.deliveries;
