# Telegram Bot Integration

## Setup Instructions

### 1. Create Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Choose a name for your bot (e.g., "Worker Cabinet Bot")
4. Choose a username for your bot (must end in 'bot', e.g., "worker_cabinet_bot")
5. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Configure Environment Variables

Add the following variables to your `.env` file:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_BOT_USERNAME=@your_bot_username
TELEGRAM_ADMIN_CHAT_ID=admin_telegram_chat_id_here
```

To get your admin chat ID:
1. Create a simple bot or use an existing one
2. Start a chat with your bot
3. Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find your `chat_id` in the response

### 3. Run Migration

```bash
cd backend
npm run migrate
```

Or run the specific Telegram migration:

```bash
cd backend
node src/db/migrate-add-telegram.js
```

### 4. User Connection Flow

1. User goes to Settings page in the app
2. User enters their Telegram username (e.g., `@john_doe`)
3. User clicks "Connect Telegram"
4. User opens the bot in Telegram and sends `/start` command
5. Backend links the user's account with their Telegram chat ID
6. User can now enable/disable Telegram notifications

### 5. Available Notifications

The bot sends notifications for:
- New vacation request (to manager)
- Vacation request approved (to employee)
- Vacation request rejected (to employee)
- Vacation request cancelled (to employee)

### 6. Testing

To test the bot:

```bash
cd backend
npm run test:telegram
```

### 7. Troubleshooting

#### Bot not responding:
- Check that `TELEGRAM_BOT_TOKEN` is correct in `.env`
- Ensure the bot is started with `/start` command

#### Notifications not sending:
- Check that user has connected their Telegram account
- Verify `telegram_notifications_enabled` is `true` for the user
- Check server logs for error messages

#### Connection issues:
- Ensure the bot username is correct (starts with `@`)
- Make sure user has started the bot with `/start`
