const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../../data/langQuizScores.json');

function loadScores() {
	try {
		if (!fs.existsSync(DATA_FILE)) return {};
		return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
	}
	catch {
		return {};
	}
}

function saveScores(scores) {
	const dir = path.dirname(DATA_FILE);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(DATA_FILE, JSON.stringify(scores, null, 2), 'utf8');
}

function ensureUser(scores, guildId, userId) {
	if (!scores[guildId]) scores[guildId] = {};
	if (!scores[guildId][userId]) {
		scores[guildId][userId] = {
			username: '',
			totalScore: 0,
			correctCount: 0,
			totalAnswered: 0,
			byLanguage: {},
			byDifficulty: {},
		};
	}
	return scores[guildId][userId];
}

function recordAnswer({ guildId, userId, username, language, difficulty, isCorrect, points }) {
	const scores = loadScores();
	const user = ensureUser(scores, guildId, userId);

	user.username = username;
	user.totalAnswered++;

	if (isCorrect) {
		user.correctCount++;
		user.totalScore += points;
	}

	if (!user.byLanguage[language]) user.byLanguage[language] = { correct: 0, total: 0 };
	user.byLanguage[language].total++;
	if (isCorrect) user.byLanguage[language].correct++;

	if (!user.byDifficulty[difficulty]) user.byDifficulty[difficulty] = { correct: 0, total: 0 };
	user.byDifficulty[difficulty].total++;
	if (isCorrect) user.byDifficulty[difficulty].correct++;

	saveScores(scores);
}

function getServerRanking(guildId) {
	const scores = loadScores();
	if (!scores[guildId]) return [];
	return Object.entries(scores[guildId])
		.map(([userId, data]) => ({ userId, ...data }))
		.sort((a, b) => b.totalScore - a.totalScore)
		.slice(0, 10);
}

function getUserStats(guildId, userId) {
	const scores = loadScores();
	return scores[guildId]?.[userId] ?? null;
}

module.exports = { recordAnswer, getServerRanking, getUserStats };
