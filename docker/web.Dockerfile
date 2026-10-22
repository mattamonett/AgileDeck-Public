# Dockerfile.web
FROM node:25-bookworm-slim AS builder

WORKDIR /app

# Copy lock files and package.jsons
COPY package*.json ./
COPY web/package*.json ./web/
COPY shared/package*.json ./shared/
COPY api/package*.json ./api/

# Install dependencies
RUN npm ci --workspace web --workspace shared --include-workspace-root=false --no-audit --no-fund

# Copy source code
COPY tsconfig.base.json ./
COPY web ./web
COPY shared ./shared

# Build shared library
RUN npm run build -w shared

# Replace built-in branding with any files from config/branding. Only these
# names are accepted, so a misspelled file stops the build instead of being ignored.
COPY config/branding /tmp/branding
RUN allowed="apple-touch-icon.png favicon-48x48.png favicon.ico favicon.png icon-192.png icon-512.png manifest.webmanifest og-image.png robots.txt"; \
    for file in /tmp/branding/*; do \
      name="$(basename "$file")"; \
      [ "$name" = "README.md" ] && continue; \
      case " $allowed " in \
        *" $name "*) cp "$file" "/app/web/public/$name" && echo "Branding: using $name" ;; \
        *) echo "config/branding/$name is not a replaceable file. Use one of: $allowed" >&2; exit 1 ;; \
      esac; \
    done

# Build Web app
ARG BUILD_TIME
RUN echo "{\"version\": \"$BUILD_TIME\"}" > /app/web/public/version.json
RUN npm run build -w web -- --configuration production

# Precompress text assets once at build time; keep originals for other clients.
RUN find /app/web/dist/poker-web/browser -type f \
    \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' \) \
    -size +1023c -exec gzip -9 -n -k {} +

# Production image - using unprivileged Nginx for security
FROM nginxinc/nginx-unprivileged:1.30-alpine

# Copy build artifacts to Nginx
COPY --from=builder /app/web/dist/poker-web/browser /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Validate configuration and gzip_static module support during the image build.
RUN nginx -t

USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
