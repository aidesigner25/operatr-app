"use client";

import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; vx: number; vy: number; size: number; alpha: number };

/**
 * A deliberately small canvas field. It caps pixel density, pauses off-screen,
 * honours reduced-motion preferences, and draws at ~30fps to stay decorative
 * rather than becoming a hero-sized rendering cost.
 */
export function AmbientSignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let animationId = 0;
    let visible = true;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const count = width < 640 ? 34 : 72;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        size: Math.random() * 1.25 + 0.5,
        alpha: Math.random() * 0.24 + 0.08,
      }));
    };

    const draw = () => {
      if (!visible) return;
      frame += 1;
      if (frame % 2 === 0) {
        context.clearRect(0, 0, width, height);
        particles.forEach((particle, index) => {
          if (!reducedMotion) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            if (particle.x < 0 || particle.x > width) particle.vx *= -1;
            if (particle.y < 0 || particle.y > height) particle.vy *= -1;
          }

          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fillStyle = `rgba(87, 80, 69, ${particle.alpha})`;
          context.fill();

          for (let next = index + 1; next < particles.length; next += 1) {
            const neighbour = particles[next];
            const distance = Math.hypot(particle.x - neighbour.x, particle.y - neighbour.y);
            if (distance < 88) {
              context.beginPath();
              context.moveTo(particle.x, particle.y);
              context.lineTo(neighbour.x, neighbour.y);
              context.strokeStyle = `rgba(144, 127, 98, ${(1 - distance / 88) * 0.11})`;
              context.lineWidth = 0.55;
              context.stroke();
            }
          }
        });
      }
      animationId = requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !animationId) animationId = requestAnimationFrame(draw);
      if (!visible && animationId) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
    });

    resize();
    observer.observe(canvas);
    window.addEventListener("resize", resize, { passive: true });
    animationId = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full pointer-events-none" />;
}
