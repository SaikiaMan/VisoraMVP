# --- Build stage ---
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Runtime stage ---
FROM node:20-alpine

WORKDIR /app

# Security: run as non-root user
RUN addgroup -S visora && adduser -S visora -G visora

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove files that should not be in the image
RUN rm -f .env push_error.txt push_error_utf8.txt test-query.js

USER visora

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "index.js"]
