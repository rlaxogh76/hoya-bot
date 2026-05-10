const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../../logger');

function injectWhiteBackground(svgContent) {
  const vbMatch = svgContent.match(/viewBox="([^"]+)"/);
  let bgRect = '<rect x="0" y="0" width="100%" height="100%" fill="white"/>';
  if (vbMatch) {
    const [minX, minY, w, h] = vbMatch[1].trim().split(/\s+/).map(Number);
    bgRect = `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="white"/>`;
  }
  return svgContent.replace('</defs>', `</defs>${bgRect}`);
}

async function svgToPng(svgContent) {
  const svgWithBg = injectWhiteBackground(svgContent);

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 500 });
    await page.setContent(
      `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>*{margin:0;padding:0}body{display:inline-block}</style>
      </head><body>${svgWithBg}</body></html>`,
      { waitUntil: 'networkidle0' },
    );

    const { w, h } = await page.evaluate(() => ({
      w: document.body.scrollWidth,
      h: document.body.scrollHeight,
    }));
    logger.info(`[solvedAC] SVG 크기: ${w}x${h}`);

    const raw = await page.screenshot({
      clip: { x: 0, y: 0, width: w, height: h },
      type: 'png',
    });
    return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  } finally {
    await browser.close();
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('솔브드')
    .setDescription('Solved.ac 관련 명령어')
    .addSubcommand(sub =>
      sub
        .setName('유저')
        .setDescription('Solved.ac 유저 프로필을 조회합니다.')
        .addStringOption(opt =>
          opt
            .setName('사용자이름')
            .setDescription('조회할 Solved.ac 핸들')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const handle = interaction.options.getString('사용자이름');
    logger.info(`[solvedAC] 유저 조회: ${handle}`);

    try {
      const statsUrl = `https://solvedac-readme-stats.vercel.app/api?handle=${encodeURIComponent(handle)}&v=1&streak=false&full=1&_preview=1778076987095`;

      logger.info(`[solvedAC] SVG 요청`);
      const svgRes = await fetch(statsUrl);
      if (!svgRes.ok) {
        await interaction.editReply(`❌ 프로필 이미지를 가져올 수 없어요 (${svgRes.status})`);
        return;
      }
      const svgText = await svgRes.text();

      logger.info(`[solvedAC] PNG 변환 시작`);
      const pngBuffer = await svgToPng(svgText);
      logger.info(`[solvedAC] PNG 생성 완료: ${pngBuffer.length} bytes`);

      const attachment = new AttachmentBuilder(pngBuffer, { name: 'solvedac.png' });

      await interaction.editReply({ files: [attachment] });
      logger.info(`[solvedAC] ${handle} 응답 완료`);
    } catch (err) {
      logger.error(`[solvedAC] 에러: ${err.message}`);
      logger.error(err.stack);
      await interaction.editReply(`❌ ${err.message}`);
    }
  },
};
