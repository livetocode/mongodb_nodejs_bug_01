FROM python:3.10-slim-bullseye

WORKDIR /mtl/app

COPY requirements.txt /mtl/app/

RUN pip3 install -r requirements.txt

COPY main.py /mtl/app/

CMD ["python3", "-u", "main.py"]
