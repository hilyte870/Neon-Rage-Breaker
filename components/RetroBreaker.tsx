import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Particle, Brick, Ball, Paddle } from '../types';
import { soundManager } from '../utils/audio';
import { Play, RotateCcw, Volume2, VolumeX, Trophy } from 'lucide-react';

const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 15;
const BALL_RADIUS = 8;
const BALL_SPEED_BASE = 8;
const SLOW_MO_FACTOR = 0.3;
const PARTICLES_PER_EXPLOSION = 20;

const RetroBreaker: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  // Input State
  const keys = useRef<{ [key: string]: boolean }>({});

  // Game State
  const gameState = useRef<GameState>({
    p1: { y: 0, height: PADDLE_HEIGHT, width: PADDLE_WIDTH, score: 0, color: '#06b6d4', side: 'left' }, // cyan-500
    p2: { y: 0, height: PADDLE_HEIGHT, width: PADDLE_WIDTH, score: 0, color: '#d946ef', side: 'right' }, // fuchsia-500
    ball: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, active: false, speed: BALL_SPEED_BASE },
    bricks: [],
    particles: [],
    screenShake: 0,
    slowMoTimer: 0,
    strobeTimer: 0,
    bricksDestroyedTotal: 0,
    gameOver: false,
    winner: null,
  });

  const initGame = useCallback((width: number, height: number) => {
    // Center ball
    gameState.current.ball.pos = { x: width / 2, y: height / 2 };
    gameState.current.ball.vel = { x: Math.random() > 0.5 ? BALL_SPEED_BASE : -BALL_SPEED_BASE, y: (Math.random() - 0.5) * BALL_SPEED_BASE };
    gameState.current.ball.active = true;
    gameState.current.ball.speed = BALL_SPEED_BASE;

    // Reset Paddles
    gameState.current.p1.y = height / 2 - PADDLE_HEIGHT / 2;
    gameState.current.p2.y = height / 2 - PADDLE_HEIGHT / 2;
    gameState.current.p1.score = 0;
    gameState.current.p2.score = 0;

    // Generate Bricks
    // 5 rows, center column
    const rows = 5;
    const cols = 8; // Actually vertical slices since it's side-to-side Pong style? 
    // Wait, typical breakout is top-down. 
    // The prompt says "Left paddle cyan, right one magenta". This implies side paddles (Pong). 
    // Prompt says "Forty bricks up top". In a side-paddle game, "up top" could mean the Y-axis top, or conceptually "center field".
    // I'll place them in the center of the screen to make it a "Battle Breaker".
    
    const brickW = 20;
    const brickH = 40;
    const startX = width / 2 - (cols * brickW) / 2;
    const startY = height / 2 - (rows * brickH) / 2;
    
    const newBricks: Brick[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Color gradient Red to Violet (Left to Right conceptually, or Top to Bottom?)
        // Let's do Red -> Violet across the columns
        const hue = (c / cols) * 280; // 0 (Red) to 280 (Violet)
        newBricks.push({
          id: r * cols + c,
          x: startX + c * brickW * 1.5, // Spaced out horizontally
          y: startY + r * brickH * 1.2, // Spaced out vertically
          width: brickW,
          height: brickH,
          active: true,
          color: `hsl(${hue}, 80%, 60%)`
        });
      }
    }
    gameState.current.bricks = newBricks;
    gameState.current.bricksDestroyedTotal = 0;
    gameState.current.gameOver = false;
    gameState.current.winner = null;
    gameState.current.slowMoTimer = 0;
    gameState.current.strobeTimer = 0;
    setWinner(null);
  }, []);

  const resetBall = (width: number, height: number, scorer?: 'p1' | 'p2') => {
    gameState.current.ball.pos = { x: width / 2, y: height / 2 };
    // Serve to the loser
    const dir = scorer === 'p1' ? -1 : 1; 
    gameState.current.ball.vel = { 
        x: dir * BALL_SPEED_BASE, 
        y: (Math.random() - 0.5) * BALL_SPEED_BASE 
    };
    gameState.current.ball.speed = BALL_SPEED_BASE;
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < PARTICLES_PER_EXPLOSION; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      gameState.current.particles.push({
        id: Math.random(),
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        color: color,
        life: 1.0,
        maxLife: 1.0,
        size: Math.random() * 4 + 2
      });
    }
  };

  const update = (width: number, height: number) => {
    const state = gameState.current;
    
    // Slow Mo Logic
    let dt = 1;
    if (state.slowMoTimer > 0) {
      dt = SLOW_MO_FACTOR;
      state.slowMoTimer -= 16; // approx 16ms per frame
    }
    if (state.strobeTimer > 0) {
        state.strobeTimer -= 16;
    }

    // Screen Shake decay
    if (state.screenShake > 0) {
      state.screenShake *= 0.9;
      if (state.screenShake < 0.5) state.screenShake = 0;
    }

    // Input P1 (W/S)
    if (keys.current['w'] || keys.current['W']) state.p1.y -= 10 * dt;
    if (keys.current['s'] || keys.current['S']) state.p1.y += 10 * dt;
    
    // Input P2 (Arrow Up/Down)
    if (keys.current['ArrowUp']) state.p2.y -= 10 * dt;
    if (keys.current['ArrowDown']) state.p2.y += 10 * dt;

    // Clamp Paddles
    state.p1.y = Math.max(0, Math.min(height - state.p1.height, state.p1.y));
    state.p2.y = Math.max(0, Math.min(height - state.p2.height, state.p2.y));

    // Move Ball
    const b = state.ball;
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;

    // Wall Collisions (Top/Bottom)
    if (b.pos.y - b.radius < 0) {
        b.pos.y = b.radius;
        b.vel.y *= -1;
        if(!isMuted) soundManager.playWallHit();
    }
    if (b.pos.y + b.radius > height) {
        b.pos.y = height - b.radius;
        b.vel.y *= -1;
        if(!isMuted) soundManager.playWallHit();
    }

    // Paddle Collisions
    // P1 (Left)
    if (
        b.pos.x - b.radius < PADDLE_WIDTH &&
        b.pos.y > state.p1.y &&
        b.pos.y < state.p1.y + state.p1.height
    ) {
        b.vel.x = Math.abs(b.vel.x) * 1.05; // Speed up slightly
        b.pos.x = PADDLE_WIDTH + b.radius;
        // Add some "english" based on where it hit the paddle
        const hitOffset = (b.pos.y - (state.p1.y + state.p1.height / 2)) / (state.p1.height / 2);
        b.vel.y += hitOffset * 4;
        if(!isMuted) soundManager.playPaddleHit();
    }

    // P2 (Right)
    if (
        b.pos.x + b.radius > width - PADDLE_WIDTH &&
        b.pos.y > state.p2.y &&
        b.pos.y < state.p2.y + state.p2.height
    ) {
        b.vel.x = -Math.abs(b.vel.x) * 1.05;
        b.pos.x = width - PADDLE_WIDTH - b.radius;
        const hitOffset = (b.pos.y - (state.p2.y + state.p2.height / 2)) / (state.p2.height / 2);
        b.vel.y += hitOffset * 4;
        if(!isMuted) soundManager.playPaddleHit();
    }

    // Goal Check
    if (b.pos.x < 0) {
        state.p2.score += 100; // P2 scores if P1 misses
        if(!isMuted) soundManager.playScore();
        state.screenShake = 10;
        resetBall(width, height, 'p2');
    }
    if (b.pos.x > width) {
        state.p1.score += 100; // P1 scores if P2 misses
        if(!isMuted) soundManager.playScore();
        state.screenShake = 10;
        resetBall(width, height, 'p1');
    }

    // Brick Collisions
    let hitBrick = false;
    for (let i = 0; i < state.bricks.length; i++) {
        const brick = state.bricks[i];
        if (!brick.active) continue;

        if (
            b.pos.x + b.radius > brick.x &&
            b.pos.x - b.radius < brick.x + brick.width &&
            b.pos.y + b.radius > brick.y &&
            b.pos.y - b.radius < brick.y + brick.height
        ) {
            brick.active = false;
            hitBrick = true;
            state.screenShake = 5;
            createExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color);
            if(!isMuted) soundManager.playBrickDestroy();

            // Reverse ball velocity based on simple AABB approximation
            // Did we hit horizontal or vertical side?
            // Simple approach: reverse X if we are within Y bounds deeply, else reverse Y
            // But for this speed, just reversing X is often safer if bricks are vertical columns?
            // Let's do simple center check
            const overlapX = (brick.width/2 + b.radius) - Math.abs(b.pos.x - (brick.x + brick.width/2));
            const overlapY = (brick.height/2 + b.radius) - Math.abs(b.pos.y - (brick.y + brick.height/2));

            if (overlapX < overlapY) {
                b.vel.x *= -1;
            } else {
                b.vel.y *= -1;
            }

            state.bricksDestroyedTotal++;
            
            // Special: Every 10 bricks
            if (state.bricksDestroyedTotal % 10 === 0) {
                state.slowMoTimer = 3000; // 3 seconds
                state.strobeTimer = 500; // 0.5s strobe
                if(!isMuted) soundManager.playSlowMoEnter();
            }

            // Points? Whoever last hit the ball?
            // For now, points are just for survival. 
            // Let's say breaking a brick gives both players +10? Or just score for the game?
            // Let's give points to the player moving TOWARDS the brick? 
            // Simplified: +50 global score? No, it's competitive.
            // Let's give points to the player whose side the ball is NOT on? 
            if (b.vel.x > 0) state.p1.score += 50; // P1 hit it towards P2 side
            else state.p2.score += 50; // P2 hit it towards P1 side
            
            break; // Only hit one brick per frame to prevent sticking
        }
    }

    // Check Win Condition (All bricks gone)
    if (!state.bricks.some(b => b.active) && !state.gameOver) {
        state.gameOver = true;
        if (state.p1.score > state.p2.score) setWinner("PLAYER 1");
        else if (state.p2.score > state.p1.score) setWinner("PLAYER 2");
        else setWinner("DRAW");
        setIsPlaying(false);
    }

    // Update Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) {
            state.particles.splice(i, 1);
        }
    }
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const state = gameState.current;

    // Clear with trail effect or solid
    // Strobe effect
    if (state.strobeTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = '#09090b'; // Background
    ctx.fillRect(0, 0, width, height);

    // Apply Shake
    ctx.save();
    if (state.screenShake > 0) {
        const dx = (Math.random() - 0.5) * state.screenShake * 2;
        const dy = (Math.random() - 0.5) * state.screenShake * 2;
        ctx.translate(dx, dy);
    }

    // Glow effect
    ctx.shadowBlur = 15;
    ctx.lineCap = 'round';

    // Draw Bricks
    state.bricks.forEach(b => {
        if (!b.active) return;
        ctx.shadowColor = b.color;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x, b.y, b.width, b.height);
        
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.globalAlpha = 1.0;
    });

    // Draw Paddles
    // P1
    ctx.shadowColor = state.p1.color;
    ctx.fillStyle = state.p1.color;
    ctx.fillRect(0, state.p1.y, state.p1.width, state.p1.height);
    
    // P2
    ctx.shadowColor = state.p2.color;
    ctx.fillStyle = state.p2.color;
    ctx.fillRect(width - state.p2.width, state.p2.y, state.p2.width, state.p2.height);

    // Draw Ball
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(state.ball.pos.x, state.ball.pos.y, state.ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw Particles
    state.particles.forEach(p => {
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
  };

  const loop = useCallback((time: number) => {
    if (!canvasRef.current || !isPlaying) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    update(canvas.width, canvas.height);
    draw(ctx, canvas.width, canvas.height);

    requestRef.current = requestAnimationFrame(loop);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(loop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, loop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Initialization Effect
  useEffect(() => {
    if (containerRef.current && canvasRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
        initGame(clientWidth, clientHeight);
        
        // Render one frame so it's not empty
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) draw(ctx, clientWidth, clientHeight);
    }
    const handleResize = () => {
        if (containerRef.current && canvasRef.current) {
            const { clientWidth, clientHeight } = containerRef.current;
            canvasRef.current.width = clientWidth;
            canvasRef.current.height = clientHeight;
            // Re-init game on resize might be annoying, but ensures positions are valid
            // Just clamping positions is better for a real app, but simplified here:
            initGame(clientWidth, clientHeight);
        }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initGame]);

  return (
    <div className="relative w-full h-screen bg-zinc-950 flex flex-col items-center justify-center overflow-hidden">
      
      {/* HUD Layer */}
      <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-start pointer-events-none z-20 font-['Bangers'] tracking-wider text-4xl select-none">
        <div className="flex flex-col items-start drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]">
          <span className="text-cyan-500">PLAYER 1</span>
          <span className="text-white text-6xl">{gameState.current.p1.score}</span>
        </div>
        
        <div className="flex flex-col items-end drop-shadow-[0_0_10px_rgba(217,70,239,0.8)]">
          <span className="text-fuchsia-500">PLAYER 2</span>
          <span className="text-white text-6xl">{gameState.current.p2.score}</span>
        </div>
      </div>

      {/* Controls Help Overlay (Only when paused) */}
      {!isPlaying && !winner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/80 backdrop-blur-sm">
          <h1 className="text-7xl mb-8 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 font-['Orbitron'] font-black drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] text-center animate-pulse">
            NEON RAGE<br/>BREAKER
          </h1>
          
          <div className="flex gap-12 mb-12">
            <div className="text-center">
              <h3 className="text-cyan-400 text-2xl mb-2 font-bold">PLAYER 1</h3>
              <div className="flex gap-2 justify-center text-zinc-400">
                <kbd className="px-4 py-2 bg-zinc-800 rounded border border-zinc-700 font-mono text-xl">W</kbd>
                <kbd className="px-4 py-2 bg-zinc-800 rounded border border-zinc-700 font-mono text-xl">S</kbd>
              </div>
            </div>
            <div className="h-20 w-px bg-zinc-700"></div>
            <div className="text-center">
              <h3 className="text-fuchsia-400 text-2xl mb-2 font-bold">PLAYER 2</h3>
              <div className="flex gap-2 justify-center text-zinc-400">
                <kbd className="px-4 py-2 bg-zinc-800 rounded border border-zinc-700 font-mono text-xl">↑</kbd>
                <kbd className="px-4 py-2 bg-zinc-800 rounded border border-zinc-700 font-mono text-xl">↓</kbd>
              </div>
            </div>
          </div>

          <button 
            onClick={() => {
                setIsPlaying(true);
                // Ensure audio context is ready
                soundManager.playPaddleHit(); // Dummy play to unlock audio context
            }}
            className="group relative px-8 py-4 bg-white text-black font-black text-2xl skew-x-[-10deg] hover:scale-110 transition-transform duration-200"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-fuchsia-500 blur opacity-75 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative flex items-center gap-2">
              <Play fill="black" /> INSERT COIN (START)
            </div>
          </button>
        </div>
      )}

      {/* Winner Overlay */}
      {winner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-black/90 backdrop-blur-md animate-in fade-in duration-500">
          <Trophy className="w-32 h-32 text-yellow-400 mb-4 drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] animate-bounce" />
          <h2 className="text-8xl font-black text-white mb-4 font-['Bangers'] tracking-widest drop-shadow-lg">
            {winner} WINS!
          </h2>
          <button 
            onClick={() => {
                if (containerRef.current) initGame(containerRef.current.clientWidth, containerRef.current.clientHeight);
                setIsPlaying(true);
            }}
            className="mt-8 px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center gap-2 transition-colors border border-zinc-600"
          >
            <RotateCcw className="w-5 h-5" /> PLAY AGAIN
          </button>
        </div>
      )}

      {/* Mute Toggle */}
      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="absolute bottom-8 right-8 z-30 p-3 bg-zinc-900/50 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-zinc-700"
      >
        {isMuted ? <VolumeX /> : <Volume2 />}
      </button>

      {/* Game Canvas Container */}
      <div ref={containerRef} className="w-full h-full relative">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
      
      {/* Scanline Overlay */}
      <div className="scanlines pointer-events-none"></div>
    </div>
  );
};

export default RetroBreaker;