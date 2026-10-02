FROM node:20-alpine
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY frontend /app/frontend
COPY database /app/database

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
