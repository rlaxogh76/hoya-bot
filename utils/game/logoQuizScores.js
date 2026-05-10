const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/logoQuizScores.json');

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
			byCategory: {},
			byLogo: {},
			collectedIds: [],
		};
	}
	return scores[guildId][userId];
}

function recordAnswer({ guildId, userId, username, logoId, logoName, category, difficulty, isCorrect, points }) {
	const scores = loadScores();
	const user = ensureUser(scores, guildId, userId);

	user.username = username;
	user.totalAnswered++;

	if (isCorrect) {
		user.correctCount++;
		user.totalScore += points;
		if (!user.collectedIds.includes(logoId)) {
			user.collectedIds.push(logoId);
		}
	}

	if (!user.byCategory[category]) user.byCategory[category] = { correct: 0, total: 0 };
	user.byCategory[category].total++;
	if (isCorrect) user.byCategory[category].correct++;

	if (!user.byLogo[logoName]) user.byLogo[logoName] = { correct: 0, total: 0, difficulty };
	user.byLogo[logoName].total++;
	if (isCorrect) user.byLogo[logoName].correct++;

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

function getGlobalLogoStats(guildId) {
	const scores = loadScores();
	if (!scores[guildId]) return {};
	const logoStats = {};
	for (const user of Object.values(scores[guildId])) {
		for (const [logo, d] of Object.entries(user.byLogo ?? {})) {
			if (!logoStats[logo]) logoStats[logo] = { correct: 0, total: 0 };
			logoStats[logo].correct += d.correct;
			logoStats[logo].total += d.total;
		}
	}
	return logoStats;
}

module.exports = { recordAnswer, getServerRanking, getUserStats, getGlobalLogoStats };
