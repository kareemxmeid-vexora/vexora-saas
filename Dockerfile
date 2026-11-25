FROM node:22
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000 DB_FILE=/data/vexora.db
RUN mkdir -p /data
EXPOSE 3000
CMD ["node","server.js"]
