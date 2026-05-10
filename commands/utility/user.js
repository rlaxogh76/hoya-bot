const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Replies with user info'),
	async execute(interaction) {
		try {
			await interaction.reply(`This command runned by ${interaction.user.username}, who joined at ${interaction.user.createdAt}`);
		}
		catch (error) {
			logger.error('Error while executing command:', error);
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	},
};