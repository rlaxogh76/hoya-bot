const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	AttachmentBuilder,
} = require('discord.js');
const path = require('path');

const { LOGOS } = require('../../../utils/game/logoQuizData');
const { recordAnswer, getServerRanking, getUserStats } = require('../../../utils/game/logoQuizScores');

const sessions = new Map(); // key: `${guildId}_${userId}`

// ─── 상수 ───────────────────────────────────────────────────────────────────

const CATEGORY_LABEL = {
	frontend: '🖥️ 프론트엔드',
	backend: '⚙️ 백엔드',
	devops: '🐳 DevOps',
	db: '🗄️ DB/인프라',
	all: '🌐 전체',
};

const DIFFICULTY_COLOR = {
	easy: 0x00C853,
	normal: 0x2196F3,
	hard: 0xFF9800,
	random: 0x9C27B0,
};

const DIFFICULTY_LABEL = {
	easy: '⭐ Easy',
	normal: '⭐⭐ Normal',
	hard: '⭐⭐⭐ Hard',
	random: '🎲 랜덤',
};

const BASE_PTS = { easy: 10, normal: 20, hard: 40 };
const QUESTION_TIME = { easy: 15, normal: 20, hard: 25, random: 20 };
const RESULT_DELAY_MS = 2000;
const CHOICE_EMOJI = ['①', '②', '③', '④'];
const ICONS_DIR = path.join(__dirname, '../../../assets/icons');

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

function getComboBonus(combo) {
	if (combo >= 7) return 2.0;
	if (combo >= 5) return 1.5;
	if (combo >= 3) return 1.2;
	return 1.0;
}

function getTier(score) {
	if (score >= 5000) return '<:diamond_tier:1502949178945572924> Logo Legend';
	if (score >= 4000) return '<:opal_tier:1502949183513170084> Logo Master';
	if (score >= 3000) return '<:ruby_tier:1502949186801500261> Logo Expert';
	if (score >= 2000) return '<:platinum_tier:1502949185413185586> Tech Sommelier';
	if (score >= 1000) return '<:emerald_tier:1502949180560113694> Stack Learner';
	if (score >= 500) return '<:gold_tier:1502949182162599946> Stack Reader';
	if (score >= 100) return '<:silver_tier:1502949188227436585> Logo Learner';
	return '<:bronze_tier:1502949177209127015> Logo Newbie';
}

function getQuestionTime(difficulty) {
	return QUESTION_TIME[difficulty] ?? 20;
}

