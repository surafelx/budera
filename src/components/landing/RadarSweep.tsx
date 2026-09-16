"use client";

import { useEffect, useRef } from "react";

/** A slow radar sweep drawn behind the agent console. Static rings only when the visitor prefers less motion. */
export function RadarSweep() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let angle = -Math.PI / 2;
    const blips = Array.from({ length: 9 }, (_, i) => ({ a: (i * 2.39) % (Math.PI * 2), r: 0.28 + ((i * 0.37) % 0.62), life: 0 }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.48;
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(61, 220, 151, 0.12)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();

      if (!reduced) {
        const sweep = ctx.createConicGradient(angle, cx, cy);
        sweep.addColorStop(0, "rgba(61, 220, 151, 0.22)");
        sweep.addColorStop(0.12, "rgba(61, 220, 151, 0)");
        sweep.addColorStop(1, "rgba(61, 220, 151, 0)");
        ctx.save();
        ctx.scale(1, 1);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, angle - 0.75, angle);
        ctx.closePath();
        ctx.fillStyle = sweep;
        ctx.globalCompositeOperation = "lighter";
        ctx.fill();
        ctx.restore();
      }

      for (const b of blips) {
        const diff = (angle - b.a + Math.PI * 4) % (Math.PI * 2);
        if (!reduced && diff < 0.05) b.life = 1;
        const alpha = reduced ? 0.45 : b.life;
        if (alpha > 0.01) {
          ctx.fillStyle = `rgba(61, 220, 151, ${alpha})`;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(b.a) * R * b.r, cy + Math.sin(b.a) * R * b.r, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        b.life *= 0.985;
      }

      if (!reduced) {
        angle += 0.006;
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    draw();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="radar" aria-hidden="true" />;
}
