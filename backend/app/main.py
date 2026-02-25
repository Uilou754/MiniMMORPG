# 標準ライブラリ
import os       # 環境変数の取得
import uuid     # 一意なID生成（プレイヤー識別用）
import json     # WebSocketで送受信するJSONの変換
import random   # 初期座標のランダム生成
import asyncio  # 非同期処理（gatherやsleep）

# Redisの非同期クライアント
import redis.asyncio as redis

# FastAPIとWebSocket関連
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

# FastAPIアプリケーション生成
app = FastAPI()

# 環境変数からRedisホストを取得（Docker想定）
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
# Redis接続（decode_responses=Trueで文字列として取得）
r = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)

# ワールドに存在するプレイヤーID一覧を保存するSetキー
WORLD_PLAYERS_KEY = "world:players"

# 動作確認用エンドポイント
@app.get("/")
async def root():
    return {"message": "MMO server running"}

# WebSocket接続エンドポイント
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    # WebSocket接続を受け入れる
    await ws.accept()

    # 各接続ごとに一意なセッションIDを生成
    session_id = str(uuid.uuid4())
    # 各プレイヤーのRedisキー
    player_key = f"player:{session_id}"

    # ===== プレイヤー初期データ生成 =====
    player_data = {
        "id": session_id,
        # 初期スポーン位置（ランダム）
        "x": random.randint(50, 300),
        "y": random.randint(50, 300),
        "hp": 100,
        "max_hp": 100,
        "coin": 0
    }

    # RedisにプレイヤーデータをHashとして保存
    await r.hset(player_key, mapping=player_data)
    # ワールド参加者Setに追加
    await r.sadd(WORLD_PLAYERS_KEY, session_id)

    try:
        # 受信処理と送信処理を並列実行
        # どちらも無限ループなので、このgatherは接続中ずっと動く
        await asyncio.gather(
            receive_loop(ws, player_key),
            send_loop(ws)
        )

    # 切断時のクリーンアップ処理
    except WebSocketDisconnect:
        # Redisからプレイヤーデータ削除
        await r.delete(player_key)
        # ワールド参加者一覧から削除
        await r.srem(WORLD_PLAYERS_KEY, session_id)

# ===============================
# クライアントからの入力を受け取るループ
# ===============================
async def receive_loop(ws, player_key):
    while True:
        # クライアントからメッセージを受信（ここはブロッキング）
        data = await ws.receive_text()
        # JSONを辞書に変換
        msg = json.loads(data)

        # 移動メッセージの場合
        if msg["type"] == "move":
            # Redis上の座標を更新
            # → サーバーが「正」として状態を保持する
            await r.hset(player_key, mapping={
                "x": msg["x"],
                "y": msg["y"]
            })

# ===============================
# ワールド状態を定期的に送信するループ
# ===============================
async def send_loop(ws):
    while True:
        # 現在ワールドにいるプレイヤーID一覧取得
        ids = await r.smembers(WORLD_PLAYERS_KEY)

        players = []

        # 各プレイヤーのデータをRedisから取得
        for pid in ids:
            p = await r.hgetall(f"player:{pid}")
            if p:
                players.append(p)

        # 全プレイヤー情報をクライアントへ送信
        await ws.send_text(json.dumps({
            "type": "world_update",
            "players": players
        }))

        # 50ms待機（約20FPS更新）
        # → CPU過負荷防止
        # → 更新レート制御
        await asyncio.sleep(0.05)