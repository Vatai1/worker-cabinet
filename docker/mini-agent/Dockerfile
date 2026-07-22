FROM python:3.12-slim
RUN pip install --no-cache-dir flask requests openai
WORKDIR /app
COPY agent.py .
EXPOSE 8642
ENTRYPOINT ["python", "agent.py"]
