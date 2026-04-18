-- Cricket analytics schema (IPL + Men's T20I).
-- All IDs use source.object_id values where available so joins stay consistent
-- with the source convention (deliveries.batsman_object_id -> players.object_id).
-- Run inside the cricket_analytics database.

BEGIN;

DROP SCHEMA IF EXISTS analytics CASCADE;
CREATE SCHEMA analytics;
SET search_path = analytics;

-- =============================================================
-- Dimensions
-- =============================================================

CREATE TABLE players (
    player_id        integer PRIMARY KEY,
    name             text,
    long_name        text,
    date_of_birth    date,
    batting_hand     text,    -- 'right' | 'left' | NULL
    bowling_style    text,    -- raw code e.g. 'rfm', 'ob'
    bowler_category  text,    -- 'fast'|'medium'|'offspin'|'legspin'|'left_arm_spin'|'left_arm_fast'|'left_arm_medium'|NULL
    image_url        text
);

CREATE TABLE teams (
    team_id          integer PRIMARY KEY,
    name             text NOT NULL,
    short_name       text,    -- e.g. 'MI', 'CSK', 'IND'
    is_country       boolean
);

CREATE TABLE venues (
    venue_id         integer PRIMARY KEY,
    name             text NOT NULL,
    city             text,
    country          text
);

-- =============================================================
-- Facts
-- =============================================================

CREATE TABLE matches (
    match_id         varchar(20) PRIMARY KEY,
    match_format     text NOT NULL CHECK (match_format IN ('IPL','T20I')),
    season_year      integer,
    tournament_label text,        -- display-friendly: 'IPL 2024', 'ICC Men''s T20 World Cup', etc.
    match_title      text,        -- raw source title, e.g. 'Final', '1st Match'
    start_date       date,
    venue_id         integer REFERENCES venues(venue_id),
    team1_id         integer REFERENCES teams(team_id),
    team2_id         integer REFERENCES teams(team_id),
    toss_winner_id   integer REFERENCES teams(team_id),
    toss_choice      text CHECK (toss_choice IN ('bat','field')),
    winner_id        integer REFERENCES teams(team_id),
    result_text      text,
    is_floodlit      boolean,
    is_super_over    boolean
);

CREATE INDEX idx_matches_start_date ON matches(start_date);
CREATE INDEX idx_matches_format_year ON matches(match_format, season_year);
CREATE INDEX idx_matches_venue ON matches(venue_id);

CREATE TABLE innings (
    match_id         varchar(20) NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    innings_number   smallint NOT NULL,
    batting_team_id  integer REFERENCES teams(team_id),
    bowling_team_id  integer REFERENCES teams(team_id),
    total_runs       integer,
    wickets          integer,
    overs            numeric(4,1),
    run_rate         numeric(5,2),
    fours            integer,
    sixes            integer,
    extras           integer,
    target           integer,
    PRIMARY KEY (match_id, innings_number)
);

CREATE INDEX idx_innings_match ON innings(match_id);

CREATE TABLE batting_scorecards (
    match_id         varchar(20) NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    innings_number   smallint NOT NULL,
    player_id        integer NOT NULL REFERENCES players(player_id),
    team_id          integer REFERENCES teams(team_id),
    batting_position smallint,
    runs             integer,
    balls            integer,
    fours            integer,
    sixes            integer,
    dots             integer,
    strike_rate      numeric(6,2),
    is_not_out       boolean,
    dismissal_type   text,
    PRIMARY KEY (match_id, innings_number, player_id)
);

CREATE INDEX idx_batting_player ON batting_scorecards(player_id);
CREATE INDEX idx_batting_team ON batting_scorecards(team_id);

CREATE TABLE bowling_scorecards (
    match_id         varchar(20) NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    innings_number   smallint NOT NULL,
    player_id        integer NOT NULL REFERENCES players(player_id),
    team_id          integer REFERENCES teams(team_id),
    bowling_position smallint,
    legal_balls      integer,
    overs            text,       -- keeps '4.0' display format from source
    runs             integer,
    wickets          integer,
    economy          numeric(5,2),
    dots             integer,
    fours_conceded   integer,
    sixes_conceded   integer,
    wides            integer,
    noballs          integer,
    PRIMARY KEY (match_id, innings_number, player_id)
);

CREATE INDEX idx_bowling_player ON bowling_scorecards(player_id);
CREATE INDEX idx_bowling_team ON bowling_scorecards(team_id);

CREATE TABLE deliveries (
    delivery_id      bigint PRIMARY KEY,
    match_id         varchar(20) NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    innings_number   smallint NOT NULL,
    over_number      smallint,
    ball_number      smallint,
    phase            text,       -- 'powerplay' (overs 1-6) | 'middle' (7-15) | 'death' (16-20)
    batsman_id       integer REFERENCES players(player_id),
    non_striker_id   integer REFERENCES players(player_id),
    bowler_id        integer REFERENCES players(player_id),
    batsman_runs     smallint,
    total_runs       smallint,
    extras_runs      smallint,
    is_four          boolean,
    is_six           boolean,
    is_wicket        boolean,
    dismissal_type   text,
    wides            smallint,
    noballs          smallint,
    byes             smallint,
    legbyes          smallint,
    pitch_line       text,       -- 'OUTSIDE_OFFSTUMP'|'ON_THE_STUMPS'|'MIDDLE'|'OUTSIDE_LEG_STUMP'|'WIDE_OUTSIDE_OFFSTUMP'
    pitch_length     text,       -- 'GOOD_LENGTH'|'SHORT'|'FULL'|'FULL_TOSS'|'YORKER'|'BOUNCER'
    shot_type        text,
    shot_control     smallint,   -- 0-4
    wagon_zone       smallint,   -- 1-8
    xruns            numeric(5,3),
    prob_0           numeric(5,4),
    prob_1           numeric(5,4),
    prob_2           numeric(5,4),
    prob_3           numeric(5,4),
    prob_4           numeric(5,4),
    prob_6           numeric(5,4),
    prob_wicket      numeric(5,4)
);

CREATE INDEX idx_deliveries_match_order ON deliveries(match_id, innings_number, over_number, ball_number);
CREATE INDEX idx_deliveries_batsman ON deliveries(batsman_id);
CREATE INDEX idx_deliveries_bowler ON deliveries(bowler_id);
CREATE INDEX idx_deliveries_phase ON deliveries(phase);

COMMIT;
