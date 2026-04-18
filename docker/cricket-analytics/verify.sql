-- Verification queries — run after transform.sql completes.
-- Prints row counts, distribution checks, orphan-FK checks, and
-- sample analytical queries that should return non-empty results.

SET search_path = analytics;

\echo ''
\echo '=== Row counts ==='
SELECT 'players' AS table_name, COUNT(*) FROM players
UNION ALL SELECT 'teams', COUNT(*) FROM teams
UNION ALL SELECT 'venues', COUNT(*) FROM venues
UNION ALL SELECT 'matches', COUNT(*) FROM matches
UNION ALL SELECT 'innings', COUNT(*) FROM innings
UNION ALL SELECT 'batting_scorecards', COUNT(*) FROM batting_scorecards
UNION ALL SELECT 'bowling_scorecards', COUNT(*) FROM bowling_scorecards
UNION ALL SELECT 'deliveries', COUNT(*) FROM deliveries
ORDER BY table_name;

\echo ''
\echo '=== Match format distribution (expect IPL ~1100, T20I ~3300) ==='
SELECT match_format, COUNT(*) FROM matches GROUP BY 1 ORDER BY 1;

\echo ''
\echo '=== Season year range per format ==='
SELECT match_format, MIN(season_year) AS first_year, MAX(season_year) AS last_year, COUNT(*) AS matches
FROM matches GROUP BY 1 ORDER BY 1;

\echo ''
\echo '=== Tournament labels (no sponsor prefixes expected) ==='
SELECT tournament_label, COUNT(*)
FROM matches
GROUP BY 1
ORDER BY 2 DESC
LIMIT 15;

\echo ''
\echo '=== xRuns coverage (fraction of deliveries with ML predictions) ==='
SELECT
    COUNT(*)                                                AS total_deliveries,
    COUNT(xruns)                                            AS with_xruns,
    ROUND(COUNT(xruns)::numeric / COUNT(*) * 100, 1)        AS pct_with_xruns
FROM deliveries;

\echo ''
\echo '=== Orphan FK checks (all should be zero) ==='
SELECT 'deliveries.match_id -> matches' AS check_name,
       COUNT(*) AS orphans
FROM deliveries d LEFT JOIN matches m ON d.match_id = m.match_id
WHERE m.match_id IS NULL
UNION ALL
SELECT 'deliveries.batsman_id -> players',
       COUNT(*) FROM deliveries d LEFT JOIN players p ON d.batsman_id = p.player_id
       WHERE d.batsman_id IS NOT NULL AND p.player_id IS NULL
UNION ALL
SELECT 'deliveries.bowler_id -> players',
       COUNT(*) FROM deliveries d LEFT JOIN players p ON d.bowler_id = p.player_id
       WHERE d.bowler_id IS NOT NULL AND p.player_id IS NULL
UNION ALL
SELECT 'batting_scorecards.player_id -> players',
       COUNT(*) FROM batting_scorecards b LEFT JOIN players p ON b.player_id = p.player_id
       WHERE p.player_id IS NULL
UNION ALL
SELECT 'bowling_scorecards.player_id -> players',
       COUNT(*) FROM bowling_scorecards b LEFT JOIN players p ON b.player_id = p.player_id
       WHERE p.player_id IS NULL
UNION ALL
SELECT 'innings.match_id -> matches',
       COUNT(*) FROM innings i LEFT JOIN matches m ON i.match_id = m.match_id
       WHERE m.match_id IS NULL
UNION ALL
SELECT 'matches.venue_id -> venues',
       COUNT(*) FROM matches m LEFT JOIN venues v ON m.venue_id = v.venue_id
       WHERE m.venue_id IS NOT NULL AND v.venue_id IS NULL;

\echo ''
\echo '=== Phase distribution in deliveries (expect all three present) ==='
SELECT phase, COUNT(*) FROM deliveries GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '=== Bowler category distribution (spot-check) ==='
SELECT bowler_category, COUNT(*)
FROM players
WHERE bowler_category IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;

\echo ''
\echo '=== SAMPLE QUERY 1: Top 10 IPL run scorers (career, min 1000 runs) ==='
SELECT p.name, SUM(bs.runs) AS runs, SUM(bs.balls) AS balls,
       ROUND(SUM(bs.runs)::numeric * 100 / NULLIF(SUM(bs.balls),0), 2) AS sr,
       COUNT(*) AS innings
FROM batting_scorecards bs
JOIN players p ON p.player_id = bs.player_id
JOIN matches m ON m.match_id = bs.match_id
WHERE m.match_format = 'IPL'
GROUP BY p.name
HAVING SUM(bs.runs) >= 1000
ORDER BY runs DESC
LIMIT 10;

\echo ''
\echo '=== SAMPLE QUERY 2: Best death-over bowler xRuns delta (min 200 balls in death) ==='
SELECT p.name,
       COUNT(*) AS balls,
       ROUND(AVG(d.total_runs)::numeric, 3) AS avg_actual,
       ROUND(AVG(d.xruns)::numeric, 3)      AS avg_xruns,
       ROUND(AVG(d.total_runs - d.xruns)::numeric, 3) AS skill_delta
FROM deliveries d
JOIN players p ON p.player_id = d.bowler_id
JOIN matches m ON m.match_id = d.match_id
WHERE d.phase = 'death' AND d.xruns IS NOT NULL AND m.match_format = 'IPL'
GROUP BY p.name
HAVING COUNT(*) >= 200
ORDER BY skill_delta ASC
LIMIT 10;

\echo ''
\echo '=== SAMPLE QUERY 3: Matches per season ==='
SELECT match_format, season_year, COUNT(*) AS matches
FROM matches
WHERE season_year >= 2020
GROUP BY 1, 2
ORDER BY 1, 2;

\echo ''
\echo '=== SAMPLE QUERY 4: Strike rate by phase for top IPL batters ==='
SELECT p.name, d.phase,
       SUM(d.batsman_runs) AS runs,
       COUNT(*) FILTER (WHERE d.wides = 0 OR d.wides IS NULL) AS legal_balls_faced,
       ROUND(
         SUM(d.batsman_runs)::numeric * 100
         / NULLIF(COUNT(*) FILTER (WHERE d.wides = 0 OR d.wides IS NULL), 0),
         2
       ) AS sr
FROM deliveries d
JOIN players p ON p.player_id = d.batsman_id
JOIN matches m ON m.match_id = d.match_id
WHERE m.match_format = 'IPL'
  AND p.name IN ('V Kohli', 'JC Buttler', 'SV Samson', 'KL Rahul')
GROUP BY 1, 2
ORDER BY 1, 2;
