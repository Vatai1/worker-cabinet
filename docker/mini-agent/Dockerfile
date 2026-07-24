FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask requests openai

WORKDIR /app
COPY docker/mini-agent/agent.py docker/mini-agent/start.sh ./
RUN chmod +x start.sh

EXPOSE 8642
ENTRYPOINT ["./start.sh"]
