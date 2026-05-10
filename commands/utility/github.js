// commands/utility/github.js
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { githubToken } = require('../../config.json');
const logger = require('../../logger');

const ghHeaders = {
  'Authorization': `token ${githubToken}`,
  'Accept': 'application/vnd.github.v3+json',
};

async function getUserInfo(username) {
  const res = await fetch(`https://api.github.com/users/${username}`, { headers: ghHeaders });
  if (res.status === 404) throw new Error(`\`${username}\` 유저를 찾을 수 없어요.`);
  if (!res.ok) throw new Error(`REST API 오류 (${res.status})`);
  return res.json();
}

async function getTotalStars(username) {
  const res = await fetch(
    `https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`,
    { headers: ghHeaders },
  );
  if (!res.ok) return 0;
  const repos = await res.json();
  return repos.reduce((sum, r) => sum + r.stargazers_count, 0);
}

async function getCommitCount(username) {
  const res = await fetch(
    `https://api.github.com/search/commits?q=author:${username}&per_page=1`,
    { headers: { ...ghHeaders, 'Accept': 'application/vnd.github.cloak-preview+json' } },
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.total_count ?? 0;
}

async function getIssueCount(username) {
  const res = await fetch(
    `https://api.github.com/search/issues?q=author:${username}+type:issue&per_page=1`,
    { headers: ghHeaders },
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.total_count ?? 0;
}

async function getPRCount(username) {
  const res = await fetch(
    `https://api.github.com/search/issues?q=author:${username}+type:pr&per_page=1`,
    { headers: ghHeaders },
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.total_count ?? 0;
}

async function getContributions(username) {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          totalCommitContributions
          totalRepositoryContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          contributionCalendar { totalContributions }
        }
      }
    }
  `;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: username } }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.errors) return null;
  return data.data?.user?.contributionsCollection ?? null;
}

async function getContributionCalendar(username) {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            months { name firstDay totalWeeks }
            weeks {
              contributionDays {
                color
                contributionCount
                date
                weekday
              }
            }
          }
        }
      }
    }
  `;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: username } }),
  });
  if (!res.ok) {
    logger.error(`[grass] GraphQL HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  if (data.errors) {
    logger.error(`[grass] GraphQL errors: ${JSON.stringify(data.errors)}`);
    return null;
  }
  const cal = data.data?.user?.contributionsCollection?.contributionCalendar ?? null;
  if (!cal) logger.error('[grass] calendar null — user 없거나 토큰 권한 부족');
  return cal;
}

async function renderGrassImage(username, calendar) {
  const { weeks, months = [], totalContributions } = calendar;

  const CELL = 11, GAP = 3;
  const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const weekHtml = weeks.map(week => {
    const dayMap = {};
    week.contributionDays.forEach(d => { dayMap[d.weekday] = d; });
    const cells = Array.from({ length: 7 }, (_, i) => {
      const day = dayMap[i];
      if (!day) return `<div class="day"></div>`;
      return `<div class="day" style="background:${day.color}" title="${day.date}: ${day.contributionCount}개"></div>`;
    });
    return `<div class="week">${cells.join('')}</div>`;
  }).join('');

  const monthHtml = (() => {
    let col = 0;
    return months.map(m => {
      const left = col * (CELL + GAP);
      col += m.totalWeeks;
      return `<span style="position:absolute;left:${left}px">${m.name}</span>`;
    }).join('');
  })();

  const dayLabelHtml = DAYS.map((d, i) =>
    (i % 2 === 1) ? `<div class="dl">${d}</div>` : `<div class="dl"></div>`
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#161b22;padding:20px 24px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:inline-block}
    h4{color:#e6edf3;font-size:13px;font-weight:600;margin-bottom:14px}
    .months{position:relative;height:16px;margin-left:26px;color:#7d8590;font-size:11px;margin-bottom:4px}
    .graph{display:flex;gap:4px}
    .day-labels{display:flex;flex-direction:column;gap:${GAP}px;margin-right:4px;margin-top:1px}
    .dl{width:12px;height:${CELL}px;color:#7d8590;font-size:9px;line-height:${CELL}px;text-align:right}
    .grid{display:flex;gap:${GAP}px}
    .week{display:flex;flex-direction:column;gap:${GAP}px}
    .day{width:${CELL}px;height:${CELL}px;border-radius:2px;background:#21262d}
    .legend{display:flex;align-items:center;gap:4px;margin-top:10px;justify-content:flex-end;color:#7d8590;font-size:11px}
    .lc{width:${CELL}px;height:${CELL}px;border-radius:2px}
    p{color:#7d8590;font-size:11px;margin-top:8px}
  </style></head><body>
    <h4>@${username} · GitHub 잔디</h4>
    <div class="months">${monthHtml}</div>
    <div class="graph">
      <div class="day-labels">${dayLabelHtml}</div>
      <div class="grid">${weekHtml}</div>
    </div>
    <div class="legend">
      <span>적음</span>
      <div class="lc" style="background:#21262d"></div>
      <div class="lc" style="background:#0e4429"></div>
      <div class="lc" style="background:#006d32"></div>
      <div class="lc" style="background:#26a641"></div>
      <div class="lc" style="background:#39d353"></div>
      <span>많음</span>
    </div>
    <p>총 ${totalContributions.toLocaleString()}개 기여 (최근 1년)</p>
  </body></html>`;

  const puppeteer = require('puppeteer');
  logger.info('[grass] puppeteer 실행 시작');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 400 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const { w, h } = await page.evaluate(() => ({
      w: document.body.scrollWidth,
      h: document.body.scrollHeight,
    }));
    logger.info(`[grass] content size: ${w}x${h}`);

    const raw = await page.screenshot({
      clip: { x: 0, y: 0, width: w, height: h },
      type: 'png',
    });
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    logger.info(`[grass] 이미지 생성 완료: ${buffer.length} bytes`);
    return buffer;
  } finally {
    await browser.close();
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('깃허브')
    .setDescription('GitHub 유저 정보를 조회합니다.')
    .addSubcommand((sub) =>
      sub
        .setName('유저')
        .setDescription('GitHub 유저 프로필 및 기여도 조회')
        .addStringOption((opt) =>
          opt
            .setName('username')
            .setDescription('조회할 GitHub 사용자명')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('잔디')
        .setDescription('GitHub 기여 그래프(잔디) 조회')
        .addStringOption((opt) =>
          opt
            .setName('username')
            .setDescription('조회할 GitHub 사용자명')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const username = interaction.options.getString('username');

    logger.info(`subcommand: ${subcommand}, username: ${username}`);

    if (!username) {
      await interaction.editReply('❌ 사용자명을 입력해주세요.');
      return;
    }

    try {
      if (subcommand === '잔디') {
        const [user, calendar] = await Promise.all([
          getUserInfo(username),
          getContributionCalendar(username),
        ]);

        if (!calendar) {
          await interaction.editReply('❌ 잔디 데이터를 가져올 수 없어요. GitHub 토큰을 확인해주세요.');
          return;
        }

        logger.info(`[grass] 렌더링 시작: ${username}`);
        let imageBuffer;
        try {
          imageBuffer = await renderGrassImage(username, calendar);
        } catch (renderErr) {
          logger.error(`[grass] 렌더링 실패: ${renderErr.message}`);
          logger.error(renderErr.stack);
          await interaction.editReply('❌ 잔디 이미지 생성에 실패했어요. 잠시 후 다시 시도해주세요.');
          return;
        }
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grass.png' });

        const embed = new EmbedBuilder()
          .setColor(0x2ea043)
          .setAuthor({
            name: user.name || user.login,
            iconURL: user.avatar_url,
            url: user.html_url,
          })
          .setTitle(`@${user.login} 의 GitHub 잔디`)
          .setURL(user.html_url)
          .addFields(
            { name: '🌱 총 기여도 (1년)', value: calendar.totalContributions.toLocaleString(), inline: true },
          )
          .setImage('attachment://grass.png')
          .setFooter({
            text: 'GitHub Contributions',
            iconURL: 'https://github.githubassets.com/favicons/favicon.png',
          })
          .setTimestamp();

        logger.info('잔디 embed 생성 완료');
        await interaction.editReply({ embeds: [embed], files: [attachment] });
        logger.info('잔디 editReply 완료');
        return;
      }

      const [user, stars, commits, issues, prs, contrib] = await Promise.all([
        getUserInfo(username),
        getTotalStars(username),
        getCommitCount(username),
        getIssueCount(username),
        getPRCount(username),
        getContributions(username),
      ]);

      // GraphQL 성공하면 정확한 값 사용, 실패하면 REST 근사값 사용
      const finalCommits = contrib?.totalCommitContributions ?? commits;
      const finalPushes = contrib?.totalRepositoryContributions ?? null;
      const finalIssues = contrib?.totalIssueContributions ?? issues;
      const finalPRs = contrib?.totalPullRequestContributions ?? prs;
      const finalReviews = contrib?.totalPullRequestReviewContributions ?? null;
      const finalTotal = contrib?.contributionCalendar?.totalContributions ?? (commits + issues + prs);

      const grassUrl = `https://ghchart.rshah.org/${username}`;

      const descLines = [];
      if (user.bio) descLines.push(`> ${user.bio}`, '');

      const metaItems = [
        user.company          ? `🏢 ${user.company.replace(/^@/, '')}` : null,
        user.location         ? `📍 ${user.location}`                  : null,
        user.blog             ? `🔗 ${user.blog}`                      : null,
        user.twitter_username ? `🐦 @${user.twitter_username}`         : null,
      ].filter(Boolean);
      if (metaItems.length) descLines.push(metaItems.join('  ·  '));

      const embed = new EmbedBuilder()
        .setColor(0x2ea043)
        .setAuthor({
          name: user.name ? `${user.name}  (${user.login})` : user.login,
          iconURL: user.avatar_url,
          url: user.html_url,
        })
        .setThumbnail(user.avatar_url)
        .setTitle(`@${user.login} 의 GitHub 프로필`)
        .setURL(user.html_url)
        .setDescription(descLines.join('\n') || null)
        .addFields(
          // 프로필 통계 — 3열 그리드
          { name: '⭐ 받은 별',  value: stars.toLocaleString(),              inline: true },
          { name: '📁 레포',     value: user.public_repos.toLocaleString(),  inline: true },
          { name: '📅 가입일',   value: user.created_at.slice(0, 10),        inline: true },
          { name: '👥 팔로워',   value: user.followers.toLocaleString(),     inline: true },
          { name: '➡️ 팔로윙',   value: user.following.toLocaleString(),     inline: true },
          { name: '​',      value: '​',                            inline: true },
          // 구분선
          { name: '​', value: '​', inline: false },
          // 기여도 통계 — 3열 그리드
          { name: '📊 총 기여도', value: `**${finalTotal.toLocaleString()}** 개`,   inline: true },
          { name: '💬 커밋',      value: `**${finalCommits.toLocaleString()}** 개`, inline: true },
          { name: '🐛 이슈',      value: `**${finalIssues.toLocaleString()}** 개`,  inline: true },
          { name: '🔀 PR',        value: `**${finalPRs.toLocaleString()}** 개`,     inline: true },
          { name: '📤 푸시',      value: finalPushes  !== null ? `**${finalPushes.toLocaleString()}** 개`  : '`—`', inline: true },
          { name: '👁️ 코드 리뷰', value: finalReviews !== null ? `**${finalReviews.toLocaleString()}** 개` : '`—`', inline: true },
        )
        .setImage(grassUrl)
        .setFooter({
          text: contrib
            ? 'GitHub Profile'
            : 'GitHub Profile  •  커밋/이슈/PR은 검색 API 기반 근사값',
          iconURL: 'https://github.githubassets.com/favicons/favicon.png',
        })
        .setTimestamp();

      logger.info('embed 생성 완료');
      await interaction.editReply({ embeds: [embed] });
      logger.info('editReply 완료');

    } catch (err) {
      logger.error(`에러 발생: ${err.message}`);
      logger.error(err.stack);
      await interaction.editReply(`❌ ${err.message}`);
    }
  },
};