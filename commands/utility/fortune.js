const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fortuneData = require('../../fortune.json');

// 하루 1회 제한: key = `userId_YYYY-MM-DD(KST)`
const usageMap = new Map();

const GRADE_COLORS = {
	'대길': 0x00C853,
	'중길': 0x76FF03,
	'소길': 0x2196F3,
	'말길': 0xFF9800,
	'흉':   0xFF5722,
	'대흉': 0xB71C1C,
};

const PLACEHOLDER = 'https://avatars.githubusercontent.com/u/108007761?v=4';
const GRADE_THUMBNAILS = {
	'대길': '../../assets/fortune/happy.gif',
	'중길': '../../assets/fortune/vibing.gif',
	'소길': '../../assets/fortune/happy2.gif',
	'말길': '../../assets/fortune/huh.gif',
	'흉':   '../../assets/fortune/suspect.gif',
	'대흉': '../../assets/fortune/boom.gif',
};

function getTodayKST() {
	// KST = UTC+9
	const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
	return kst.toISOString().slice(0, 10);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('운세')
		.setDescription('오늘의 운세를 확인합니다 (하루 1회)'),

	async execute(interaction) {
		const userId = interaction.user.id;
		const today = getTodayKST();
		const usageKey = `${userId}_${today}`;

		if (usageMap.has(usageKey)) {
			return interaction.reply({
				content: '오늘의 운세는 이미 확인하셨어요! 자정이 지나면 다시 볼 수 있어요. 🌙',
				ephemeral: true,
			});
		}

		const grades = fortuneData.fortunes;
		const pickedGrade = grades[Math.floor(Math.random() * grades.length)];
		const pickedMessage = pickedGrade.messages[Math.floor(Math.random() * pickedGrade.messages.length)];

		usageMap.set(usageKey, true);

		const embed = new EmbedBuilder()
			.setColor(GRADE_COLORS[pickedGrade.grade])
			.setThumbnail(GRADE_THUMBNAILS[pickedGrade.grade])
			.setTitle(`🔮 ${interaction.user.displayName}님의 오늘의 운세`)
			.addFields(
				{ name: '​', value: `**${pickedGrade.gradeDisplay}**`, inline: true },
				{ name: '​', value: '​', inline: true },
				{ name: '오늘의 메시지', value: pickedMessage },
			)
			.setFooter({ text: '운세는 하루에 한 번만 볼 수 있어요. 자정에 초기화됩니다.' })
			.setTimestamp();

		await interaction.reply({ embeds: [embed] });
	},
};
