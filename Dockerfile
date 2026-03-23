FROM docker.io/library/node:22 AS builder
WORKDIR /app
COPY . .
COPY package*.json ./
RUN npm install
RUN npm run build

FROM docker.io/library/nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
