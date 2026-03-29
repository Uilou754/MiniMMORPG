"use client"

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { Player, Enemy } from "../types/types"; 

type EntityMap<T> = Record<string, PIXI.Graphics>;

export default function CanvasView() {

    // --------------------------
    // 参照値（Ref）
    // --------------------------
    // Reactの再レンダリングとは独立して保持したい値をRefで管理する。
    // プレイヤー情報やWebSocket、Pixiオブジェクトは高頻度で更新されるため、
    // useStateではなくuseRefで扱うことで不要な再描画を避ける。

    // Pixiが描画するcanvas要素への参照
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Pixiアプリ本体（必要に応じて外部から参照できるよう保持）
    const appRef = useRef<PIXI.Application | null>(null);
    // サーバーから受信した最新のワールド状態
    const playersRef = useRef<Player[]>([]);
    const enemiesRef = useRef<Enemy[]>([]);
    // WebSocketインスタンス（再レンダリングをまたいで保持）
    const wsRef = useRef<WebSocket | null>(null);
    // エンティティIDごとの描画オブジェクト管理
    const playerGraphicsRef = useRef<EntityMap<Player>>({});
    const enemyGraphicsRef = useRef<EntityMap<Enemy>>({});

    // サーバーから通知される自分のセッションID
    let mySessionId: string | null = null;

    useEffect(() => {
        // SSR直後などでcanvas未確保のケースを防ぐガード
        if (!canvasRef.current) return;

        // 非同期初期化の途中でunmountされた場合に備える
        let disposed = false;
        let app: PIXI.Application | null = null;
        let ws: WebSocket | null = null;

        // ==========================
        // キー入力処理（同時押し対応）
        // ==========================
        // 矢印キーの押下状態を保持
        const keyState: Record<string, boolean> = {};

        // 押下状態から次座標を計算し、移動イベントをサーバーへ通知
        // キーイベントごとに再計算するため、同時押し（斜め移動）にも対応できる。
        const sendMove = () => {
            // セッション初期化完了前は送信しない
            if (!mySessionId) return;
            const me = playersRef.current.find((p) => p.id === mySessionId);
            if (!me) return;
            if (!ws || ws.readyState !== WebSocket.OPEN) return;

            let x = Number(me.x);
            let y = Number(me.y);
            if (keyState.ArrowUp) y -= 5;
            if (keyState.ArrowDown) y += 5;
            if (keyState.ArrowLeft) x -= 5;
            if (keyState.ArrowRight) x += 5;
            ws.send(JSON.stringify({ type: "move", x, y }));
        };

        const onDown = (e: KeyboardEvent) => {
            // 矢印キー以外はゲーム移動入力として扱わない
            if (!e.key.startsWith("Arrow")) return;
            keyState[e.key] = true;
            sendMove();
        };

        const onUp = (e: KeyboardEvent) => {
            if (!e.key.startsWith("Arrow")) return;
            keyState[e.key] = false;
            sendMove();
        };

        // コンポーネント破棄時にイベントと通信とPixiリソースを解放
        const cleanup = () => {
            // リスナーを先に外し、破棄中の送信処理を防ぐ
            window.removeEventListener("keydown", onDown);
            window.removeEventListener("keyup", onUp);
            // 通信切断
            ws?.close();
            wsRef.current = null;
            // GPU/メモリ資源の解放
            app?.destroy(true, { children: true, texture: true });
            appRef.current = null;
        };

        const init = async () => {
        // --------------------------
        // Pixi初期化
        // --------------------------
        // Pixi v8では Application 生成直後は ticker が未準備のため、
        // 先に init を await してから ticker を使う必要がある。
        // canvasに既存要素を指定して、DOMの追加生成ではなく既存要素へ描画する。
        // autoDensity + devicePixelRatio で高DPI環境でも見た目の荒れを抑える。
        const pixiApp = new PIXI.Application();
        await pixiApp.init({
            canvas: canvasRef.current ?? undefined,
            width: 800,
            height: 600,
            background: 0x222222,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        // init待機中にunmountされていた場合は生成したリソースを即時解放
        if (disposed) {
            pixiApp.destroy(true, { children: true, texture: true });
            return;
        }

        app = pixiApp;
        appRef.current = pixiApp;

        // ゲーム内オブジェクトを載せるレイヤー
        const worldLayer = new PIXI.Container();
        pixiApp.stage.addChild(worldLayer);

        // --------------------------
        // 描画ユーティリティ
        // --------------------------
        // サーバーから来るエンティティ情報を元に、
        // 既存Graphicsを再利用しながら位置・HPバーを更新する。
        // ここを共通化することで、プレイヤーと敵の描画更新を同じ流れで扱える。
        // 1エンティティ分のGraphicsを作成/再利用し、最新状態で描画する
        const resolveEntity = <T extends Player | Enemy>(
            e: T,
            pool: EntityMap<T>,
            tint: number
        ) => {
            let g = pool[e.id] as PIXI.Graphics | undefined;
            if (!g) {
                // 初回登場時のみGraphicsを生成し、以降は再利用する
                g = new PIXI.Graphics();
                worldLayer.addChild(g);
                pool[e.id] = g;
            }
            // 毎フレーム描き直すため、前フレームの内容をクリア
            g.clear();
            g.beginFill(tint);
            g.drawRect(0, 0, 20, 20);
            g.endFill();
            // サーバー値は文字列の可能性があるためNumberで正規化
            g.x = Number(e.x);
            g.y = Number(e.y);
            // HPバー
            const hp = Number(e.hp || 0);
            const maxHp = Number(e.max_hp || 1);
            // 比率は0〜1に丸めて描画範囲外を防ぐ
            const ratio = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0));
            g.lineStyle(0);
            g.beginFill(0x00ff00);
            g.drawRect(0, -6, 20 * ratio, 4);
            g.endFill();
            g.beginFill(0xff0000);
            g.drawRect(20 * ratio, -6, 20 * (1 - ratio), 4);
            g.endFill();
            return g;
        };

        // 毎フレーム、受信済みの状態をもとに表示オブジェクトを同期
        pixiApp.ticker.add(() => {
            const players = playersRef.current;
            const enemies = enemiesRef.current;

            // サーバー一覧から消えたエンティティは表示からも除去する。
            // これを行わないと、離脱済みオブジェクトが画面に残る。
            // 現在の一覧に存在しないプレイヤーのGraphicsを破棄
            Object.keys(playerGraphicsRef.current).forEach((id) => {
                if (!players.find((p) => p.id === id)) {
                worldLayer.removeChild(playerGraphicsRef.current[id]);
                delete playerGraphicsRef.current[id];
                }
            });

            // 現在の一覧に存在しない敵のGraphicsを破棄
            Object.keys(enemyGraphicsRef.current).forEach((id) => {
                if (!enemies.find((e) => e.id === id)) {
                worldLayer.removeChild(enemyGraphicsRef.current[id]);
                delete enemyGraphicsRef.current[id];
                }
            });

            // 受信済みデータでプレイヤー・敵の描画内容を更新
            players.forEach((p) => resolveEntity(p, playerGraphicsRef.current, 0x0000ff));
            enemies.forEach((e) => resolveEntity(e, enemyGraphicsRef.current, 0xff0000));
        });

        // ==========================
        // WebSocket接続
        // ==========================
        // 接続はuseEffect内で1回だけ作成し、unmount時に確実にcloseする。
        ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!);
        wsRef.current = ws;

        // サーバーからメッセージを受信したとき
        ws.onmessage = (event) => {
            // JSONをオブジェクトに変換
            const data = JSON.parse(event.data);

            // 初期セッション情報の場合
            if (data.type === "session_init") {
                // 自分自身のプレイヤー特定に使うIDを保持
                mySessionId = data.session_id;
            }

            // ワールド更新メッセージの場合
            else if (data.type === "world_update") {
                // プレイヤー一覧を更新
                playersRef.current = data.players;
                // 敵キャラクター一覧を更新
                enemiesRef.current = data.enemies ?? [];
            }
        };

        // グローバル入力を監視（フォーカスがcanvas外でも操作可能）
        window.addEventListener("keydown", onDown);
        window.addEventListener("keyup", onUp);

        };

        init().catch((error) => {
            console.error("Pixi初期化に失敗:", error);
        });

        return () => {
            disposed = true;
            cleanup();
        };
    }, []);

    return <canvas ref={canvasRef} width={800} height={600} style={{ border: "1px solid black" }} />;
}