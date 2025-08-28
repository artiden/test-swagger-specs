#!/bin/bash

URL="http://localhost:8888/my.tag"

while true; do
  EVENT="test_event_$(date +%s)"
  USER_ID=$(openssl rand -hex 6)
  EXTRA="Message $(date '+%Y-%m-%d %H:%M:%S')"

  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"$EVENT\",\"userId\":\"$USER_ID\",\"casino\":\"whow\",\"extra\":\"$EXTRA\"}" \
    "$URL"

  echo "Send event: $EVENT"
  sleep 2
done
