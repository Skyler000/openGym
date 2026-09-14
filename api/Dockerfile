FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
COPY lib ./lib
COPY routes ./routes
COPY scripts ./scripts
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
