const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('GitHub 프로필 카드를 이미지로 전송합니다'),
  async execute(interaction) {
    await interaction.deferReply();

    const htmlPath = path.join(__dirname, '../../github_profile_card_v2.html');
    const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
      await page.goto(fileUrl, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.card');

      const card = await page.$('.card');
      const imageBuffer = await card.screenshot({ type: 'png' });

      const attachment = new AttachmentBuilder(imageBuffer, { name: 'github-profile.png' });
      await interaction.editReply({ files: [attachment] });
    } finally {
      await browser.close();
    }
  },
};
