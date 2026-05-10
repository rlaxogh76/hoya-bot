const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} = require('discord.js');

const { QUESTIONS } = require('../../../utils/game/langQuizData');
const { recordAnswer, getServerRanking, getUserStats } = require('../../../utils/game/langQuizScores');

const sessions = new Map(); // key: `${guildId}_${userId}`

// ─── 상수 ───────────────────────────────────────────────────────────────────

const DIFFICULTY_COLOR = {
	easy: 0x00C853,
	normal: 0x2196F3,
	hard: 0xFF9800,
	expert: 0xF44336,
	bonus: 0x9C27B0,
	random: 0x5865F2,
};
const DIFFICULTY_LABEL = {
	easy: '⭐ 이지',
	normal: '⭐⭐ 노말',
	hard: '⭐⭐⭐ 하드',
	expert: '⭐⭐⭐⭐ 익스퍼트',
	bonus: '🎲 보너스',
	random: '🎲 랜덤',
};
const BASE_PTS = { easy: 10, normal: 20, hard: 40, expert: 70, bonus: 150 };
const QUESTION_TIME = { easy: 20, normal: 20, hard: 30, expert: 30, bonus: 40, random: 20 };
const HINT_PCT = { hard: 20, expert: 20, bonus: 30 };
const RESULT_DELAY_MS = 1800;
const CHOICE_EMOJI = ['①', '②', '③', '④'];

// 정답 입력 허용 별칭 (소문자)
const ALIASES = {
	'c++': ['cpp', 'cplusplus', 'c plus plus'],
	'assembly': ['asm', 'nasm', 'x86', 'x86 assembly'],
	'javascript': ['js', 'node', 'nodejs'],
	'typescript': ['ts'],
	'brainfuck': ['bf', 'brain fuck'],
	'lolcode': ['lol', 'lol code'],
	'ook!': ['ook'],
};

// ─── 순수 헬퍼 ──────────────────────────────────────────────────────────────

function shuffle(arr) {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function randomId() {
	return Math.random().toString(36).slice(2, 8);
}

function isTextMode(difficulty) {
	return difficulty === 'hard' || difficulty === 'expert' || difficulty === 'bonus';
}

function getQuestionTime(difficulty) {
	return QUESTION_TIME[difficulty] ?? 20;
}

function getHintPct(difficulty) {
	return HINT_PCT[difficulty] ?? 20;
}

function checkTextAnswer(input, expected) {
	const norm = (s) => s.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
	const ni = norm(input);
	const ne = norm(expected);
	if (ni === ne) return true;
	return (ALIASES[ne] ?? []).some((alias) => ni === norm(alias));
}

function getTier(score) {
	if (score >= 10000) return '<:diamond_tier:1502949178945572924> Esolang God';
	if (score >= 5000) return '<:opal_tier:1502949183513170084> Polyglot Master';
	if (score >= 3500) return '<:ruby_tier:1502949186801500261> Lang Expert';
	if (score >= 2000) return '<:platinum_tier:1502949185413185586> Lang Hunter';
	if (score >= 1000) return '<:emerald_tier:1502949180560113694> Code Learner';
	if (score >= 500) return '<:gold_tier:1502949182162599946> Code Reader';
	if (score >= 100) return '<:silver_tier:1502949188227436585> Syntax Learner';
	return '<:bronze_tier:1502949177209127015> Syntax Newbie';
}

function getComboBonus(combo) {
	if (combo >= 7) return 2.0;
	if (combo >= 5) return 1.5;
	if (combo >= 3) return 1.2;
	return 1.0;
}

function buildChoices(question) {
	return shuffle([question.language, ...question.distractors]);
}

function delay(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ─── Discord 빌더 ────────────────────────────────────────────────────────────

const TYPE_LABEL = {
	snippet: '🔍 이 코드는 어떤 언어일까요?',
	error: '🚨 이 에러는 어떤 언어에서 발생했을까요?',
	comment: '💬 이 주석 스타일은 어떤 언어일까요?',
};

function buildBaseEmbed(session, question) {
	const { currentIdx, count, score, combo, difficulty } = session;
	const codeBlock = question.langTag
		? `\`\`\`${question.langTag}\n${question.code}\n\`\`\``
		: `\`\`\`\n${question.code}\n\`\`\``;
	const comboText = combo >= 3 ? `  •  🔥${combo}콤보` : '';
	const qDiff = difficulty === 'random' ? question.difficulty : difficulty;

	return new EmbedBuilder()
		.setColor(DIFFICULTY_COLOR[difficulty] ?? 0x5865F2)
		.setTitle(`🔍 Language Guesser  •  문제 ${currentIdx + 1} / ${count}`)
		.setDescription(`${TYPE_LABEL[question.type] ?? TYPE_LABEL.snippet}\n\n${codeBlock}`)
		.addFields(
			{ name: '⭐ 난이도', value: DIFFICULTY_LABEL[qDiff] ?? qDiff, inline: true },
			{ name: '⏱️ 제한 시간', value: `${getQuestionTime(difficulty)}초`, inline: true },
			{ name: '📊 현재 점수', value: `${score}pt${comboText}`, inline: true },
		);
}

function buildButtonQuestionEmbed(session, question) {
	return buildBaseEmbed(session, question)
		.setFooter({ text: '보기 중 정답을 선택하세요!' });
}

function buildTextQuestionEmbed(session, question, hint = null) {
	const embed = buildBaseEmbed(session, question);
	if (hint) {
		embed.addFields({ name: '💡 힌트', value: hint });
	}
	const hintPct = getHintPct(session.difficulty);
	embed.setFooter({
		text: hint
			? `힌트 사용됨 (${hintPct}% 차감) • 채팅으로 언어 이름을 입력하세요!`
			: `채팅으로 언어 이름을 입력하세요!  (힌트 버튼 또는 /언어퀴즈 힌트)`,
	});
	return embed;
}

function buildAnswerButtons(choices, sessionId) {
	const buttons = choices.map((lang, idx) =>
		new ButtonBuilder()
			.setCustomId(`lq_${sessionId}_${idx}`)
			.setLabel(`${CHOICE_EMOJI[idx]} ${lang}`)
			.setStyle(ButtonStyle.Primary),
	);
	return [
		new ActionRowBuilder().addComponents(buttons[0], buttons[1]),
		new ActionRowBuilder().addComponents(buttons[2], buttons[3]),
	];
}

function buildHintRow(sessionId, difficulty, disabled = false) {
	const pct = getHintPct(difficulty);
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`lq_${sessionId}_hint`)
			.setLabel(disabled ? '💡 힌트 사용됨' : `💡 힌트 보기 (-${pct}%)`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled),
	);
}

