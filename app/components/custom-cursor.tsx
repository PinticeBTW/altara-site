"use client";

import { useEffect } from "react";

export function CustomCursor() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    const dot = document.createElement("div");
    const ring = document.createElement("div");
    dot.className = "cursor-dot";
    ring.className = "cursor-ring";
    document.body.append(dot, ring);

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let frame = 0;
    let previewFrame: HTMLElement | null = null;

    const getPreviewFrame = () => {
      if (!previewFrame?.isConnected) {
        previewFrame = document.querySelector<HTMLElement>("[data-tilt-preview]");
      }

      return previewFrame;
    };

    const resetPreviewTilt = () => {
      const target = getPreviewFrame();

      if (!target) {
        return;
      }

      target.style.transform = "";
      target.style.setProperty("--glare-x", "92%");
      target.style.setProperty("--glare-y", "10%");
      target.style.setProperty("--spot-x", "92%");
      target.style.setProperty("--spot-y", "10%");
      target.style.setProperty("--spot-opacity", "0");
      target.style.setProperty("--edge-left", "0.04");
      target.style.setProperty("--edge-right", "0.08");
      target.style.setProperty("--edge-top", "0.08");
      target.style.setProperty("--edge-bottom", "0.04");
      target.style.setProperty("--shade-left", "0.04");
      target.style.setProperty("--shade-right", "0.03");
      target.style.setProperty("--shade-top", "0.03");
      target.style.setProperty("--shade-bottom", "0.04");
      target.style.setProperty("--shadow-x", "52px");
      target.style.setProperty("--shadow-y", "70px");
      target.style.setProperty("--shadow-blur", "110px");
      target.style.setProperty("--warm-shadow-x", "-18px");
      target.style.setProperty("--warm-shadow-y", "26px");
      target.style.setProperty("--depth-x", "0px");
      target.style.setProperty("--depth-y", "0px");
      target.classList.remove("is-tilting");
    };

    const tiltPreview = (event: MouseEvent) => {
      const target = getPreviewFrame();

      if (!target) {
        return;
      }

      const hitbox = target.closest<HTMLElement>(".demo") ?? target;
      const rect = hitbox.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!inside) {
        if (target.classList.contains("is-tilting")) {
          resetPreviewTilt();
        }

        return;
      }

      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      const leftSide = x < 0;
      const bodyX = leftSide ? x * 0.42 : x * 0.78;
      const bodyY = y * 0.78;
      const reactionX = -bodyX;
      const reactionY = -bodyY;
      const absX = Math.abs(bodyX);
      const absY = Math.abs(bodyY);
      const cursorLift = Math.min(1, 0.18 + Math.abs(x) * 0.5 + Math.abs(y) * 0.4);
      const cornerLift = Math.min(1, 0.16 + absX * 0.52 + absY * 0.44);
      const rotateX = 5 + reactionY * 6;
      const rotateY = -10 + reactionX * 7.5;
      const rotateZ = -1 + reactionX * 0.28;
      const shiftX = reactionX * 8;
      const shiftY = reactionY * 5;
      const depth = 24 + cornerLift * 14;
      const scale = 1.004 + cornerLift * 0.006;
      const shadowX = 52 + bodyX * 24;
      const shadowY = 70 + bodyY * 12;
      const warmShadowX = -18 - bodyX * 20;
      const warmShadowY = 26 - bodyY * 9;
      const leftLight = 0.03 + Math.max(0, -x) * 0.16;
      const rightLight = 0.04 + Math.max(0, x) * 0.28;
      const topLight = 0.04 + Math.max(0, -y) * 0.3;
      const bottomLight = 0.03 + Math.max(0, y) * 0.24;
      const leftShade = 0.03 + Math.max(0, x) * 0.28;
      const rightShade = 0.03 + Math.max(0, -x) * 0.12;
      const topShade = 0.02 + Math.max(0, y) * 0.22;
      const bottomShade = 0.03 + Math.max(0, -y) * 0.22;
      const spotOpacity = (leftSide ? 0.14 : 0.22) + cursorLift * (leftSide ? 0.16 : 0.24);

      target.style.transform = `
        rotateX(${rotateX.toFixed(2)}deg)
        rotateY(${rotateY.toFixed(2)}deg)
        rotateZ(${rotateZ.toFixed(2)}deg)
        translate3d(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px, ${depth.toFixed(1)}px)
        scale(${scale.toFixed(3)})
      `;
      target.style.setProperty("--glare-x", `${((x + 1) * 50).toFixed(1)}%`);
      target.style.setProperty("--glare-y", `${((y + 1) * 50).toFixed(1)}%`);
      target.style.setProperty("--spot-x", `${((x + 1) * 50).toFixed(1)}%`);
      target.style.setProperty("--spot-y", `${((y + 1) * 50).toFixed(1)}%`);
      target.style.setProperty("--spot-opacity", spotOpacity.toFixed(3));
      target.style.setProperty("--edge-left", leftLight.toFixed(3));
      target.style.setProperty("--edge-right", rightLight.toFixed(3));
      target.style.setProperty("--edge-top", topLight.toFixed(3));
      target.style.setProperty("--edge-bottom", bottomLight.toFixed(3));
      target.style.setProperty("--shade-left", leftShade.toFixed(3));
      target.style.setProperty("--shade-right", rightShade.toFixed(3));
      target.style.setProperty("--shade-top", topShade.toFixed(3));
      target.style.setProperty("--shade-bottom", bottomShade.toFixed(3));
      target.style.setProperty("--shadow-x", `${shadowX.toFixed(1)}px`);
      target.style.setProperty("--shadow-y", `${shadowY.toFixed(1)}px`);
      target.style.setProperty("--shadow-blur", `${(96 + cornerLift * 22).toFixed(1)}px`);
      target.style.setProperty("--warm-shadow-x", `${warmShadowX.toFixed(1)}px`);
      target.style.setProperty("--warm-shadow-y", `${warmShadowY.toFixed(1)}px`);
      target.style.setProperty("--depth-x", `${(reactionX * 2).toFixed(1)}px`);
      target.style.setProperty("--depth-y", `${(reactionY * 2).toFixed(1)}px`);
      target.classList.add("is-tilting");
    };

    const onMove = (event: MouseEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
      tiltPreview(event);
    };

    const onOver = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('a, button, .btn, .card, .platform-btn, [data-cursor="hover"]')) {
        ring.classList.add("hover");
      }
    };

    const onOut = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('a, button, .btn, .card, .platform-btn, [data-cursor="hover"]')) {
        ring.classList.remove("hover");
      }
    };

    const animate = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
      frame = window.requestAnimationFrame(animate);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    window.addEventListener("scroll", resetPreviewTilt, { passive: true });
    frame = window.requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("scroll", resetPreviewTilt);
      window.cancelAnimationFrame(frame);
      resetPreviewTilt();
      dot.remove();
      ring.remove();
    };
  }, []);

  return null;
}
