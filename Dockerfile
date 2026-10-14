# ---------- build the React client ----------
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --include-workspace-root=false
COPY client client
RUN npm run build -w client

# ---------- API + static client ----------
FROM node:22-alpine
ENV NODE_ENV=production TZ=Asia/Kolkata PORT=4000
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false --omit=dev && npm cache clean --force
COPY server server
COPY scripts/docker-entrypoint.sh scripts/
COPY --from=web /app/client/dist client/dist
RUN mkdir -p server/uploads && chmod +x scripts/docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
