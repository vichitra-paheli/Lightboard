"""
Curated schema reference for Claude's system prompt.
Kept concise to maximize prompt cache efficiency.
"""

SCHEMA_CONTEXT = """
## PostgreSQL Database Schema (cricket analytics)

### Performance Tables (use these for batting/bowling stats)

**batting_derived** — Per-match batting scorecard derived from ball-by-ball data (338K rows, 18K matches)
- match_id, innings_number, player_object_id -> players.object_id
- batting_position (int, order of appearance), runs, balls, fours, sixes, dots
- strike_rate (numeric), is_not_out (bool), dismissal_type (varchar)

**bowling_derived** — Per-match bowling scorecard (236K rows, 18K matches)
- match_id, innings_number, player_object_id -> players.object_id
- bowling_position (int), legal_balls, overs (varchar e.g. '4.0')
- runs, wickets, economy (numeric), dots
- fours_conceded, sixes_conceded, wides, noballs

**delivery_xruns** — ML model expected runs per delivery (376K rows)
- delivery_id, match_id, batsman_object_id, bowler_object_id, innings_number
- actual_runs (int), xruns (float) — expected runs from ML model
- prob_0, prob_1, prob_2, prob_3, prob_4, prob_6, prob_wicket (float) — outcome probabilities
- Use xruns for player valuation: batter skill = actual - xruns (positive = above average)

### Core Tables

**matches** — One row per match
- match_id (varchar PK), match_format ('IPL'|'T20I'), start_date (date), season (varchar, e.g. '2024')
- team1_name, team2_name (varchar), team1_id, team2_id (int)
- ground_name, ground_city (varchar)
- winner_team_id (int), result (text), status_text (varchar)
- toss_winner_team_id, toss_winner_choice (1=bat, 2=field)
- stage (varchar: 'FINAL', 'QUALIFIER 1', 'ELIMINATOR', etc.), is_super_over (bool)
- floodlit ('day'|'night'|'daynight'), series (varchar, e.g. 'Indian Premier League 2025')

**players** — One row per player
- object_id (int PK), name (varchar), long_name (varchar)
- batting_styles (text[]), bowling_styles (text[])
- image_url (varchar), date_of_birth (date)

**deliveries** — Ball-by-ball raw data (~21M rows, 39K matches)
- match_id, innings_number (1|2), over_number (1-20), ball_number
- batsman_object_id, bowler_object_id, non_striker_object_id -> players.object_id
- batsman_runs (int), total_runs (int), is_four (bool), is_six (bool)
- is_wicket (bool), dismissal_type (varchar)
- wides (int), noballs (int), byes (int), legbyes (int)
- pitch_line ('OUTSIDE_OFFSTUMP'|'ON_THE_STUMPS'|'MIDDLE'|'OUTSIDE_LEG_STUMP'|'WIDE_OUTSIDE_OFFSTUMP')
- pitch_length ('GOOD_LENGTH'|'SHORT'|'FULL'|'FULL_TOSS'|'YORKER'|'BOUNCER')
- shot_type (varchar), shot_control (int 0-4), wagon_zone (int 1-8)

**innings** — Innings totals
- match_id, innings_number, team_name, team_object_id
- total_runs, total_wickets, total_overs (text), run_rate (numeric)
- fours, sixes, extras, target (int)

**grounds** — Venues
- object_id (int), name (varchar), long_name (varchar), location (text)

### ML Feature Table

**training_data** — 178-column denormalized table (~392K rows, IPL+T20I since 2014)
One row per delivery with pre-computed features. Use `describe_table` tool to see all columns.
Key columns: delivery_id, match_id, match_date, innings_number, over_number, outcome,
batsman_object_id, bowler_object_id, match_format, phase, balls_remaining,
bat_career_sr, bat_ipl_sr, bowl_career_econ, matchup_sr, venue_fmt_run_rate.
Has JSONB columns: bat_career_by_phase, bat_career_by_bowler_type, bowl_career_by_phase, bowl_career_by_bat_hand.

### Key Join Patterns

- Player lookup: `players.object_id = batting_derived.player_object_id`
- Player from deliveries: `players.object_id = deliveries.batsman_object_id`
- Match-batting: `batting_derived.match_id = matches.match_id`
- xRuns: `delivery_xruns.delivery_id = deliveries.id` or join on match_id + batsman_object_id

### Useful Enumerations

- matches.match_format: 'T20', 'ODI', 'TEST' (use 'T20' for both IPL and T20I)
- To filter IPL specifically: `matches.series ILIKE '%Indian Premier League%'`
- training_data.match_format: 'IPL', 'T20I' (different from matches table!)
- phase (training_data): 'powerplay' (overs 1-6), 'middle' (7-15), 'death' (16-20)
- outcome (training_data): '0', '1', '2', '3', '4', '6', 'wicket', 'wide', 'noball'
- bowler_type: 'fast', 'medium', 'offspin', 'legspin', 'left_arm_spin', 'left_arm_fast', 'left_arm_medium'
- dismissal_type: 'caught', 'bowled', 'lbw', 'run out', 'stumped', 'hit wicket'

### Important: IPL filtering

The `matches.series` field is mostly NULL. To filter IPL matches reliably:
- Use `training_data.match_format = 'IPL'` (most reliable, covers all IPL matches in dataset)
- For batting_derived/bowling_derived: join through training_data match_ids:
  `WHERE bd.match_id IN (SELECT DISTINCT match_id FROM training_data WHERE match_format = 'IPL')`

### Example Queries

-- Best IPL strike rates (min 1000 runs) using batting_derived
SELECT p.name, p.image_url, SUM(bd.runs) as runs, SUM(bd.balls) as balls,
    ROUND(SUM(bd.runs) * 100.0 / NULLIF(SUM(bd.balls), 0), 2) AS strike_rate,
    SUM(bd.fours) as fours, SUM(bd.sixes) as sixes
FROM batting_derived bd
JOIN players p ON p.object_id = bd.player_object_id
WHERE bd.match_id IN (SELECT DISTINCT match_id FROM training_data WHERE match_format = 'IPL')
GROUP BY bd.player_object_id, p.name, p.image_url
HAVING SUM(bd.runs) >= 1000
ORDER BY strike_rate DESC;

-- Bowler xRuns analysis (who bowls better than expected?)
SELECT p.name,
    COUNT(*) as balls,
    ROUND(AVG(dx.actual_runs), 3) as avg_actual,
    ROUND(AVG(dx.xruns), 3) as avg_xruns,
    ROUND(AVG(dx.actual_runs - dx.xruns), 3) as skill_delta
FROM delivery_xruns dx
JOIN players p ON p.object_id = dx.bowler_object_id
GROUP BY dx.bowler_object_id, p.name
HAVING COUNT(*) >= 500
ORDER BY skill_delta ASC;
""".strip()