function buildResultEmbed(isCorrect, question, earned, timeBonus, comboBonus, session, hintUsed) {
	const color = isCorrect ? 0x00C853 : 0xFF5722;
	const title = isCorrect
		? `✅ 정답! — ${question.language}`
		: `❌ 오답! — 정답은 **${question.language}**`;

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(title)
		.addFields({ name: '📖 언어 소개', value: question.description });

	if (isCorrect) {
		const hintNote = hintUsed ? `, 힌트 -${getHintPct(session.difficulty)}%` : '';
		embed.addFields({
			name: '💰 획득 점수',
			value: `+${earned}pt  (시간 ×${timeBonus.toFixed(1)}, 콤보 ×${comboBonus.toFixed(1)}${hintNote})`,
		});
	}

	const comboText = session.combo >= 3 ? `  •  🔥${session.combo}콤보` : '';
	embed.addFields({ name: '📊 현재 점수', value: `${session.score}pt${comboText}` });
	return embed;
}

function buildTimeoutEmbed(question, session) {
	return new EmbedBuilder()
		.setColor(0x9E9E9E)
		.setTitle(`⏰ 시간 초과! — 정답: ${question.language}`)
		.addFields(
			{ name: '📖 언어 소개', value: question.description },
			{ name: '📊 현재 점수', value: `${session.score}pt  (콤보 초기화)` },
		);
}

function buildFinalEmbed(session) {
	const accuracy = session.count > 0
		? Math.round((session.correctCount / session.count) * 100)
		: 0;
	return new EmbedBuilder()
		.setColor(0x5865F2)
		.setTitle('🏁 퀴즈 종료!')
		.setDescription(`${DIFFICULTY_LABEL[session.difficulty] ?? session.difficulty} 난이도  •  ${session.count}문제`)
		.addFields(
			{ name: '📊 최종 점수', value: `${session.score}pt`, inline: true },
			{ name: '✅ 정답', value: `${session.correctCount} / ${session.count}`, inline: true },
			{ name: '🎯 정답률', value: `${accuracy}%`, inline: true },
			{ name: '🏆 티어', value: getTier(session.score), inline: true },
		)
		.setTimestamp();
}

