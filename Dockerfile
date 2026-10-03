FROM node:20-alpine

# Install FFmpeg and required media tools
RUN apk update && \
    apk add --no-cache ffmpeg

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application source code
COPY . .

# Expose server port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
