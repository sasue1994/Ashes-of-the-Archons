# syntax=docker/dockerfile:1

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# GA4 Measurement ID (G-XXXXXXX) ฝังตอน build ถ้าว่าง = ปิด analytics
ARG VITE_GA_ID=""
ENV VITE_GA_ID=$VITE_GA_ID
RUN npm run build

# ---- runtime ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:$PORT/healthz" || exit 1
CMD ["node", "server/index.mjs"]