// ─── 게임 흐름 ───────────────────────────────────────────────────────────────

async function showQuestion(session, channel) {
	const question = session.questions[session.currentIdx];
	session.hintUsed = false;
	session.questionStartTime = Date.now();
	session.isProcessing = false;

	if (isTextMode(session.difficulty)) {
		await showTextQuestion(session, question, channel);
	}
	else {
		await showButtonQuestion(session, question, channel);
	}
}

async function showButtonQuestion(session, question, channel) {
	const choices = buildChoices(question);
	session.choices = choices;

	const embed = buildButtonQuestionEmbed(session, question);
	const buttons = buildAnswerButtons(choices, session.sessionId);

	if (session.currentMessage) {
		await session.currentMessage.edit({ embeds: [embed], components: buttons }).catch(() => {});
	}
	else {
		const msg = await channel.send({ embeds: [embed], components: buttons });
		session.currentMessage = msg;

		const collector = channel.createMessageComponentCollector({
			filter: (i) =>
				i.customId.startsWith(`lq_${session.sessionId}_`) &&
				i.user.id === session.userId,
			time: getQuestionTime(session.difficulty) * 1000 * session.count + 30_000,
		});

		collector.on('collect', async (i) => {
			if (session.isProcessing) { await i.deferUpdate().catch(() => {}); return; }
			session.isProcessing = true;
			clearTimeout(session.timeoutId);
			session.currentMessage = i.message;

			const idx = parseInt(i.customId.split('_')[2]);
			await i.deferUpdate().catch(() => {});
			await processAnswer(session, session.choices[idx], channel, false);
		});

		collector.on('end', (_, reason) => {
			if (reason !== 'ended') {
				if (sessions.has(`${session.guildId}_${session.userId}`)) endQuiz(session, channel);
			}
		});

		session.collector = collector;
	}

	session.timeoutId = setTimeout(
		() => handleTimeout(session, channel),
		getQuestionTime(session.difficulty) * 1000,
	);
}

async function showTextQuestion(session, question, channel) {
	const timeSec = getQuestionTime(session.difficulty);
	const embed = buildTextQuestionEmbed(session, question);
	const hintRow = buildHintRow(session.sessionId, session.difficulty);

	if (session.currentMessage) {
		await session.currentMessage.edit({ embeds: [embed], components: [hintRow] }).catch(() => {});
	}
	else {
		const msg = await channel.send({ embeds: [embed], components: [hintRow] });
		session.currentMessage = msg;

		// 힌트 버튼 collector (세션 전체)
		const btnCollector = channel.createMessageComponentCollector({
			filter: (i) =>
				i.customId === `lq_${session.sessionId}_hint` &&
				i.user.id === session.userId,
			time: timeSec * 1000 * session.count + 30_000,
		});

		btnCollector.on('collect', async (i) => {
			await useHint(i, session);
		});

		btnCollector.on('end', (_, reason) => {
			if (reason !== 'ended') {
				if (sessions.has(`${session.guildId}_${session.userId}`)) endQuiz(session, channel);
			}
		});

		session.collector = btnCollector;
	}

	// 텍스트 입력 collector (문제별로 교체)
	if (session.msgCollector) session.msgCollector.stop('newQuestion');

	const msgCollector = channel.createMessageCollector({
		filter: (m) => m.author.id === session.userId && !m.author.bot,
		time: timeSec * 1000,
	});

	msgCollector.on('collect', async (m) => {
		if (session.isProcessing) return;
		const raw = m.content.trim();
		const answer = raw.startsWith('!정답 ') ? raw.slice('!정답 '.length).trim() : raw;
		if (!answer) return;
		session.isProcessing = true;
		msgCollector.stop('answered');
		clearTimeout(session.timeoutId);

		await processAnswer(session, answer, channel, true);
	});

	session.msgCollector = msgCollector;

	session.timeoutId = setTimeout(() => {
		if (!session.isProcessing) {
			session.isProcessing = true;
			if (session.msgCollector) session.msgCollector.stop('timeout');
			handleTimeout(session, channel);
		}
	}, timeSec * 1000);
}

async function useHint(i, session) {
	if (session.hintUsed) { await i.deferUpdate().catch(() => {}); return; }
	session.hintUsed = true;

	const question = session.questions[session.currentIdx];
	const embed = buildTextQuestionEmbed(session, question, question.hint);
	const disabledRow = buildHintRow(session.sessionId, session.difficulty, true);

	await i.update({ embeds: [embed], components: [disabledRow] }).catch(() => {});
}

