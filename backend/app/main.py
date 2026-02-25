import os
import uuid
import json
import random
import redis.asyncio as redis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
r = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)

WORLD_PLAYERS_KEY = "world:players"

@app.get("/")
async def root():
    return {"message": "MMO server running"}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    session_id = str(uuid.uuid4())
    player_key = f"player:{session_id}"

    # プレイヤー初期化
    player_data = {
        "id": session_id,
        "x": random.randint(50, 300),
        "y": random.randint(50, 300),
        "hp": 100,
        "max_hp": 100,
        "coin": 0
    }

    await r.hset(player_key, mapping=player_data)
    await r.sadd(WORLD_PLAYERS_KEY, session_id)

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)

            if msg["type"] == "move":
                await r.hset(player_key, mapping={
                    "x": msg["x"],
                    "y": msg["y"]
                })

            # 全プレイヤー取得
            players = []
            ids = await r.smembers(WORLD_PLAYERS_KEY)
            for pid in ids:
                p = await r.hgetall(f"player:{pid}")
                if p:
                    players.append(p)

            await ws.send_text(json.dumps({
                "type": "world_update",
                "players": players
            }))

    except WebSocketDisconnect:
        await r.delete(player_key)
        await r.srem(WORLD_PLAYERS_KEY, session_id)