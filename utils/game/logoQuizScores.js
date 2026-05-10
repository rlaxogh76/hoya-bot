const pool = require('../db');

async function recordAnswer({ guildId, userId, username, logoId, logoName, category, difficulty, isCorrect, points }) {
	const [[row]] = await pool.execute(
		'SELECT * FROM logo_quiz_scores WHERE guild_id = ? AND user_id = ?',
		[guildId, userId],
	);

	const byCategory = row?.by_category ?? {};
	const byLogo = row?.by_logo ?? {};
	const collectedIds = row?.collected_ids ?? [];

	if (!byCategory[category]) byCategory[category] = { correct: 0, total: 0 };
	byCategory[category].total++;
	if (isCorrect) byCategory[category].correct++;

	if (!byLogo[logoName]) byLogo[logoName] = { correct: 0, total: 0, difficulty };
	byLogo[logoName].total++;
	if (isCorrect) byLogo[logoName].correct++;

	if (isCorrect && !collectedIds.includes(logoId)) collectedIds.push(logoId);

	await pool.execute(
		`INSERT INTO logo_quiz_scores (guild_id, user_id, username, total_score, correct_count, total_answered, by_category, by_logo, collected_ids)
		 VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE
		   username = VALUES(username),
		   total_score = total_score + VALUES(total_score),
		   correct_count = correct_count + VALUES(correct_count),
		   total_answered = total_answered + 1,
		   by_category = VALUES(by_category),
		   by_logo = VALUES(by_logo),
		   collected_ids = VALUES(collected_ids)`,
		[
			guildId, userId, username,
			isCorrect ? points : 0,
			isCorrect ? 1 : 0,
			JSON.stringify(byCategory),
			JSON.stringify(byLogo),
			JSON.stringify(collectedIds),
		],
	);
}

async function getServerRanking(guildId) {
	const [rows] = await pool.execute(
		'SELECT * FROM logo_quiz_scores WHERE guild_id = ? ORDER BY total_score DESC LIMIT 10',
		[guildId],
	);
	return rows.map(r => ({
		userId: r.user_id,
		username: r.username,
		totalScore: r.total_score,
		correctCount: r.correct_count,
		totalAnswered: r.total_answered,
		byCategory: r.by_category,
		byLogo: r.by_logo,
		collectedIds: r.collected_ids,
	}));
}

async function getUserStats(guildId, userId) {
	const [[row]] = await pool.execute(
		'SELECT * FROM logo_quiz_scores WHERE guild_id = ? AND user_id = ?',
		[guildId, userId],
	);
	if (!row) return null;
	return {
		userId: row.user_id,
		username: row.username,
		totalScore: row.total_score,
		correctCount: row.correct_count,
		totalAnswered: row.total_answered,
		byCategory: row.by_category,
		byLogo: row.by_logo,
		collectedIds: row.collected_ids,
	};
}

async function getGlobalLogoStats(guildId) {
	const [rows] = await pool.execute(
		'SELECT by_logo FROM logo_quiz_scores WHERE guild_id = ?',
		[guildId],
	);
	const logoStats = {};
	for (const row of rows) {
		for (const [logo, d] of Object.entries(row.by_logo ?? {})) {
			if (!logoStats[logo]) logoStats[logo] = { correct: 0, total: 0 };
			logoStats[logo].correct += d.correct;
			logoStats[logo].total += d.total;
		}
	}
	return logoStats;
}

module.exports = { recordAnswer, getServerRanking, getUserStats, getGlobalLogoStats };
