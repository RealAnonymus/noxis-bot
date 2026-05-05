const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, Collection
} = require('discord.js');
const express = require('express');
const cors    = require('cors');

// ── Express API ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

// ── Discord Client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const RES_CHANNEL_ID   = '1485778322293002341';
const APPLY_CHANNEL_ID = '1485778336977522800';
const GUILD_ID         = '1485766931477958678';
const UNIT_ROLE_ID     = '1485772106254913748';
const JUDGE_ROLE_NAME  = 'Judge';
const COOLDOWN_HOURS   = 2;

const appCount    = { value: 0 };
const cooldowns   = new Collection();
const pendingApps = new Collection();

// ── Cached members for API ────────────────────────────────────────────────────
let cachedMembers = [];
let lastUpdated   = null;

async function fetchAndCacheMembers() {
  try {
    const guild   = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    cachedMembers = members
      .filter(m => !m.user.bot)
      .map(m => {
        const topRole = m.roles.cache
          .filter(r => r.name !== '@everyone')
          .sort((a, b) => b.position - a.position)
          .first();

        const presence = m.presence;
        let status = 'offline';
        if (presence) status = presence.status;

        return {
          id:           m.user.id,
          username:     m.user.username,
          display_name: m.displayName,
          avatar:       m.user.avatar,
          topRole:      topRole ? topRole.name : 'Member',
          roleColor:    topRole ? topRole.hexColor : '#6a6560',
          isUnit:       m.roles.cache.has(UNIT_ROLE_ID),
          status,
          joined_at:    m.joinedAt,
        };
      })
      .sort((a, b) => {
        const order = ['Owner', 'Staff', 'Noxis Member', 'Member'];
        const ai = order.findIndex(r => a.topRole.includes(r));
        const bi = order.findIndex(r => b.topRole.includes(r));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

    lastUpdated = new Date().toISOString();
    console.log(`✅ Cached ${cachedMembers.length} members`);
  } catch (e) {
    console.error('❌ Member fetch error:', e.message);
  }
}

// ── API Routes ────────────────────────────────────────────────────────────────
app.get('/api/members', (req, res) => {
  res.json({
    members:      cachedMembers,
    total:        cachedMembers.length,
    online:       cachedMembers.filter(m => ['online','idle','dnd'].includes(m.status)).length,
    unit:         cachedMembers.filter(m => m.isUnit).length,
    last_updated: lastUpdated,
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', members: cachedMembers.length }));

app.listen(PORT, () => console.log(`🚀 API on port ${PORT}`));

// ── Helpers ───────────────────────────────────────────────────────────────────
function isJudge(member) {
  return member.roles.cache.some(r => r.name === JUDGE_ROLE_NAME) ||
         member.permissions.has(PermissionFlagsBits.ManageGuild);
}
function stamp() {
  return new Date().toLocaleString('en-GB', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

// ── READY ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ NOXIS BOT online as ${client.user.tag}`);

  // Fetch members for API
  await fetchAndCacheMembers();
  setInterval(fetchAndCacheMembers, 2 * 60 * 1000); // refresh every 2 min

  // Send apply embed
  try {
    const ch = await client.channels.fetch(APPLY_CHANNEL_ID);
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    for (const m of msgs.values()) {
      if (m.author.id === client.user.id) await m.delete().catch(() => {});
    }
    const embed = new EmbedBuilder()
      .setColor(0xff1a2e)
      .setTitle('NOXIS  —  Unit Applications')
      .setDescription(
        '```\n' +
        '  ┌─────────────────────────────────┐\n' +
        '  │   APPLYING TO BE A NOXIS MEMBER │\n' +
        '  └─────────────────────────────────┘\n' +
        '```\n' +
        '> 🎬  Edit must be **minimum 6 seconds** long\n' +
        '> 🔁  Loops do **not** count\n' +
        '> 📅  The edit must not be **older than a month**\n' +
        '> 🚫  No **Heavy IBs** allowed\n\n' +
        '**Make sure you meet all requirements before applying.**\n' +
        'Press the button below when you are ready.'
      )
      .setFooter({ text: 'NOXIS Editing Unit  •  Applications' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_apply')
        .setLabel('Apply Now')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('📝')
    );
    await ch.send({ embeds: [embed], components: [row] });
    console.log('✅ Apply embed sent.');
  } catch (e) {
    console.error('❌ Apply embed error:', e.message);
  }
});

// ── INTERACTIONS ──────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // Open modal
  if (interaction.isButton() && interaction.customId === 'open_apply') {
    const userId = interaction.user.id;

    if (cooldowns.has(userId)) {
      const elapsed   = (Date.now() - cooldowns.get(userId)) / 1000 / 3600;
      const remaining = Math.ceil(COOLDOWN_HOURS - elapsed);
      if (elapsed < COOLDOWN_HOURS) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('⏳  Cooldown Active')
            .setDescription(`You were recently denied. You can reapply in **${remaining} hour(s)**.\n\nUse this time to improve your edits.`)
            .setFooter({ text: 'NOXIS Editing Unit' })
          ], ephemeral: true
        });
      } else { cooldowns.delete(userId); }
    }

    if (pendingApps.has(userId)) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('⚠️  Application Pending')
          .setDescription('You already have an open application being reviewed.\n\nPlease wait for the staff to make a decision.')
          .setFooter({ text: 'NOXIS Editing Unit' })
        ], ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('apply_modal')
      .setTitle('NOXIS — Unit Application');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_link')
          .setLabel('1. Send your edit (TikTok / Streamable / YT)')
          .setStyle(TextInputStyle.Short).setPlaceholder('https://...').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('proof')
          .setLabel('2. Proof that the edit is yours')
          .setStyle(TextInputStyle.Paragraph).setPlaceholder('Screenshot of editing process, WIP...').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('socials')
          .setLabel('3. Your socials (TikTok / YouTube)')
          .setStyle(TextInputStyle.Short).setPlaceholder('@yourname on TikTok, youtube.com/...').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('active')
          .setLabel('4. Will you be active in this community?')
          .setStyle(TextInputStyle.Short).setPlaceholder('Yes / No').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('criticism')
          .setLabel('5. Do you accept criticism on your edits?')
          .setStyle(TextInputStyle.Short).setPlaceholder('Yes / No').setRequired(true)
      ),
    );
    await interaction.showModal(modal);
  }

  // Modal submitted
  if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
    await interaction.deferReply({ ephemeral: true });
    appCount.value++;

    const editLink  = interaction.fields.getTextInputValue('edit_link');
    const proof     = interaction.fields.getTextInputValue('proof');
    const socials   = interaction.fields.getTextInputValue('socials');
    const active    = interaction.fields.getTextInputValue('active');
    const criticism = interaction.fields.getTextInputValue('criticism');

    const applicant = interaction.user;
    const guild     = interaction.guild;
    const judgeRole = guild.roles.cache.find(r => r.name === JUDGE_ROLE_NAME);

    pendingApps.set(applicant.id, true);

    const embed = new EmbedBuilder()
      .setColor(0xff1a2e)
      .setAuthor({ name: applicant.username, iconURL: applicant.displayAvatarURL({ dynamic: true }) })
      .setTitle(`Unit app (#${appCount.value})`)
      .addFields(
        { name: '🎬  Edit Link',              value: editLink  },
        { name: '🔍  Proof that it is yours', value: proof     },
        { name: '📱  Socials',                value: socials   },
        { name: '⚡  Active in community?',   value: active    },
        { name: '💬  Accepts criticism?',     value: criticism },
      )
      .setFooter({ text: `User ID: ${applicant.id}  •  ${stamp()}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${applicant.id}`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`deny_${applicant.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('❌'),
    );

    const resCh = guild.channels.cache.get(RES_CHANNEL_ID);
    if (resCh) {
      const ping = judgeRole ? `<@&${judgeRole.id}>` : '@Judge';
      await resCh.send({ content: ping, embeds: [embed], components: [row] });
    }

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xff1a2e)
        .setTitle('✅  Application Submitted')
        .setDescription('Your application has been sent to the staff.\n\nSit tight — we will review it and get back to you via DM.')
        .setFooter({ text: 'NOXIS Editing Unit' })
      ]
    });
  }

  // Accept
  if (interaction.isButton() && interaction.customId.startsWith('accept_')) {
    if (!isJudge(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌  Only **Judges** can accept or deny applications.')],
        ephemeral: true
      });
    }
    const targetId = interaction.customId.replace('accept_', '');
    pendingApps.delete(targetId);
    cooldowns.delete(targetId);

    const orig = interaction.message;
    await interaction.update({
      embeds: [EmbedBuilder.from(orig.embeds[0]).setColor(0x57f287).setTitle(orig.embeds[0].title + '  —  ✅ ACCEPTED')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('done').setLabel(`Accepted by ${interaction.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true)
      )]
    });

    try {
      const member = await interaction.guild.members.fetch(targetId);
      const memberRole = interaction.guild.roles.cache.get(UNIT_ROLE_ID);
      if (memberRole) await member.roles.add(memberRole).catch(() => {});
      await member.send({
        embeds: [new EmbedBuilder()
          .setColor(0xff1a2e)
          .setTitle('🔴  NOXIS — Application Result')
          .setDescription('```\n  ✅  YOUR APPLICATION WAS ACCEPTED\n```\nWelcome to **Noxis Editing Unit**.\n\nYou now have the **Noxis Member** role.\nMake us proud — every frame counts.')
          .setFooter({ text: 'NOXIS Editing Unit' })
          .setTimestamp()
        ]
      });
      // Refresh member cache after role change
      setTimeout(fetchAndCacheMembers, 3000);
    } catch (_) {}
  }

  // Deny
  if (interaction.isButton() && interaction.customId.startsWith('deny_')) {
    if (!isJudge(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌  Only **Judges** can accept or deny applications.')],
        ephemeral: true
      });
    }
    const targetId = interaction.customId.replace('deny_', '');
    pendingApps.delete(targetId);
    cooldowns.set(targetId, Date.now());

    const orig = interaction.message;
    await interaction.update({
      embeds: [EmbedBuilder.from(orig.embeds[0]).setColor(0xed4245).setTitle(orig.embeds[0].title + '  —  ❌ DENIED')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('done').setLabel(`Denied by ${interaction.user.username}`).setStyle(ButtonStyle.Danger).setDisabled(true)
      )]
    });

    try {
      const member = await interaction.guild.members.fetch(targetId);
      await member.send({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('NOXIS — Application Result')
          .setDescription(`\`\`\`\n  ❌  YOUR APPLICATION WAS DENIED\n\`\`\`\nYour application was not accepted this time.\n\nYou can reapply in **${COOLDOWN_HOURS} hours**.\nUse this time to work on your craft.`)
          .setFooter({ text: 'NOXIS Editing Unit  •  You can reapply later' })
          .setTimestamp()
        ]
      });
    } catch (_) {}
  }
});

client.login(process.env.DISCORD_TOKEN);
