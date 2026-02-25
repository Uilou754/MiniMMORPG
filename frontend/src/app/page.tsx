"use client"

import { useEffect, useRef } from "react"
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  // canvas要素を直接操作するための参照
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // WebSocketインスタンス保持用（再レンダリングしても保持したい）
  const wsRef = useRef<WebSocket | null>(null);
  // サーバーから受信したプレイヤー一覧
  // ※useStateではなく単純変数なのは、Canvas描画を自前ループでやっているため
  let players: any[] = [];

  useEffect(() => {
    // ==========================
    // WebSocket接続
    // ==========================
    // 環境変数からWebSocketURLを取得（例: ws://localhost:8000/ws）
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!);
    wsRef.current = ws;

    // サーバーからメッセージを受信したとき
    ws.onmessage = (event) => {
      // JSONをオブジェクトに変換
      const data = JSON.parse(event.data);

      // ワールド更新メッセージの場合
      if (data.type === "world_update") {
        // プレイヤー一覧を更新
        // → 描画ループで参照される
        players = data.players;
      }
    }

    // ==========================
    // Canvas初期化
    // ==========================
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // 自分の現在座標（クライアント側で保持）
    let x = 100;
    let y = 100;

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
        ctx.fillRect(parseInt(p.x), parseInt(p.y), 20, 20);
      });

      // 次フレーム予約（約60FPS）
      requestAnimationFrame(loop);
    }

    // 描画開始
    loop();

    // ==========================
    // キー入力処理
    // ==========================
    window.addEventListener("keydown", (e) => {
      // 矢印キーで座標変更（ローカル値）
      if (e.key === "ArrowUp") y -= 5;
      if (e.key === "ArrowDown") y += 5;
      if (e.key === "ArrowLeft") x -= 5;
      if (e.key === "ArrowRight") x += 5;

      // サーバーへ「移動したい」と通知
      // 実際の正しい座標はサーバー側（Redis）が保持する
      ws.send(JSON.stringify({
        type: "move",
        x,
        y
      }));
    })

    // ==========================
    // クリーンアップ処理
    // ==========================
    return () => {
      // コンポーネント破棄時にWebSocket切断
      ws.close();
    }
  }, []); // 初回マウント時のみ実行

  // ==========================
  // JSX（Canvas表示）
  // ==========================
  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      style={{ border: "1px solid black" }}
    />
  );
}
