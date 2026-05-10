const pool = require('./db');
const { interview } = require('../db.json');

async function initDb() {
	await pool.execute(`
		CREATE TABLE IF NOT EXISTS interview (
			id INT AUTO_INCREMENT PRIMARY KEY,
			author VARCHAR(100) DEFAULT '',
			author_url VARCHAR(500) DEFAULT '',
			tag VARCHAR(50) DEFAULT '',
			question TEXT NOT NULL,
			answer LONGTEXT,
			link_name VARCHAR(200) DEFAULT '',
			link_url VARCHAR(500) DEFAULT ''
		)
	`);

	await pool.execute(`
		CREATE TABLE IF NOT EXISTS lang_quiz_scores (
			guild_id VARCHAR(20) NOT NULL,
			user_id VARCHAR(20) NOT NULL,
			username VARCHAR(100) DEFAULT '',
			total_score INT DEFAULT 0,
			correct_count INT DEFAULT 0,
			total_answered INT DEFAULT 0,
			by_language JSON,
			by_difficulty JSON,
			PRIMARY KEY (guild_id, user_id)
		)
	`);

	await pool.execute(`
		CREATE TABLE IF NOT EXISTS logo_quiz_scores (
			guild_id VARCHAR(20) NOT NULL,
			user_id VARCHAR(20) NOT NULL,
			username VARCHAR(100) DEFAULT '',
			total_score INT DEFAULT 0,
			correct_count INT DEFAULT 0,
			total_answered INT DEFAULT 0,
			by_category JSON,
			by_logo JSON,
			collected_ids JSON,
			PRIMARY KEY (guild_id, user_id)
		)
	`);

	// db.json 데이터가 비어있을 때만 시드 삽입
	const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) AS cnt FROM interview');
	if (cnt === 0) {
		for (const item of interview) {
			await pool.execute(
				'INSERT INTO interview (author, author_url, tag, question, answer, link_name, link_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
				[item.author ?? '', item.authorUrl ?? '', item.tag ?? '', item.question, item.answer ?? '', item.linkName ?? '', item.linkUrl ?? ''],
			);
		}
	}
}

module.exports = initDb;
