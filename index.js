// 1. 주요 클래스 가져오기
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
	Client,
	Collection,
	Events,
	GatewayIntentBits,
	MessageFlags,
} = require('discord.js');
const token = process.env.DISCORD_TOKEN;

const logger = require('./logger');

// 2. 클라이언트 객체 생성 (Guilds관련, 메시지관련 인텐트 추가)
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

// 3. 봇이 준비됐을때 한번만(once) 표시할 메시지
client.once(Events.ClientReady, (readyClient) => {
	logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
});


client.on(Events.InteractionCreate, async (interaction) => {
	logger.info(interaction);

	if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		logger.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	}
	catch (error) {
		logger.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		}
		else {
			await interaction.reply({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		}
	}
});

// 4. 시크릿키(토큰)을 통해 봇 로그인 실행
client.commands = new Collection();

function loadCommandFiles(dirPath) {
	const files = [];
	for (const entry of fs.readdirSync(dirPath)) {
		const fullPath = path.join(dirPath, entry);
		if (fs.statSync(fullPath).isDirectory()) {
			files.push(...loadCommandFiles(fullPath));
		}
		else if (entry.endsWith('.js')) {
			files.push(fullPath);
		}
	}
	return files;
}

const foldersPath = path.join(__dirname, 'commands');
for (const filePath of loadCommandFiles(foldersPath)) {
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	}
	else {
		logger.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

client.login(token);

process.on('uncaughtException', (error) => {
	logger.error('[uncaughtException]', error);
});

process.on('unhandledRejection', (reason) => {
	logger.error('[unhandledRejection]', reason);
});