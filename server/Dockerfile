# 문서→PDF 변환 서버 (LibreOffice headless + 한글 폰트)
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-impress libreoffice-writer libreoffice-calc \
      fonts-nanum fonts-noto-cjk \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV SOFFICE_BIN=/usr/bin/soffice
ENV PORT=8080
WORKDIR /app
COPY convert.mjs .
EXPOSE 8080
CMD ["node", "convert.mjs"]
