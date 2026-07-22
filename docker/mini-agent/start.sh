#!/bin/sh
ollama serve &
sleep 2
exec python agent.py