async function processAnswer(session, chosen, channel, isTextInput) {
	const question = session.questions[session.currentIdx];
	const isCorrect = isTextInput
		? checkTextAnswer(chosen, question.language)
		: chosen === question.language;

	let earned = 0;
	let timeBonus = 1.0;
	let comboBonus = 1.0;

	if (isCorrect) {
		const elapsed = (Date.now() - session.questionStartTime) / 1000;
		const timeSec = getQuestionTime(session.difficulty);
		timeBonus = Math.max(1.0, Math.min(1.5, 1 + ((timeSec - elapsed) / timeSec) * 0.5));
		session.combo++;
		comboBonus = getComboBonus(session.combo);

		const basePts = BASE_PTS[question.difficulty] ?? BASE_PTS.easy;
		let pts = Math.floor(basePts * timeBonus * comboBonus);
		if (session.hintUsed) {
			pts = Math.floor(pts * (1 - getHintPct(session.difficulty) / 100));
		}
		earned = pts;
		session.score += earned;
		session.correctCount++;
	}
	else {
		session.combo = 0;
	}

	recordAnswer({
		guildId: session.guildId,
		userId: session.userId,
		username: session.username,
		language: question.language,
		difficulty: question.difficulty,
		isCorrect,
		points: earned,
	});

	const resultEmbed = buildResultEmbed(isCorrect, question, earned, timeBonus, comboBonus, session, session.hintUsed);
	if (session.currentMessage) {
		await session.currentMessage.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});
	}

	session.currentIdx++;
	await delay(RESULT_DELAY_MS);

	if (session.currentIdx >= session.count) {
		await endQuiz(session, channel);
	}
	else {
		await showQuestion(session, channel);
	}
}

async function handleTimeout(session, channel) {
	if (session.isProcessing) return;
	session.isProcessing = true;
	session.combo = 0;

	const question = session.questions[session.currentIdx];
	if (session.currentMessage) {
		await session.currentMessage
			.edit({ embeds: [buildTimeoutEmbed(question, session)], components: [] })
			.catch(() => {});
	}

	session.currentIdx++;
	await delay(RESULT_DELAY_MS);

	if (session.currentIdx >= session.count) {
		await endQuiz(session, channel);
	}
	else {
		await showQuestion(session, channel);
	}
}

async function endQuiz(session, channel) {
	const key = `${session.guildId}_${session.userId}`;
	sessions.delete(key);
	if (session.collector) session.collector.stop('ended');
	if (session.msgCollector) session.msgCollector.stop('ended');
	clearTimeout(session.timeoutId);

	const embed = buildFinalEmbed(session);
	if (session.currentMessage) {
		await session.currentMessage.edit({ embeds: [embed], components: [] }).catch(() => {});
	}
	else {
		await channel.send({ embeds: [embed] }).catch(() => {});
	}
}

// ─── 서브커맨드 핸들러 ────────────────────────────────────────────────────────

async function handleStart(interaction) {
	const channel = interaction.channel
		?? await interaction.client.channels.fetch(interaction.channelId).catch(() => null);

	if (!channel) {
		return interaction.reply({
			content: '채널에 접근할 수 없습니다. 봇의 채널 권한(메시지 보기)을 확인해주세요.',
			ephemeral: true,
		});
	}

	const key = `${interaction.guildId}_${interaction.user.id}`;
	if (sessions.has(key)) {
		return interaction.reply({
			content: '이미 진행 중인 퀴즈가 있습니다! `/언어퀴즈 끝내기`로 먼저 종료하세요.',
			ephemeral: true,
		});
	}

	const difficulty = interaction.options.getString('난이도') ?? 'easy';
	const count = interaction.options.getInteger('카운트') ?? 10;

	const pool = difficulty === 'random'
		? QUESTIONS.filter((q) => q.difficulty === 'easy' || q.difficulty === 'normal')
		: QUESTIONS.filter((q) => q.difficulty === difficulty);

	if (pool.length < count) {
		return interaction.reply({
			content: `문제가 부족합니다. 현재 ${pool.length}문제만 가능합니다.`,
			ephemeral: true,
		});
	}

	const session = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId,
		sessionId: randomId(),
		questions: shuffle(pool).slice(0, count),
		currentIdx: 0,
		score: 0,
		combo: 0,
		correctCount: 0,
		difficulty,
		count,
		hintUsed: false,
		questionStartTime: null,
		timeoutId: null,
		currentMessage: null,
		choices: null,
		collector: null,
		msgCollector: null,
		isProcessing: false,
	};

	sessions.set(key, session);

	const timeNote = isTextMode(difficulty)
		? '\n💬 채팅으로 언어 이름을 직접 입력하세요!'
		: '';

	await interaction.reply({
		content: `**퀴즈 시작!** ${DIFFICULTY_LABEL[difficulty] ?? difficulty} 난이도  •  ${count}문제${timeNote}`,
		ephemeral: true,
	});

	await showQuestion(session, channel);
}

