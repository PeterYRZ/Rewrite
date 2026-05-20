# Multi-stage Dockerfile for Paragraph Rewriter
# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Final image
FROM python:3.14-slim

WORKDIR /app

# Install uv for dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Copy Python project files
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen

# Copy application source
COPY src/ ./src/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/web/dist/ ./web/dist/

# Copy example config files (user must mount real ones)
COPY config.yaml.example users.json.example ./

# Expose the backend port
EXPOSE 8000

# Serve both the API and the static frontend (port read from config.yaml)
CMD ["uv", "run", "rewrite-server"]
