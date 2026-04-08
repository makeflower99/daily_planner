FROM node:20-alpine

# better-sqlite3 네이티브 빌드에 필요한 도구
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
