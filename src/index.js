require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function ensureConfigFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, '{}\n', 'utf8');
  }
}

function loadConfig() {
  ensureConfigFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Could not read config; using an empty config:', error.message);
    return {};
  }
}

function saveConfig(config) {
  ensureConfigFile();
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

const config = loadConfig();

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Shows the bot latency.'),
  new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Sets the server log channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel where logs will be sent.')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Shows the server log channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((command) => command.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
});

function displayUser(user) {
  return user ? `${user.tag || user.username || 'Unknown user'} (${user.id})` : 'Unknown user';
}

function displayChannel(channel) {
  return channel ? `<#${channel.id}> (${channel.id})` : 'Unknown channel';
}

function createEmbed(title, color, fields = []) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp()
    .addFields(fields.slice(0, 25));
}

async function sendLog(guild, embed) {
  const channelId = config[guild.id]?.logChannelId;
  if (!channelId) return;

  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !channel.send) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Could not send log (${guild.name}, ${guild.id}):`, error.message);
  }
}

async function fetchIfPartial(value) {
  if (!value) return null;
  if (!value.partial || typeof value.fetch !== 'function') return value;
  try {
    return await value.fetch();
  } catch (error) {
    return value;
  }
}

function isBotMessage(message) {
  return Boolean(message?.author?.bot);
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id), { body: commands });
      console.log(`Commands registered: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error(`Could not register commands (${guild.id}):`, error.message);
    }
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: `Pong! ${client.ws.ping} ms`, ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Administrator permission is required for this command.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'setlog') {
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased() || !channel.send) {
      await interaction.reply({ content: 'Please select a channel where messages can be sent.', ephemeral: true });
      return;
    }
    config[interaction.guild.id] = { logChannelId: channel.id };
    try {
      saveConfig(config);
      await interaction.reply({ content: `Log channel set to ${channel}.`, ephemeral: true });
    } catch (error) {
      console.error('Could not save config:', error.message);
      await interaction.reply({ content: 'Could not save settings; check file permissions.', ephemeral: true });
    }
    return;
  }

  if (interaction.commandName === 'logs') {
    const channelId = config[interaction.guild.id]?.logChannelId;
    await interaction.reply({
      content: channelId ? `Current log channel: <#${channelId}>` : 'No log channel has been configured for this server.',
      ephemeral: true,
    });
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  await sendLog(member.guild, createEmbed('Member joined', 0x57f287, [
    { name: 'Member', value: displayUser(member.user) },
  ]));
});

client.on(Events.GuildMemberRemove, async (member) => {
  await sendLog(member.guild, createEmbed('Member left', 0xed4245, [
    { name: 'Member', value: displayUser(member.user) },
  ]));
});

client.on(Events.MessageDelete, async (message) => {
  message = await fetchIfPartial(message);
  if (!message?.guild || isBotMessage(message)) return;
  await sendLog(message.guild, createEmbed('Message deleted', 0xed4245, [
    { name: 'Channel', value: displayChannel(message.channel) },
    { name: 'Author', value: displayUser(message.author) },
  ]));
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  oldMessage = await fetchIfPartial(oldMessage);
  newMessage = await fetchIfPartial(newMessage);
  const message = newMessage || oldMessage;
  if (!message?.guild || isBotMessage(message)) return;
  await sendLog(message.guild, createEmbed('Message edited', 0xfee75c, [
    { name: 'Channel', value: displayChannel(message.channel) },
    { name: 'Author', value: displayUser(message.author) },
  ]));
});

client.on(Events.GuildBanAdd, async (ban) => {
  await sendLog(ban.guild, createEmbed('Member banned', 0xed4245, [
    { name: 'Member', value: displayUser(ban.user) },
  ]));
});

client.on(Events.GuildBanRemove, async (ban) => {
  await sendLog(ban.guild, createEmbed('Member unbanned', 0x57f287, [
    { name: 'Member', value: displayUser(ban.user) },
  ]));
});

client.on(Events.RoleCreate, async (role) => {
  await sendLog(role.guild, createEmbed('Role created', 0x5865f2, [
    { name: 'Role', value: `${role.name} (${role.id})` },
  ]));
});

client.on(Events.RoleDelete, async (role) => {
  await sendLog(role.guild, createEmbed('Role deleted', 0xed4245, [
    { name: 'Role', value: `${role.name} (${role.id})` },
  ]));
});

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  await sendLog(channel.guild, createEmbed('Channel created', 0x57f287, [
    { name: 'Channel', value: displayChannel(channel) },
  ]));
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  await sendLog(channel.guild, createEmbed('Channel deleted', 0xed4245, [
    { name: 'Channel', value: displayChannel(channel) },
  ]));
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member || oldState.member;
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  if (!member?.guild || oldChannel?.id === newChannel?.id) return;
  const title = newChannel ? (oldChannel ? 'Voice channel changed' : 'Joined voice channel') : 'Left voice channel';
  await sendLog(member.guild, createEmbed(title, 0x5865f2, [
    { name: 'Member', value: displayUser(member.user) },
    { name: 'Previous channel', value: displayChannel(oldChannel) },
    { name: 'New channel', value: displayChannel(newChannel) },
  ]));
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('DISCORD_TOKEN and CLIENT_ID are required in .env.');
  process.exitCode = 1;
} else {
  ensureConfigFile();
  client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error('Discord login failed:', error.message);
    process.exitCode = 1;
  });
}
