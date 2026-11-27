FROM node:20-bookworm-slim

WORKDIR /app

# ffmpeg turns voice replies into real WhatsApp voice notes (optional, the bot works without it)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY assets ./assets
COPY MENU.js ./MENU.js
COPY .env.example ./.env.example

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data/auth_info
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["npm", "start"]
