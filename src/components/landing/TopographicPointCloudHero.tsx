"use client";

import React, { useEffect, useRef } from "react";

interface TopoParticle {
  // Base parametric coordinates in normalized formation space [0..1]
  u: number; // along ribbon length
  v: number; // ribbon index
  side: "left" | "right";
  layer: number; // 0: background, 1: midground, 2: foreground ridge
  baseZ: number; // depth
  jitterX: number;
  jitterY: number;
  size: number;
  baseAlpha: number;
  color: string;
}

export function TopographicPointCloudHero() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Mouse state with smooth lerping
    const mouse = {
      targetX: 0,
      targetY: 0,
      currX: 0,
      currY: 0,
      hovering: false,
    };

    let particles: TopoParticle[] = [];

    // Ribbon configuration for the two asymmetrical formations
    // Left formation: Sweeping ridge with lower terrace and high diagonal crest
    // Right formation: Cascading sculptural shelf with steep descent into lower right
    const buildParticles = (w: number, h: number) => {
      const isMobile = w < 768;
      const isTablet = w >= 768 && w < 1024;

      const ribbonCountLeft = isMobile ? 12 : isTablet ? 18 : 26;
      const ribbonCountRight = isMobile ? 11 : isTablet ? 17 : 24;

      const pointsPerRibbon = isMobile ? 32 : isTablet ? 48 : 68;

      const list: TopoParticle[] = [];

      // 1. LEFT FORMATION (The Western Ridge)
      for (let r = 0; r < ribbonCountLeft; r++) {
        const v = r / (ribbonCountLeft - 1); // 0 to 1
        const layer = v > 0.7 ? 2 : v > 0.35 ? 1 : 0;

        for (let p = 0; p < pointsPerRibbon; p++) {
          const u = p / (pointsPerRibbon - 1);

          // Variable density: more points near ridge crest (u around 0.3 to 0.7)
          // and tapering out toward the center of the viewport
          const densityFade = 1 - Math.pow(u, 1.8);
          if (Math.random() > densityFade * 1.15) continue;

          // Depth based on ribbon index and layer
          const baseZ = (1 - v) * 120 + (layer === 2 ? 80 : layer === 1 ? 40 : 0);

          // Sizing and coloring based on depth and layer
          let size = layer === 2 ? 2.4 : layer === 1 ? 1.7 : 1.1;
          size += (Math.random() - 0.5) * 0.6;

          let baseAlpha = layer === 2 ? 0.75 : layer === 1 ? 0.45 : 0.22;
          baseAlpha *= 0.6 + 0.4 * (1 - u); // fade toward center

          let color = "#18181b"; // default dark charcoal
          if (layer === 0) color = "#71717a";
          else if (layer === 2 && Math.random() > 0.3) color = "#09090b";

          list.push({
            u,
            v,
            side: "left",
            layer,
            baseZ,
            jitterX: (Math.random() - 0.5) * 12,
            jitterY: (Math.random() - 0.5) * 10,
            size: Math.max(0.8, size),
            baseAlpha,
            color,
          });
        }
      }

      // 2. RIGHT FORMATION (The Eastern Monolith / Escarpment)
      for (let r = 0; r < ribbonCountRight; r++) {
        const v = r / (ribbonCountRight - 1);
        const layer = v > 0.65 ? 2 : v > 0.3 ? 1 : 0;

        for (let p = 0; p < pointsPerRibbon; p++) {
          const u = p / (pointsPerRibbon - 1);

          const densityFade = 1 - Math.pow(u, 1.9);
          if (Math.random() > densityFade * 1.15) continue;

          const baseZ = (1 - v) * 100 + (layer === 2 ? 70 : layer === 1 ? 35 : 0);

          let size = layer === 2 ? 2.3 : layer === 1 ? 1.6 : 1.0;
          size += (Math.random() - 0.5) * 0.5;

          let baseAlpha = layer === 2 ? 0.7 : layer === 1 ? 0.42 : 0.2;
          baseAlpha *= 0.6 + 0.4 * (1 - u);

          let color = "#18181b";
          if (layer === 0) color = "#71717a";
          else if (layer === 2 && Math.random() > 0.35) color = "#09090b";

          list.push({
            u,
            v,
            side: "right",
            layer,
            baseZ,
            jitterX: (Math.random() - 0.5) * 12,
            jitterY: (Math.random() - 0.5) * 10,
            size: Math.max(0.8, size),
            baseAlpha,
            color,
          });
        }
      }

      particles = list;
    };

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      buildParticles(width, height);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      // Normalize mouse to [-1, 1] relative to center
      mouse.targetX = ((e.clientX - rect.left) / width - 0.5) * 2;
      mouse.targetY = ((e.clientY - rect.top) / height - 0.5) * 2;
      mouse.hovering = true;
    };

    const handleMouseLeave = () => {
      mouse.targetX = 0;
      mouse.targetY = 0;
      mouse.hovering = false;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    handleResize();

    let startTime = performance.now();

    const render = (time: number) => {
      const elapsed = prefersReducedMotion ? 0 : (time - startTime) * 0.00045;

      // Smooth mouse lerp
      mouse.currX += (mouse.targetX - mouse.currX) * 0.04;
      mouse.currY += (mouse.targetY - mouse.currY) * 0.04;

      ctx.clearRect(0, 0, width, height);

      const centerX = width * 0.5;
      const centerY = height * 0.5;

      // Subtle parallax shift
      const parallaxX = mouse.currX * 18;
      const parallaxY = mouse.currY * 12;

      // Draw subtle connecting topographical isolines for ribbons in mid/foreground
      // Group particles by side and ribbon index (v)
      const leftRibbons: Map<number, { x: number; y: number; alpha: number }[]> = new Map();
      const rightRibbons: Map<number, { x: number; y: number; alpha: number }[]> = new Map();

      // Render Particles
      const len = particles.length;
      for (let i = 0; i < len; i++) {
        const p = particles[i];

        let posX = 0;
        let posY = 0;
        let depth = p.baseZ;

        if (p.side === "left") {
          // Left formation geometry:
          // Begins off left screen (-0.05 * width) and sweeps inwards to max ~0.38 * width
          // High crest near center-left, dipping toward bottom
          const spanX = width * 0.44;
          const baseX = -width * 0.04 + p.u * spanX;

          // Asymmetrical elevation curves
          const curve1 = Math.sin(p.u * Math.PI * 0.95 + elapsed * 0.8) * 38;
          const curve2 = Math.cos(p.v * Math.PI * 1.4 - elapsed * 0.5) * 44;
          const terrace = Math.sin(p.u * 5.2 + p.v * 3.1) * 14;

          // Y distribution: spreads from near top to lower quadrant
          const baseY = height * 0.12 + p.v * (height * 0.78);
          posY = baseY + curve1 + curve2 * 0.5 + terrace + p.jitterY + parallaxY * (p.layer + 0.6);
          posX = baseX + Math.sin(p.v * 3.5 + elapsed) * 24 + p.jitterX + parallaxX * (p.layer + 0.6);

          // Subtle harmonic undulation in Z
          depth += Math.sin(p.u * 3.0 + p.v * 2.0 + elapsed) * 22;

          // Central exclusion clearance: prevent points from encroaching into central reading zone
          const distFromCenter = Math.abs(posX - centerX);
          if (distFromCenter < width * 0.22 && Math.abs(posY - centerY) < height * 0.28) {
            // Push gently back towards the left
            posX -= (width * 0.22 - distFromCenter) * 0.65;
          }

          // Register in ribbon map for contour lines (sample every 2nd ribbon in midground)
          if (p.layer >= 1 && p.v % 0.08 < 0.02) {
            const vKey = Math.round(p.v * 100);
            if (!leftRibbons.has(vKey)) leftRibbons.set(vKey, []);
            leftRibbons.get(vKey)!.push({ x: posX, y: posY, alpha: p.baseAlpha });
          }
        } else {
          // Right formation geometry:
          // Begins off right screen (1.04 * width) and arches leftward to ~0.62 * width
          const spanX = width * 0.44;
          const baseX = width * 1.04 - p.u * spanX;

          const curve1 = Math.cos(p.u * Math.PI * 0.9 - elapsed * 0.7) * 42;
          const curve2 = Math.sin(p.v * Math.PI * 1.6 + elapsed * 0.6) * 46;
          const terrace = Math.cos(p.u * 4.8 - p.v * 2.8) * 16;

          const baseY = height * 0.08 + p.v * (height * 0.82);
          posY = baseY + curve1 + curve2 * 0.5 + terrace + p.jitterY + parallaxY * (p.layer + 0.6);
          posX = baseX - Math.cos(p.v * 3.2 - elapsed) * 22 + p.jitterX + parallaxX * (p.layer + 0.6);

          depth += Math.cos(p.u * 2.8 - p.v * 2.2 + elapsed) * 20;

          // Central exclusion clearance
          const distFromCenter = Math.abs(posX - centerX);
          if (distFromCenter < width * 0.22 && Math.abs(posY - centerY) < height * 0.28) {
            posX += (width * 0.22 - distFromCenter) * 0.65;
          }

          if (p.layer >= 1 && p.v % 0.08 < 0.02) {
            const vKey = Math.round(p.v * 100);
            if (!rightRibbons.has(vKey)) rightRibbons.set(vKey, []);
            rightRibbons.get(vKey)!.push({ x: posX, y: posY, alpha: p.baseAlpha });
          }
        }

        // Perspective scale & final alpha
        const perspective = 380 / (380 + depth);
        const finalSize = p.size * perspective;
        const finalAlpha = Math.min(Math.max(p.baseAlpha * perspective, 0.06), 0.9);

        // Draw particle point
        ctx.beginPath();
        ctx.arc(posX, posY, Math.max(0.5, finalSize), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = finalAlpha;
        ctx.fill();
      }

      // Draw faint, architectural contour filaments connecting contiguous ribbon points
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "#27272a";

      const drawRibbonLines = (ribbons: Map<number, { x: number; y: number; alpha: number }[]>) => {
        ribbons.forEach((points) => {
          if (points.length < 3) return;
          // Sort by x
          points.sort((a, b) => a.x - b.x);

          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let k = 1; k < points.length; k++) {
            const pCurrent = points[k];
            const pPrev = points[k - 1];
            const dist = Math.hypot(pCurrent.x - pPrev.x, pCurrent.y - pPrev.y);
            // Only connect adjacent points that are reasonably close
            if (dist < 42) {
              ctx.lineTo(pCurrent.x, pCurrent.y);
            } else {
              ctx.moveTo(pCurrent.x, pCurrent.y);
            }
          }
          ctx.globalAlpha = 0.08;
          ctx.stroke();
        });
      };

      drawRibbonLines(leftRibbons);
      drawRibbonLines(rightRibbons);

      ctx.globalAlpha = 1.0;

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
}
