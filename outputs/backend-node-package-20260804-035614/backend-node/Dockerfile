FROM node:22-alpine

WORKDIR /app

# 依赖安装
COPY package*.json ./
RUN npm ci --omit=dev

# 源码
COPY dist/ ./dist/

EXPOSE 13030

CMD ["node", "dist/main.js"]
