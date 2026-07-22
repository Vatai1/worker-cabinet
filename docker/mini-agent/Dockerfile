FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl zstd && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/install.sh | sh

RUN pip install --no-cache-dir flask requests openai

WORKDIR /app
COPY agent.py start.sh ./
RUN chmod +x start.sh

EXPOSE 8642
ENTRYPOINT ["./start.sh"]
