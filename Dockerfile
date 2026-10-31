FROM node:20-bookworm
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv
WORKDIR /app
COPY . .
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install -r pipelines/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"
RUN npm install && npm run build
CMD ["npm", "start"]
