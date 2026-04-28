import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import confetti from "canvas-confetti"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fireConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  // Left side
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    origin: { x: 0, y: 1 }
  });
  // Right side
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    origin: { x: 1, y: 1 }
  });
  
  fire(0.2, {
    spread: 60,
    origin: { x: 0, y: 1 }
  });
  fire(0.2, {
    spread: 60,
    origin: { x: 1, y: 1 }
  });

  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    origin: { x: 0, y: 1 }
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    origin: { x: 1, y: 1 }
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    origin: { x: 0, y: 1 }
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    origin: { x: 1, y: 1 }
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    origin: { x: 0, y: 1 }
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    origin: { x: 1, y: 1 }
  });
}