function delay(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ─── Discord 빌더 ────────────────────────────────────────────────────────────

function buildQuestionEmbed(session, logo, attachmentName) {
	const { currentIdx, count, score, combo, difficulty } = session;
	const qDiff = difficulty === 'random' ? logo.difficulty : difficulty;
	const comboText = combo >= 3 ? `  •  🔥${combo}콤보` : '';

	return new EmbedBuilder()
		.setColor(DIFFICULTY_COLOR[qDiff] ?? 0x5865F2)
		.setTitle(`🖼️ Logo Guesser  •  문제 ${currentIdx + 1} / ${count}`)
		.setDescription('**이 로고는 무엇일까요?**')
		.addFields(
			{ name: '⭐ 난이도', value: DIFFICULTY_LABEL[qDiff] ?? qDiff, inline: true },
			{ name: '📁 카테고리', value: CATEGORY_LABEL[logo.category] ?? logo.category, inline: true },
			{ name: '📊 현재 점수', value: `${score}pt${comboText}`, inline: true },
		)
		.setImage(`attachment://${attachmentName}`)
		.setFooter({ text: `⏱️ 제한 시간 ${getQuestionTime(difficulty)}초` });
}

function buildAnswerButtons(choices, sessionId) {
	const buttons = choices.map((name, idx) =>
		new ButtonBuilder()
			.setCustomId(`logo_${sessionId}_${idx}`)
			.setLabel(`${CHOICE_EMOJI[idx]} ${name}`)
			.setStyle(ButtonStyle.Primary),
	);
	return [
		new ActionRowBuilder().addComponents(buttons[0], buttons[1]),
		new ActionRowBuilder().addComponents(buttons[2], buttons[3]),
	];
}

function buildResultEmbed(isCorrect, logo, earned, timeBonus, comboBonus, session) {
	const color = isCorrect ? 0x00C853 : 0xFF5722;
	const title = isCorrect
		? `✅ 정답! — ${logo.name}`
		: `❌ 오답! — 정답은 **${logo.name}**`;

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(title)
		.addFields({ name: '📖 한 줄 설명', value: logo.description });

	if (isCorrect) {
		embed.addFields({
			name: '💰 획득 점수',
			value: `+${earned}pt  (시간 ×${timeBonus.toFixed(1)}, 콤보 ×${comboBonus.toFixed(1)})`,
		});
	}

	const comboText = session.combo >= 3 ? `  •  🔥${session.combo}콤보` : '';
	embed.addFields({ name: '📊 현재 점수', value: `${session.score}pt${comboText}` });
	return embed;
}

function buildTimeoutEmbed(logo, session) {
	return new EmbedBuilder()
		.setColor(0x9E9E9E)
		.setTitle(`⏰ 시간 초과! — 정답: ${logo.name}`)
		.addFields(
			{ name: '📖 한 줄 설명', value: logo.description },
			{ name: '📊 현재 점수', value: `${session.score}pt  (콤보 초기화)` },
		);
}

function buildFinalEmbed(session, totalScore) {
	const accuracy = session.count > 0
		? Math.round((session.correctCount / session.count) * 100)
		: 0;
	const catLabel = CATEGORY_LABEL[session.category] ?? session.category;
	const diffLabel = DIFFICULTY_LABEL[session.difficulty] ?? session.difficulty;

	return new EmbedBuilder()
		.setColor(0x5865F2)
		.setTitle('🏁 퀴즈 종료!')
		.setDescription(`${catLabel}  •  ${diffLabel}  •  ${session.count}문제`)
		.addFields(
			{ name: '✅ 정답 / 문제', value: `${session.correctCount} / ${session.count}  (${accuracy}%)`, inline: true },
			{ name: '📊 획득 점수', value: `${session.score}pt`, inline: true },
			{ name: '🔥 최고 콤보', value: `${session.maxCombo}`, inline: true },
			{ name: '🏆 현재 티어', value: getTier(totalScore), inline: true },
		)
		.setTimestamp();
}

// ─── 게임 흐름 ───────────────────────────────────────────────────────────────

async function showQuestion(session, channel) {
	const logo = session.questions[session.currentIdx];
	session.isProcessing = false;
	session.questionStartTime = Date.now();

	// 매 문제마다 고유한 파일명으로 Discord 캐시 충돌 방지
	const attachmentName = `logo_${session.sessionId}_q${session.currentIdx}.png`;
	const attachment = new AttachmentBuilder(
		path.join(ICONS_DIR, logo.file),
		{ name: attachmentName },
	);

	session.currentChoices = shuffle([logo.name, ...logo.distractors.slice(0, 3)]);

	const embed = buildQuestionEmbed(session, logo, attachmentName);
	const buttons = buildAnswerButtons(session.currentChoices, session.sessionId);

	if (session.currentMessage) {
		await session.currentMessage.edit({
			embeds: [embed],
			components: buttons,
			files: [attachment],
			attachments: [],
		}).catch(() => {});
	}
	else {
		const msg = await channel.send({
			embeds: [embed],
			components: buttons,
			files: [attachment],
		});
		session.currentMessage = msg;

		const collector = channel.createMessageComponentCollector({
			filter: (i) =>
				i.customId.startsWith(`logo_${session.sessionId}_`) &&
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
			await processAnswer(session, session.currentChoices[idx], channel);
		});

		collector.on('end', (_, reason) => {
			if (reason !== 'ended') {
				if (sessions.has(`${session.guildId}_${session.userId}`)) {
					endQuiz(session, channel);
				}
			}
		});

		session.collector = collector;
	}

	session.timeoutId = setTimeout(
		() => handleTimeout(session, channel),
		getQuestionTime(session.difficulty) * 1000,
	);
}

async function processAnswer(session, chosen, channel) {
	const logo = session.questions[session.currentIdx];
	const isCorrect = chosen === logo.name;

	let earned = 0;
	let timeBonus = 1.0;
	let comboBonus = 1.0;

	if (isCorrect) {
		const elapsed = (Date.now() - session.questionStartTime) / 1000;
		const timeSec = getQuestionTime(session.difficulty);
		timeBonus = Math.max(1.0, Math.min(1.5, 1 + ((timeSec - elapsed) / timeSec) * 0.5));
		session.combo++;
		if (session.combo > session.maxCombo) session.maxCombo = session.combo;
		comboBonus = getComboBonus(session.combo);

		const qDiff = session.difficulty === 'random' ? logo.difficulty : session.difficulty;
		const basePts = BASE_PTS[qDiff] ?? BASE_PTS.easy;
		earned = Math.floor(basePts * timeBonus * comboBonus);
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
		logoId: logo.id,
		logoName: logo.name,
		category: logo.category,
		difficulty: logo.difficulty,
		isCorrect,
		points: earned,
	});

	const resultEmbed = buildResultEmbed(isCorrect, logo, earned, timeBonus, comboBonus, session);
	if (session.currentMessage) {
		await session.currentMessage.edit({
			embeds: [resultEmbed],
			components: [],
			attachments: [],
		}).catch(() => {});
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

	const logo = session.questions[session.currentIdx];
	if (session.currentMessage) {
		await session.currentMessage.edit({
			embeds: [buildTimeoutEmbed(logo, session)],
			components: [],
			attachments: [],
		}).catch(() => {});
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
	clearTimeout(session.timeoutId);

	const stats = await getUserStats(session.guildId, session.userId);
	const totalScore = stats?.totalScore ?? session.score;

	const embed = buildFinalEmbed(session, totalScore);
	if (session.currentMessage) {
		await session.currentMessage.edit({
			embeds: [embed],
			components: [],
			attachments: [],
		}).catch(() => {});
	}
	else {
		await channel.send({ embeds: [embed] }).catch(() => {});
	}
}

// ─── 서브커맨드 핸들러 ────────────────────────────────────────────────────────

async function handleStart(interaction) {
	const key = `${interaction.guildId}_${interaction.user.id}`;
	if (sessions.has(key)) {
		return interaction.reply({
			content: '이미 진행 중인 퀴즈가 있습니다! `/로고 종료`로 먼저 종료하세요.',
			ephemeral: true,
		});
	}

	const category = interaction.options.getString('카테고리') ?? 'all';
	const difficulty = interaction.options.getString('난이도') ?? 'easy';
	const count = interaction.options.getInteger('문제수') ?? 10;

	let pool = difficulty === 'random'
		? LOGOS
		: LOGOS.filter((l) => l.difficulty === difficulty);

	if (category !== 'all') {
		pool = pool.filter((l) => l.category === category);
	}

	if (pool.length < 4) {
		return interaction.reply({
			content: `해당 조건의 문제가 부족합니다. (현재 ${pool.length}개)`,
			ephemeral: true,
		});
	}

	const actualCount = Math.min(count, pool.length);
	if (actualCount < count) {
		await interaction.reply({
			content: `문제가 부족해 ${actualCount}문제로 진행합니다.`,
			ephemeral: true,
		});
	}
	else {
		await interaction.reply({
			content: `**로고 퀴즈 시작!** ${CATEGORY_LABEL[category]}  •  ${DIFFICULTY_LABEL[difficulty]}  •  ${actualCount}문제`,
			ephemeral: true,
		});
	}

	const session = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId,
		sessionId: randomId(),
		questions: shuffle(pool).slice(0, actualCount),
		currentIdx: 0,
		score: 0,
		combo: 0,
		maxCombo: 0,
		correctCount: 0,
		category,
		difficulty,
		count: actualCount,
		questionStartTime: null,
		timeoutId: null,
		currentMessage: null,
		currentChoices: null,
		collector: null,
		isProcessing: false,
	};

	sessions.set(key, session);
	await showQuestion(session, interaction.channel);
}

async function handleStop(interaction) {
	const key = `${interaction.guildId}_${interaction.user.id}`;
	const session = sessions.get(key);

	if (!session) {
		return interaction.reply({ content: '진행 중인 퀴즈가 없습니다.', ephemeral: true });
	}

	clearTimeout(session.timeoutId);
	session.isProcessing = true;
	await interaction.reply({ content: '퀴즈를 종료합니다.', ephemeral: true });
	await endQuiz(session, interaction.channel);
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
		const collected = entry.collectedIds?.length ?? 0;
		return `${medal} **${entry.username}** — ${entry.totalScore}pt  •  ${getTier(entry.totalScore)}  •  정답률 ${acc}%  •  도감 ${collected}종`;
	});

	await interaction.reply({
		embeds: [
			new EmbedBuilder()
				.setColor(0xFFD700)
				.setTitle('🏆 로고 퀴즈 서버 랭킹 TOP 10')
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

	const catLines = Object.entries(stats.byCategory)
		.map(([cat, d]) => {
			const rate = Math.round((d.correct / d.total) * 100);
			return `${CATEGORY_LABEL[cat] ?? cat}: **${rate}%** (${d.correct}/${d.total})`;
		})
		.join('\n') || '기록 없음';

	const weakLogos = Object.entries(stats.byLogo)
		.filter(([, d]) => d.total >= 2)
		.map(([name, d]) => ({ name, rate: d.correct / d.total, ...d }))
		.sort((a, b) => a.rate - b.rate)
		.slice(0, 3);

	const weakText = weakLogos.length > 0
		? weakLogos.map((w, i) =>
			`${i + 1}위 **${w.name}** — ${Math.round(w.rate * 100)}% (${w.correct}/${w.total})`).join('\n')
		: '아직 데이터가 부족합니다. (로고당 2회 이상 필요)';

	const collected = stats.collectedIds?.length ?? 0;
	const total = LOGOS.length;

	await interaction.reply({
		embeds: [
			new EmbedBuilder()
				.setColor(0x2196F3)
				.setTitle(`📊 ${targetUser.displayName}님의 로고 퀴즈 통계`)
				.addFields(
					{ name: '총 점수', value: `${stats.totalScore}pt`, inline: true },
					{ name: '정답 / 도전', value: `${stats.correctCount} / ${stats.totalAnswered}`, inline: true },
					{ name: '정답률', value: `${accuracy}%`, inline: true },
					{ name: '🏆 티어', value: getTier(stats.totalScore), inline: true },
					{ name: '📖 도감', value: `${collected} / ${total}`, inline: true },
					{ name: '📁 카테고리별 정답률', value: catLines },
					{ name: '⚠️ 취약 로고 TOP 3', value: weakText },
				)
				.setTimestamp(),
		],
	});
}

// ─── 커맨드 정의 ─────────────────────────────────────────────────────────────

module.exports = {
	data: new SlashCommandBuilder()
		.setName('로고퀴즈')
		.setDescription('기술 스택 로고 맞추기 퀴즈')
		.addSubcommand((sub) =>
			sub.setName('시작')
				.setDescription('로고 퀴즈를 시작합니다')
				.addStringOption((opt) =>
					opt.setName('카테고리')
						.setDescription('카테고리 선택 (기본: 전체)')
						.addChoices(
							{ name: '🌐 전체', value: 'all' },
							{ name: '🖥️ 프론트엔드', value: 'frontend' },
							{ name: '⚙️ 백엔드', value: 'backend' },
							{ name: '🐳 DevOps/클라우드', value: 'devops' },
							{ name: '🗄️ DB/인프라', value: 'db' },
						),
				)
				.addStringOption((opt) =>
					opt.setName('난이도')
						.setDescription('난이도 선택 (기본: Easy)')
						.addChoices(
							{ name: '⭐ Easy — 10pt', value: 'easy' },
							{ name: '⭐⭐ Normal — 20pt', value: 'normal' },
							{ name: '⭐⭐⭐ Hard — 40pt', value: 'hard' },
							{ name: '🎲 랜덤 — 전 난이도 혼합', value: 'random' },
						),
				)
				.addIntegerOption((opt) =>
					opt.setName('문제수')
						.setDescription('문제 수 (기본: 10)')
						.addChoices(
							{ name: '5문제', value: 5 },
							{ name: '10문제', value: 10 },
							{ name: '15문제', value: 15 },
						),
				),
		)
		.addSubcommand((sub) =>
			sub.setName('종료').setDescription('진행 중인 퀴즈를 종료합니다'),
		)
		.addSubcommand((sub) =>
			sub.setName('랭킹').setDescription('서버 로고 퀴즈 랭킹을 확인합니다'),
		)
		.addSubcommand((sub) =>
			sub.setName('통계')
				.setDescription('개인 통계를 확인합니다')
				.addUserOption((opt) =>
					opt.setName('사용자').setDescription('확인할 사용자 (미입력 시 본인)'),
				),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === '시작') return handleStart(interaction);
		if (sub === '종료') return handleStop(interaction);
		if (sub === '랭킹') return handleRanking(interaction);
		if (sub === '통계') return handleStats(interaction);
	},
};