async function handleStop(interaction) {
	const key = `${interaction.guildId}_${interaction.user.id}`;
	const session = sessions.get(key);

	if (!session) {
		return interaction.reply({ content: '진행 중인 퀴즈가 없습니다.', ephemeral: true });
	}

	clearTimeout(session.timeoutId);
	session.isProcessing = true;
	await endQuiz(session, interaction.channel);
	await interaction.reply({ content: '퀴즈를 종료했습니다.', ephemeral: true });
}

async function handleHint(interaction) {
	const key = `${interaction.guildId}_${interaction.user.id}`;
	const session = sessions.get(key);

	if (!session) {
		return interaction.reply({ content: '진행 중인 퀴즈가 없습니다.', ephemeral: true });
	}
	if (!isTextMode(session.difficulty)) {
		return interaction.reply({
			content: '이지/노말 난이도는 힌트를 지원하지 않습니다.',
			ephemeral: true,
		});
	}
	if (session.hintUsed) {
		return interaction.reply({
			content: '이미 이 문제에서 힌트를 사용했습니다.',
			ephemeral: true,
		});
	}

	session.hintUsed = true;
	const question = session.questions[session.currentIdx];
	const embed = buildTextQuestionEmbed(session, question, question.hint);
	const disabledRow = buildHintRow(session.sessionId, session.difficulty, true);

	await session.currentMessage?.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
	await interaction.reply({
		content: `💡 힌트 공개! 점수 ${getHintPct(session.difficulty)}% 차감됩니다.`,
		ephemeral: true,
	});
}

async function handleRanking(interaction) {
	const ranking = await getServerRanking(interaction.guildId);

	if (ranking.length === 0) {
		return interaction.reply({ content: '아직 기록된 점수가 없습니다.', ephemeral: true });
	}

	const medals = ['🥇', '🥈', '🥉'];
	const lines = ranking.map((entry, idx) => {
		const medal = medals[idx] ?? `**${idx + 1}.**`;
		const acc = entry.totalAnswered > 0
			? Math.round((entry.correctCount / entry.totalAnswered) * 100)
			: 0;
		return `${medal} **${entry.username}** — ${entry.totalScore}pt  •  ${getTier(entry.totalScore)}  •  정답률 ${acc}%`;
	});

	await interaction.reply({
		embeds: [
			new EmbedBuilder()
				.setColor(0xFFD700)
				.setTitle('🏆 서버 랭킹 TOP 10')
				.setDescription(lines.join('\n'))
				.setTimestamp(),
		],
	});
}

async function handleStats(interaction) {
	const targetUser = interaction.options.getUser('사용자') ?? interaction.user;
	const stats = await getUserStats(interaction.guildId, targetUser.id);

	if (!stats) {
		return interaction.reply({
			content: `${targetUser.displayName}님의 기록이 없습니다. 퀴즈를 먼저 플레이해 보세요!`,
			ephemeral: true,
		});
	}

	const accuracy = stats.totalAnswered > 0
		? Math.round((stats.correctCount / stats.totalAnswered) * 100)
		: 0;

	const weakLangs = Object.entries(stats.byLanguage)
		.filter(([, d]) => d.total >= 3)
		.map(([lang, d]) => ({ lang, rate: d.correct / d.total, ...d }))
		.sort((a, b) => a.rate - b.rate)
		.slice(0, 3);

	const weakText = weakLangs.length > 0
		? weakLangs.map((w, i) =>
			`${i + 1}위 **${w.lang}** — 정답률 ${Math.round(w.rate * 100)}% (${w.correct}/${w.total})`).join('\n')
		: '아직 충분한 데이터가 없습니다. (언어당 3회 이상 필요)';

	await interaction.reply({
		embeds: [
			new EmbedBuilder()
				.setColor(0x2196F3)
				.setTitle(`📊 ${targetUser.displayName}님의 통계`)
				.addFields(
					{ name: '총 점수', value: `${stats.totalScore}pt`, inline: true },
					{ name: '정답 / 도전', value: `${stats.correctCount} / ${stats.totalAnswered}`, inline: true },
					{ name: '정답률', value: `${accuracy}%`, inline: true },
					{ name: '🏆 티어', value: getTier(stats.totalScore), inline: true },
					{ name: '⚠️ 취약 언어 TOP 3', value: weakText },
				)
				.setTimestamp(),
		],
	});
}

