-- Assistant tables for Worker Cabinet

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assistant sessions
CREATE TABLE IF NOT EXISTS assistant_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Новый чат',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user_id ON assistant_sessions(user_id);

-- Assistant messages
CREATE TABLE IF NOT EXISTS assistant_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_session_id ON assistant_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_id ON assistant_messages(user_id);

-- Default assistant settings (local llama.cpp)
INSERT INTO system_settings (key, value) VALUES
    ('assistant_api_url', 'http://llama:8080/v1/chat/completions'),
    ('assistant_api_key', 'local'),
    ('assistant_model', 'qwen3-8b'),
    ('assistant_system_prompt', 'Ты — кадровый ассистент. Помогай сотрудникам с вопросами о кадрах, отпусках, документах. Отвечай на русском языке.'),
    ('assistant_temperature', '0.7'),
    ('assistant_max_tokens', '2048'),
    ('assistant_history_limit', '20')
ON CONFLICT (key) DO NOTHING;
