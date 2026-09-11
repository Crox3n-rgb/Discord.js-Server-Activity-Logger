# Discord Audit Log Bot

An open-source Discord.js v14 bot that sends server audit and moderation events to a configured log channel as embeds.

## Features

- `/ping`: Shows the bot latency.
- `/setlog <channel>`: Sets the log channel. Administrator only.
- `/logs`: Shows the current log channel. Administrator only.
- Logs member joins/leaves, message deletes/edits, bans, roles, channels, and voice state changes.
- Stores per-server settings in `data/config.json`; the directory is created automatically.
- Handles partial Discord data and API/fetch failures safely.
- Ignores messages sent by the bot itself.

## Setup

Node.js 18.17 or newer is required.

```bash
npm install
copy .env.example .env
npm start
```

Set `DISCORD_TOKEN` to your bot token and `CLIENT_ID` to your application's Application ID in `.env`. Never commit or log your token.

## Discord Developer Portal

When adding the bot to a server, select the `bot` and `applications.commands` scopes. Required intents:

- `Guilds`
- `GuildMembers` (privileged intent for member join/leave events; enable it in the Developer Portal)
- `GuildMessages`
- `GuildVoiceStates`
- `MessageContent` is not required; message content is never collected.

Required permissions: `View Channels`, `Send Messages`, `Embed Links`, and `Read Message History`. The bot does not need the `Administrator` permission. The `/setlog` and `/logs` commands are restricted to server administrators.

Commands are registered for each server when the bot becomes ready. The bot needs write access to the project directory because `data/config.json` is updated at runtime.

## Privacy and Operations

Message content is not stored. For deleted or edited messages, the bot reports only the channel, author, and event timestamp. In production, define a backup and retention policy for `data/config.json`. Temporary Discord API failures are logged to the console and do not stop the bot.

## License

MIT. See the `LICENSE` file for details.
