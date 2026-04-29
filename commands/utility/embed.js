const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} = require('discord.js');

// Node 16이면: const fetch = require('node-fetch');

async function fetchRandomUser() {
	const res = await fetch('http://localhost:3000/interview');

	if (!res.ok) {
		throw new Error(`API 오류: ${res.status}`);
	}

	const interviews = await res.json();

	if (!interviews.length) return null;

	const randomIndex = Math.floor(Math.random() * interviews.length);
	return interviews[randomIndex];
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('embed')
		.setDescription('면접 질문을 랜덤으로 제공합니다'),

	async execute(interaction) {
		try {
			// API에서 랜덤 질문 가져오기
			const q = await fetchRandomUser();

			if (!q) {
				return interaction.reply('질문 데이터를 불러오지 못했습니다.');
			}

			const question = q.question ?? '질문 없음';
			const answer = q.answer ?? '답변 없음';

			const references = q.linkUrl
				? `[${q.linkName ?? '자료 보기'}](${q.linkUrl})`
				: '관련 자료 없음';

			const thumbnail =
        typeof q.thumbnailUrl === 'string'
        	? q.thumbnailUrl.replace('.svg', '.png')
        	: null;

			const validUrl =
        typeof q.authorUrl === 'string' && q.authorUrl.startsWith('http')
        	? q.authorUrl
        	: null;

			const cleanAnswer = answer.replace(/\|\|/g, '');
			const safeAnswer =
        cleanAnswer.length > 1024
        	? cleanAnswer.slice(0, 1021) + '...'
        	: cleanAnswer;

			// 🎯 초기 embed (정답 숨김)
			const embed = new EmbedBuilder()
				.setColor(0x0098ff)
				.setTitle(question)
				.setAuthor({
					name: `질문 생성자 : ${q.author ?? 'Unknown'}`,
				})
				.addFields({
					name: '📚 관련 자료',
					value: references,
				})
				.setTimestamp();

			if (validUrl) {
				embed.setURL(validUrl);
			}

			if (thumbnail) {
				embed.setThumbnail(thumbnail);
			}

			// 🔘 버튼
			const row = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`show_answer_${q.id}`)
					.setLabel('모범 답안 보기 👀')
					.setStyle(ButtonStyle.Primary),
			);

			// 📤 최초 응답
			await interaction.reply({
				embeds: [embed],
				components: [row],
			});

			// 🎯 버튼 collector
			const collector = interaction.channel.createMessageComponentCollector({
				time: 60000,
			});

			collector.on('collect', async (i) => {
				if (i.customId === `show_answer_${q.id}`) {
					const updatedEmbed = EmbedBuilder.from(embed).setFields(
						{
							name: '👀 모범 답안',
							value: safeAnswer,
						},
						{
							name: '📚 관련 자료',
							value: references,
						},
					);

					await i.update({
						embeds: [updatedEmbed],
						components: [],
					});
				}
			});

		}
		catch (error) {
			console.error(error);

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp('오류가 발생했어요.. 나중에 다시 시도해주세요 😢');
			}
			else {
				await interaction.reply('오류가 발생했어요.. 나중에 다시 시도해주세요 😢');
			}
		}
	},
};
