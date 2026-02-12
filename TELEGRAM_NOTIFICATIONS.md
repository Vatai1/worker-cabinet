# Telegram Notifications

## Overview

The system sends Telegram notifications for various vacation request events. Users must first connect their Telegram account in Settings and enable notifications.

## Available Notifications

### 1. New Vacation Request (to Manager)
- **Trigger**: When an employee creates a vacation request
- **Recipient**: The employee's manager
- **Content**:
  - Employee name and position
  - Vacation dates
  - Comment (if provided)
  - Notification to review the request in the system

### 2. Vacation Approved (to Employee)
- **Trigger**: When a manager approves a vacation request
- **Recipient**: The employee who created the request
- **Content**:
  - Confirmation message
  - Approved vacation dates

### 3. Vacation Rejected (to Employee)
- **Trigger**: When a manager rejects a vacation request
- **Recipient**: The employee who created the request
- **Content**:
  - Rejection notice
  - Vacation dates
  - Rejection reason

### 4. Vacation Cancelled by Employee (to Employee)
- **Trigger**: When an employee cancels their own vacation request
- **Recipient**: The employee who cancelled the request
- **Content**:
  - Cancellation confirmation
  - Cancelled vacation dates

### 5. Vacation Cancelled by Manager (to Employee)
- **Trigger**: When a manager cancels an approved vacation request
- **Recipient**: The employee whose request was cancelled
- **Content**:
  - Cancellation notice
  - Cancelled vacation dates

## Notification Conditions

A Telegram notification is sent only if ALL of the following conditions are met:
1. User has connected their Telegram account (username entered and /start sent to bot)
2. User has enabled Telegram notifications in Settings
3. Telegram bot is configured and running

## How to Enable Notifications

1. Open the application
2. Navigate to "Настройки" (Settings)
3. Enable "Telegram-уведомления" toggle
4. Enter your Telegram username (e.g., `@john_doe`)
5. Click "Подключить Telegram"
6. Open Telegram and send `/start` to @lk_crct_bot

## Bot Commands

- `/start` - Connect your Telegram account to the system
- `/help` - Show help information

## Troubleshooting

### Not receiving notifications?
- Check that Telegram bot is running: `ps aux | grep telegram-bot`
- Check bot logs: `tail -f /path/to/backend/bot.log`
- Verify your Telegram username is correct (starts with @)
- Make sure you've sent `/start` to the bot
- Check that "Telegram-уведомления" is enabled in Settings
- Verify telegram_chat_id is set in database for your user
- Verify telegram_notifications_enabled is true in database

### Check database:
```sql
SELECT id, first_name, last_name, telegram_chat_id, telegram_username, telegram_notifications_enabled
FROM users
WHERE telegram_chat_id IS NOT NULL;
```

## Backend API Endpoints

### Get Bot Info
```
GET /api/telegram/bot-info
```

### Get User Status
```
GET /api/telegram/user-status
```

### Connect Telegram
```
POST /api/telegram/connect
Body: { telegramUsername: "@username" }
```

### Disconnect Telegram
```
POST /api/telegram/disconnect
```

### Toggle Notifications
```
POST /api/telegram/toggle-notifications
Body: { enabled: true/false }
```

## Technical Details

### Message Format
Messages use Markdown formatting with:
- Bold text for titles
- Emoji icons for quick recognition
- Structured information layout

### Error Handling
- Failed notifications are logged but don't block the main operation
- If bot is unavailable, notifications are silently skipped
- Invalid chat IDs don't throw errors

### Security
- All Telegram endpoints require authentication
- Bot token is stored in environment variables
- User Telegram data is stored securely in database
