FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py cloud_server.py ./
COPY templates/ ./templates/
COPY static/ ./static/
RUN mkdir -p data

CMD ["python", "cloud_server.py"]
