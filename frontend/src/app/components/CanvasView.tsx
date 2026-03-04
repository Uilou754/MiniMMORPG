"use client"

import { useEffect, useRef } from "react";
import { Player, Enemy } from "../types/types"; 

export default function CanvasView() {

    // canvas要素を直接操作するための参照
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // WebSocketインスタンス保持用（再レンダリングしても保持したい）
    const wsRef = useRef<WebSocket | null>(null);

    // サーバーから受信したプレイヤー一覧
    let players: Player[] = [];
    // サーバーから受信した敵キャラクター一覧
    let enemies: Enemy[] = [];
    // 自分のセッションID
    let mySessionId: string | null = null;

    useEffect(() => {
        // ==========================
        // WebSocket接続
        // ==========================
        const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!);
        wsRef.current = ws;

        // サーバーからメッセージを受信したとき
        ws.onmessage = (event) => {
            // JSONをオブジェクトに変換
            const data = JSON.parse(event.data);

            // 初期セッション情報の場合
            if (data.type === "session_init") {
                mySessionId = data.session_id;
            }
            // ワールド更新メッセージの場合
            else if (data.type === "world_update") {
                // プレイヤー一覧を更新
                players = data.players;
                // 敵キャラクター一覧を更新
                enemies = data.enemies || [];
            }
        };

        // ==========================
        // Canvas初期化
        // ==========================
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;

        // ==========================
        // 描画ループ（常時実行）
        // ==========================
        function loop() {

            // 前フレームをクリア
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // サーバーから受信した全プレイヤーを描画
            players.forEach(p => {
                ctx.fillStyle = "blue";

                // Redisからは文字列で来るので数値に変換
                const x = parseInt(p.x);
                const y = parseInt(p.y);
                ctx.fillRect(x, y, 20, 20);

                // HPゲージを描画
                const hp = parseInt(p.hp || "0");
                const maxHp = parseInt(p.max_hp || "0");
                const barWidth = 20;
                const barHeight = 4;
                const hpRatio = maxHp > 0 ? hp / maxHp : 0;
                const greenWidth = barWidth * hpRatio;
                // 残りHP（緑）
                ctx.fillStyle = "green";
                ctx.fillRect(x, y - barHeight - 2, greenWidth, barHeight);
                // 減ったHP（赤）
                ctx.fillStyle = "red";
                ctx.fillRect(x + greenWidth, y - barHeight - 2, barWidth - greenWidth, barHeight);

                // プレイヤーのRectのすぐ下にUUIDを表示
                ctx.fillStyle = "black";
                ctx.font = "10px Arial";
                ctx.textAlign = "center";
                ctx.fillText(p.id.substring(0, 8), x + 10, y + 30);
            });

            // サーバーから受信した敵キャラクターを描画
            enemies.forEach(e => {
                ctx.fillStyle = "red";

                // 敵の座標
                const x = parseInt(e.x);
                const y = parseInt(e.y);
                ctx.fillRect(x, y, 20, 20);

                // HPゲージを描画
                const hp = parseInt(e.hp || "0");
                const maxHp = parseInt(e.max_hp || "0");
                const barWidth = 20;
                const barHeight = 4;
                const hpRatio = maxHp > 0 ? hp / maxHp : 0;
                const greenWidth = barWidth * hpRatio;
                ctx.fillStyle = "green";
                ctx.fillRect(x, y - barHeight - 2, greenWidth, barHeight);
                ctx.fillStyle = "red";
                ctx.fillRect(x + greenWidth, y - barHeight - 2, barWidth - greenWidth, barHeight);

                // 敵の名前を表示
                ctx.fillStyle = "black";
                ctx.font = "10px Arial";
                ctx.textAlign = "center";
                ctx.fillText(e.name, x + 10, y + 30);
            });

            // 次フレーム予約（約60FPS）
            requestAnimationFrame(() => loop());
        }

        // 描画開始
        loop();
    
        // ==========================
        // キー入力処理
        // ==========================
        window.addEventListener("keydown", (e) => {
            // サーバーから受け取った自分のプレイヤー情報を検索
            const myPlayer = players.find(p => p.id === mySessionId);
            if (!myPlayer) return;

            // サーバーから受け取った座標を数値に変換
            let x = parseInt(myPlayer.x);
            let y = parseInt(myPlayer.y);

            // 矢印キーで座標変更
            if (e.key === "ArrowUp") y -= 5;
            if (e.key === "ArrowDown") y += 5;
            if (e.key === "ArrowLeft") x -= 5;
            if (e.key === "ArrowRight") x += 5;
            
            // サーバーへ「移動したい」と通知
            // 実際の正しい座標はサーバー側（Redis）が保持する
            ws.send(
                JSON.stringify({
                    type: "move",
                    x: x,
                    y: y,
                })
            );
        });

        // ==========================
        // クリーンアップ処理
        // ==========================
        return () => {
            // WebSocket切断
            ws.close();
        };
    }, []); // 初回マウント時のみ実行

    return (
        <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{ border: "1px solid black" }}
        />
    );
}