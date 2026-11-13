FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3200 DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3200
CMD ["node", "src/server.js"]