// ─── 커맨드 정의 ─────────────────────────────────────────────────────────────

module.exports = {
	data: new SlashCommandBuilder()
		.setName('언어 퀴즈')
		.setDescription('프로그래밍 언어 퀴즈')
		.addSubcommand((sub) =>
			sub.setName('시작')
				.setDescription('퀴즈를 시작합니다')
				.addStringOption((opt) =>
					opt.setName('난이도')
						.setDescription('난이도를 선택하세요 (기본: 이지)')
						.addChoices(
							{ name: '⭐ 이지 — 버튼 선택 (10pt)', value: 'easy' },
							{ name: '⭐⭐ 노말 — 버튼 선택 (20pt)', value: 'normal' },
							{ name: '⭐⭐⭐ 하드 — 직접 입력 (40pt)', value: 'hard' },
							{ name: '⭐⭐⭐⭐ 익스퍼트 — 직접 입력 (70pt)', value: 'expert' },
							{ name: '🎲 랜덤 — 이지+노말 혼합', value: 'random' },
						),
				)
				.addIntegerOption((opt) =>
					opt.setName('카운트')
						.setDescription('문제 수 (기본: 10)')
						.addChoices(
							{ name: '5문제', value: 5 },
							{ name: '10문제', value: 10 },
							{ name: '15문제', value: 15 },
						),
				),
		)
		.addSubcommand((sub) =>
			sub.setName('보너스').setDescription('Esolang 보너스 챌린지 (5문제 / 150pt / 40초)'),
		)
		.addSubcommand((sub) =>
			sub.setName('끝내기').setDescription('진행 중인 퀴즈를 종료합니다'),
		)
		.addSubcommand((sub) =>
			sub.setName('힌트').setDescription('현재 문제의 힌트를 봅니다 (하드 이상, 점수 차감)'),
		)
		.addSubcommand((sub) =>
			sub.setName('랭킹').setDescription('서버 랭킹을 확인합니다'),
		)
		.addSubcommand((sub) =>
			sub.setName('스탯')
				.setDescription('개인 통계를 확인합니다')
				.addUserOption((opt) =>
					opt.setName('사용자').setDescription('확인할 사용자 (미입력 시 본인)'),
				),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === '시작') return handleStart(interaction);
		if (sub === '보너스') return handleBonus(interaction);
		if (sub === '끝내기') return handleStop(interaction);
		if (sub === '힌트') return handleHint(interaction);
		if (sub === '랭킹') return handleRanking(interaction);
		if (sub === '스탯') return handleStats(interaction);
	},
};

async function handleBonus(interaction) {
	const key = `${interaction.guildId}_${interaction.user.id}`;
	if (sessions.has(key)) {
		return interaction.reply({
			content: '이미 진행 중인 퀴즈가 있습니다! `/언어퀴즈 끝내기`로 먼저 종료하세요.',
			ephemeral: true,
		});
	}

	const pool = QUESTIONS.filter((q) => q.difficulty === 'bonus');
	if (pool.length === 0) {
		return interaction.reply({ content: '보너스 문제가 아직 없습니다.', ephemeral: true });
	}

	const count = Math.min(5, pool.length);
	const session = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId,
		sessionId: randomId(),
		questions: shuffle(pool).slice(0, count),
		currentIdx: 0,
		score: 0,
		combo: 0,
		correctCount: 0,
		difficulty: 'bonus',
		count,
		hintUsed: false,
		questionStartTime: null,
		timeoutId: null,
		currentMessage: null,
		choices: null,
		collector: null,
		msgCollector: null,
		isProcessing: false,
	};

	sessions.set(key, session);

	await interaction.reply({
		content: '🎲 **보너스 챌린지 시작!** Esolang 5문제  •  40초  •  150pt\n💬 채팅으로 언어 이름을 입력하세요!',
		ephemeral: true,
	});

	await showQuestion(session, interaction.channel);
}
