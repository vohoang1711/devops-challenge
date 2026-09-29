FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
# Commit a package-lock.json and switch to `npm ci --omit=dev` for reproducible builds
RUN npm install --omit=dev

COPY src ./src

# Run as the image's built-in non-root user
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
