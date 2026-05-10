require('dotenv').config();
const { REST, Routes } = require('discord.js');
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const fs = require('node:fs');
const path = require('node:path');

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

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
for (const filePath of loadCommandFiles(foldersPath)) {
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	}
	else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
	try {
		console.log(
			`Started refreshing ${commands.length} application (/) commands.`,
		);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationCommands(clientId), // 모든 서버 허용
			{ body: commands },
		);

		console.log(
			`Successfully reloaded ${data.length} application (/) commands.`,
		);
	}
	catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();
