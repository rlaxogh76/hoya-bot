const reactQuestions = require('../../data/interview/frontend/react/questions.json');
const cssQuestions = require('../../data/interview/frontend/css3/questions.json');
const htmlQuestions = require('../../data/interview/frontend/html5/questions.json');

const questions = [
	...reactQuestions,
	...cssQuestions,
	...htmlQuestions,
];
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
  	.setName('embed')
  	.setDescription('임시 임베드 템플릿을 전송합니다'),

	async execute(interaction) {
		if (questions.length === 0) {
			await interaction.reply('이런! 면접 질문을 불러오지 못했어요... 😢');
			return;
		}

  	const q = questions[Math.floor(Math.random() * questions.length)];

  	const embed = new EmbedBuilder()
    	.setColor(39129)
    	.setTitle(q.question)
			.setURL(
				typeof q.authorUrl === 'string' && q.authorUrl.startsWith('http')
					? q.authorUrl
    			: null,
			)
			.setAuthor({
				name: `질문 생성자 : ${q.author ?? 'Unknown'}`,
				url:
    typeof q.authorUrl === 'string' && q.authorUrl.startsWith('http')
    	? q.authorUrl
    	: undefined,
				iconURL: 'https://i.ibb.co/xrbdW7K/9753952.png',
			})
    	.setThumbnail(`${q.thumbnail}`)
    	.setImage('https://glitchii.github.io/embedbuilder/assets/media/banner.png')
    	.addFields(
      	 {
      	  name: '💬 모범 답안',
      	  value:
		  `${q.answer.length > 1024 ? q.answer.slice(0, 1021) + '...' : q.answer}`,
      	  inline: true,
      	},
      	{
      	  name: '📚 관련 자료',
      	  value:
		  `${q.references.length > 1024 ? q.references.slice(0, 1021) + '...' : q.references}`,
      	  inline: false,
      	},
    	 )
    	.setTimestamp();

  	await interaction.reply({
    	content: '띵동! 오늘의 면접 질문이에요! 📬',
    	embeds: [embed],
  	});
	},
};
