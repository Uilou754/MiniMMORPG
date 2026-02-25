"use client"

import { useEffect, useRef } from "react"
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  let players: any[] = []

  useEffect(() => {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === "world_update") {
        players = data.players
      }
    }

    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!

    let x = 100
    let y = 100

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      players.forEach(p => {
        ctx.fillStyle = "blue"
        ctx.fillRect(parseInt(p.x), parseInt(p.y), 20, 20)
      })

      requestAnimationFrame(loop)
    }

    loop()

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") y -= 5
      if (e.key === "ArrowDown") y += 5
      if (e.key === "ArrowLeft") x -= 5
      if (e.key === "ArrowRight") x += 5

      ws.send(JSON.stringify({
        type: "move",
        x,
        y
      }))
    })

    return () => {
      ws.close()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      style={{ border: "1px solid black" }}
    />
  )
}
