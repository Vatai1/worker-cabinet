#!/bin/bash
set -e
mkdir -p deploy/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deploy/ssl/server.key \
  -out deploy/ssl/server.crt \
  -subj "/CN=localhost"
