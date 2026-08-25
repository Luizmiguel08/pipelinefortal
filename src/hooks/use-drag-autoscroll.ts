import { useCallback, useRef } from "react";

const EDGE_SIZE = 80; // px from edge that triggers scroll
const SCROLL_SPEED = 12; // px per frame

/**
 * Hook that provides auto-scroll behavior for a scrollable container
 * during drag-and-drop operations. When the pointer is near the left/right
 * edges of the container, it scrolls in that direction.
 */
export function useDragAutoscroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const directionRef = useRef<"left" | "right" | null>(null);

  const stopScroll = useCallback(() => {
    directionRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const el = containerRef.current;
    if (!el || !directionRef.current) {
      rafRef.current = null;
      return;
    }
    if (directionRef.current === "left") {
      el.scrollLeft = Math.max(0, el.scrollLeft - SCROLL_SPEED);
    } else {
      el.scrollLeft = el.scrollLeft + SCROLL_SPEED;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startScroll = useCallback(
    (dir: "left" | "right") => {
      if (directionRef.current === dir) return;
      directionRef.current = dir;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < EDGE_SIZE) {
        startScroll("left");
      } else if (x > rect.width - EDGE_SIZE) {
        startScroll("right");
      } else {
        stopScroll();
      }
    },
    [startScroll, stopScroll],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only stop if we actually left the container (not entering a child)
      const el = containerRef.current;
      if (!el) return;
      const related = e.relatedTarget as Node | null;
      if (!related || !el.contains(related)) {
        stopScroll();
      }
    },
    [stopScroll],
  );

  const handleDrop = useCallback(() => {
    stopScroll();
  }, [stopScroll]);

  const handleDragEnd = useCallback(() => {
    stopScroll();
  }, [stopScroll]);

  return {
    containerRef,
    containerProps: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      onDragEnd: handleDragEnd,
    },
    stopScroll,
  };
}
