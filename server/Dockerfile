# mediasoup needs a Linux/macOS host (its worker is native C++; no Windows).
# This image runs the SFU on Linux regardless of your dev OS.
FROM node:20-bookworm

# Build deps in case mediasoup compiles its worker from source (a prebuilt
# binary is used when available for the platform).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip build-essential \
  && rm -rf /var/lib/apt/lists/*
ENV PIP_BREAK_SYSTEM_PACKAGES=1

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=4000
EXPOSE 4000
# RTC media port range (keep in sync with RTC_MIN_PORT/RTC_MAX_PORT).
EXPOSE 40000-40100/udp

CMD ["node", "index.js"]
