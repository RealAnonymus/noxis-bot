const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ]
});

const RES_CHANNEL_ID   = '1485778322293002341';
const APPLY_CHANNEL_ID = '1485778336977522800';
const JUDGE_ROLE_NAME  = 'Judge';

let appCount = 0;

// ── READY — auto-send apply embed ────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Noxis Bot online as ${client.user.tag}`);

  try {
    const applyChannel = await client.channels.fetch(APPLY_CHANNEL_ID);
    if (!applyChannel) return;

    // Delete old bot messages so there is no duplicate
    const msgs = await applyChannel.messages.fetch({ limit: 20 });
    for (const msg of msgs.values()) {
      if (msg.author.id === client.user.id) await msg.delete().catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor(0xff1a2e)
      .setTitle('🔴  NOXIS — Unit Applications')
      .setDescription(
        '**Applying to be a Noxis member**\n\n' +
        'Read the rules below before applying.\n\n' +
        '📌 **APPLICATION RULES:**\n' +
        '> Edit must be minimum **6 seconds** long\n' +
        '> Loops do **not** count\n' +
        '> Edit must be less than **1 month** old\n' +
        '> No Heavy IBs allowed\n\n' +
        'When you are ready, press the button below.'
      )
      .setFooter({ text: 'Noxis Editing Unit' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_apply')
        .setLabel('Apply Now')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('📝')
    );

    await applyChannel.send({ embeds: [embed], components: [row] });
    console.log('✅ Apply embed sent.');
  } catch (err) {
    console.error('❌ Could not send apply embed:', err.message);
  }
});

// ── INTERACTIONS ──────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // Button: open modal
  if (interaction.isButton() && interaction.customId === 'open_apply') {
    const modal = new ModalBuilder()
      .setCustomId('apply_modal')
      .setTitle('Noxis — Unit Application');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('edit_link')
          .setLabel('1. Send your edit (TikTok / Streamable / YT)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://...')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('proof')
          .setLabel('2. Proof that the edit is yours')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Screenshot of editing process, WIP, etc.')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('socials')
          .setLabel('3. Your socials (TikTok / YouTube)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('@yourname on TikTok, youtube.com/...')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('active')
          .setLabel('4. Will you be active in this community?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Yes / No')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('criticism')
          .setLabel('5. Do you accept criticism on your edits?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Yes / No')
          .setRequired(true)
      ),
    );

    await interaction.showModal(modal);
  }

  // Modal submitted
  if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
    await interaction.deferReply({ ephemeral: true });

    appCount++;

    const editLink  = interaction.fields.getTextInputValue('edit_link');
    const proof     = interaction.fields.getTextInputValue('proof');
    const socials   = interaction.fields.getTextInputValue('socials');
    const active    = interaction.fields.getTextInputValue('active');
    const criticism = interaction.fields.getTextInputValue('criticism');

    const applicant = interaction.user;
    const guild     = interaction.guild;
    const judgeRole = guild.roles.cache.find(r => r.name === JUDGE_ROLE_NAME);

    const date = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const embed = new EmbedBuilder()
      .setColor(0xff1a2e)
      .setAuthor({
        name: applicant.username,
        iconURL: applicant.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(`Unit app (#${appCount})`)
      .addFields(
        { name: '1. Send edit (TikTok/Streamable)', value: editLink },
        { name: '2. Proof that is yours',           value: proof    },
        { name: '3. Socials (TikTok/Yt)',           value: socials  },
        { name: '4. Will you be active?',           value: active   },
        { name: '5. Would you like to receive criticism?', value: criticism },
      )
      .setFooter({ text: `User ID: ${applicant.id}  •  ${date}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${applicant.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`deny_${applicant.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    );

    const resChannel = guild.channels.cache.get(RES_CHANNEL_ID);
    if (resChannel) {
      const ping = judgeRole ? `<@&${judgeRole.id}>` : '@Judge';
      await resChannel.send({ content: ping, embeds: [embed], components: [row] });
    }

    await interaction.editReply({ content: '✅ Application submitted! Staff will review it soon.' });
  }

  // Accept button
  if (interaction.isButton() && interaction.customId.startsWith('accept_')) {
    const targetId = interaction.customId.replace('accept_', '');
    const judge    = interaction.member;

    if (!judge.roles.cache.some(r => r.name === JUDGE_ROLE_NAME) && !judge.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Only Judges can do this.', ephemeral: true });
    }

    const original     = interaction.message;
    const updatedEmbed = EmbedBuilder.from(original.embeds[0])
      .setColor(0x57f287)
      .setTitle(original.embeds[0].title + '  ✅  ACCEPTED');

    await interaction.update({
      embeds: [updatedEmbed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('done').setLabel(`Accepted by ${judge.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true)
      )]
    });

    try {
      const member = await interaction.guild.members.fetch(targetId);
      await member.send({
        embeds: [new EmbedBuilder()
          .setColor(0xff1a2e)
          .setTitle('🔴  Noxis — Application Result')
          .setDescription('Your application to **Noxis Editing Unit** has been **accepted**.\n\nWelcome to the unit. Make us proud.')
          .setFooter({ text: 'Noxis Editing Unit' })
        ]
      });
    } catch (_) {}
  }

  // Deny button
  if (interaction.isButton() && interaction.customId.startsWith('deny_')) {
    const targetId = interaction.customId.replace('deny_', '');
    const judge    = interaction.member;

    if (!judge.roles.cache.some(r => r.name === JUDGE_ROLE_NAME) && !judge.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Only Judges can do this.', ephemeral: true });
    }

    const original     = interaction.message;
    const updatedEmbed = EmbedBuilder.from(original.embeds[0])
      .setColor(0xed4245)
      .setTitle(original.embeds[0].title + '  ❌  DENIED');

    await interaction.update({
      embeds: [updatedEmbed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('done').setLabel(`Denied by ${judge.user.username}`).setStyle(ButtonStyle.Danger).setDisabled(true)
      )]
    });

    try {
      const member = await interaction.guild.members.fetch(targetId);
      await member.send({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('Noxis — Application Result')
          .setDescription('Your application to **Noxis Editing Unit** has been **denied** this time.\n\nKeep grinding and try again later.')
          .setFooter({ text: 'Noxis Editing Unit' })
        ]
      });
    } catch (_) {}
  }
});

client.login(process.env.DISCORD_TOKEN);
