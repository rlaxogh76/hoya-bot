const pool = require('../db');

async function recordAnswer({ guildId, userId, username, language, difficulty, isCorrect, points }) {
	const [[row]] = await pool.execute(
		'SELECT * FROM lang_quiz_scores WHERE guild_id = ? AND user_id = ?',
		[guildId, userId],
	);

	const byLanguage = row?.by_language ?? {};
	const byDifficulty = row?.by_difficulty ?? {};

	if (!byLanguage[language]) byLanguage[language] = { correct: 0, total: 0 };
	byLanguage[language].total++;
	if (isCorrect) byLanguage[language].correct++;

	if (!byDifficulty[difficulty]) byDifficulty[difficulty] = { correct: 0, total: 0 };
	byDifficulty[difficulty].total++;
	if (isCorrect) byDifficulty[difficulty].correct++;

	await pool.execute(
		`INSERT INTO lang_quiz_scores (guild_id, user_id, username, total_score, correct_count, total_answered, by_language, by_difficulty)
		 VALUES (?, ?, ?, ?, ?, 1, ?, ?)
		 ON DUPLICATE KEY UPDATE
		   username = VALUES(username),
		   total_score = total_score + VALUES(total_score),
		   correct_count = correct_count + VALUES(correct_count),
		   total_answered = total_answered + 1,
		   by_language = VALUES(by_language),
		   by_difficulty = VALUES(by_difficulty)`,
		[
			guildId, userId, username,
			isCorrect ? points : 0,
			isCorrect ? 1 : 0,
			JSON.stringify(byLanguage),
			JSON.stringify(byDifficulty),
		],
	);
}

async function getServerRanking(guildId) {
	const [rows] = await pool.execute(
		'SELECT * FROM lang_quiz_scores WHERE guild_id = ? ORDER BY total_score DESC LIMIT 10',
		[guildId],
	);
	return rows.map(r => ({
		userId: r.user_id,
		username: r.username,
		totalScore: r.total_score,
		correctCount: r.correct_count,
		totalAnswered: r.total_answered,
		byLanguage: r.by_language,
		byDifficulty: r.by_difficulty,
	}));
}

async function getUserStats(guildId, userId) {
	const [[row]] = await pool.execute(
		'SELECT * FROM lang_quiz_scores WHERE guild_id = ? AND user_id = ?',
		[guildId, userId],
	);
	if (!row) return null;
	return {
		userId: row.user_id,
		username: row.username,
		totalScore: row.total_score,
		correctCount: row.correct_count,
		totalAnswered: row.total_answered,
		byLanguage: row.by_language,
		byDifficulty: row.by_difficulty,
	};
}

module.exports = { recordAnswer, getServerRanking, getUserStats };
