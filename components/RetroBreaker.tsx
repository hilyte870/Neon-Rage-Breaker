import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Particle, Brick, Ball, Paddle, PowerUp, Projectile } from '../types';
import { soundManager } from '../utils/audio';
import { Play, RotateCcw, Volume2, VolumeX, Trophy, Gamepad2, Zap, Target } from 'lucide-react';

const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const BALL_RADIUS = 8;
const BALL_SPEED_BASE = 6;
const SLOW_MO_FACTOR = 0.3;
const GRAVITY_BRICKS = 0.05;
const COMBO_TIMEOUT = 2500; // ms

const RetroBreaker: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [gamepadsActive, setGamepadsActive] = useState(false);

  // Input State
  const keys = useRef<{ [key: string]: boolean }>({});
  const lastFireTime = useRef<{p1: number, p2: number}>({p1: 0, p2: 0});

  // Game State
  const gameState = useRef<GameState>({
    p1: { 
      x: 0, y: 0, width: PADDLE_WIDTH, height: PADDLE_HEIGHT, 
      score: 0, color: '#06b6d4', baseColor: '#06b6d4', side: 'left',
      ammo: 5, widthTimer: 0, superCharge: 0, sticky: false, stickyTimer: 0
    },
    p2: { 
      x: 0, y: 0, width: PADDLE_WIDTH, height: PADDLE_HEIGHT, 
      score: 0, color: '#d946ef', baseColor: '#d946ef', side: 'right',
      ammo: 5, widthTimer: 0, superCharge: 0, sticky: false, stickyTimer: 0
    },
    balls: [],
    bricks: [],
    particles: [],
    powerUps: [],
    projectiles: [],
    screenShake: 0,
    screenFlash: 0,
    slowMoTimer: 0,
    strobeTimer: 0,
    bricksDestroyedTotal: 0,
    combo: 0,
    comboTimer: 0,
    gameOver: false,
    winner: null,
    levelYOffset: 0,
  });

  const initGame = useCallback((width: number, height: number) => {
    const state = gameState.current;
    
    // Reset Paddles
    state.p1.y = height - 40;
    state.p2.y = height - 40;
    state.p1.x = (width / 4) - (PADDLE_WIDTH / 2);
    state.p2.x = (width * 0.75) - (PADDLE_WIDTH / 2);
    
    state.p1.score = 0;
    state.p2.score = 0;
    state.p1.ammo = 5;
    state.p2.ammo = 5;
    state.p1.superCharge = 0;
    state.p2.superCharge = 0;
    state.p1.sticky = false;
    state.p2.sticky = false;

    // Reset Balls
    state.balls = [{
        id: Math.random(),
        pos: { x: width / 2, y: height / 2 },
        vel: { x: (Math.random() - 0.5) * 4, y: -BALL_SPEED_BASE },
        radius: BALL_RADIUS,
        active: true,
        speed: BALL_SPEED_BASE,
        isSuper: false
    }];

    // Generate Bricks
    const rows = 8;
    const cols = 10;
    const brickW = width / (cols + 2); 
    const brickH = 25;
    const startX = width / 2 - (cols * brickW) / 2;
    const startY = 60; 
    
    const newBricks: Brick[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hue = (r / rows) * 200 + (c/cols) * 60; 
        newBricks.push({
          id: r * cols + c,
          x: startX + c * brickW,
          y: startY + r * brickH,
          width: brickW - 4,
          height: brickH - 4,
          active: true,
          color: `hsl(${hue}, 80%, 50%)`,
          health: 1
        });
      }
    }
    state.bricks = newBricks;
    state.bricksDestroyedTotal = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.gameOver = false;
    state.winner = null;
    state.slowMoTimer = 0;
    state.strobeTimer = 0;
    state.levelYOffset = 0;
    state.powerUps = [];
    state.projectiles = [];
    setWinner(null);
  }, []);

  const spawnPowerUp = (x: number, y: number) => {
    const rand = Math.random();
    if (rand > 0.35) return; 

    const types: ('ROCKET' | 'WIDE' | 'SUPER' | 'MULTIBALL' | 'STICKY')[] = ['ROCKET', 'WIDE', 'SUPER', 'MULTIBALL', 'STICKY'];
    // Weighted random
    const r = Math.random();
    let type = types[0];
    if (r < 0.3) type = 'ROCKET';
    else if (r < 0.5) type = 'MULTIBALL';
    else if (r < 0.7) type = 'STICKY';
    else if (r < 0.9) type = 'WIDE';
    else type = 'SUPER';

    gameState.current.powerUps.push({
      id: Math.random(),
      pos: { x, y },
      vel: { x: 0, y: 3 }, 
      type,
      active: true
    });
  };

  const firePaddle = (paddle: Paddle, owner: 'p1' | 'p2', width: number, height: number) => {
    const state = gameState.current;
    
    // 1. Release Stuck Balls
    let released = false;
    state.balls.forEach(b => {
        if (b.caughtBy === owner) {
            b.caughtBy = undefined;
            b.vel.y = -Math.abs(b.speed);
            b.vel.x = (Math.random() - 0.5) * 4;
            released = true;
            if(!isMuted) soundManager.playPaddleHit();
        }
    });
    
    // If we released a ball, don't fire rockets this frame to avoid accidental waste
    if (released) return;

    // 2. Super Move Trigger
    if (paddle.superCharge >= 100) {
        triggerSuperMove(paddle, owner, width, height);
        return;
    }

    // 3. Fire Rockets
    if (paddle.ammo <= 0) return;
    
    const now = Date.now();
    if (now - lastFireTime.current[owner] < 200) return; 
    lastFireTime.current[owner] = now;

    paddle.ammo--;
    if (!isMuted) soundManager.playRocketFire();

    state.projectiles.push({
      id: Math.random(),
      pos: { x: paddle.x + 5, y: paddle.y },
      vel: { x: 0, y: -12 },
      width: 4, height: 12,
      color: paddle.color,
      type: 'ROCKET',
      active: true
    });
    state.projectiles.push({
      id: Math.random(),
      pos: { x: paddle.x + paddle.width - 5, y: paddle.y },
      vel: { x: 0, y: -12 },
      width: 4, height: 12,
      color: paddle.color,
      type: 'ROCKET',
      active: true
    });
  };

  const triggerSuperMove = (paddle: Paddle, owner: 'p1' | 'p2', width: number, height: number) => {
    const state = gameState.current;
    paddle.superCharge = 0;
    state.screenFlash = 10;
    state.screenShake = 20;
    if (!isMuted) soundManager.playPowerUp(); // Use powerup sound for now, maybe deeper

    if (owner === 'p1') {
        // SUPER WAVE: Massive horizontal projectile
        state.projectiles.push({
            id: Math.random(),
            pos: { x: 0, y: paddle.y - 50 },
            vel: { x: 0, y: -20 },
            width: width,
            height: 40,
            color: '#06b6d4', // Cyan
            type: 'WAVE',
            active: true
        });
    } else {
        // SUPER CLUSTER: Spawns a "Juggernaut" ball (Mega Ball)
        // Or just spawns 5 super balls
        for (let i = 0; i < 5; i++) {
             state.balls.push({
                id: Math.random(),
                pos: { x: paddle.x + paddle.width/2, y: paddle.y - 20 },
                vel: { x: (Math.random() - 0.5) * 15, y: -10 - Math.random() * 5 },
                radius: BALL_RADIUS * 1.5,
                active: true,
                speed: 12,
                isSuper: true
            });
        }
    }
  };

  const createExplosion = (x: number, y: number, color: string, count = 15) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      const size = Math.random() * 4 + 2;
      gameState.current.particles.push({
        id: Math.random(),
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        color: color,
        life: 1.0,
        maxLife: 1.0,
        size: size,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10
      });
    }
  };

  const update = (width: number, height: number) => {
    const state = gameState.current;
    
    // Slow Mo
    let dt = 1;
    if (state.slowMoTimer > 0) {
      dt = SLOW_MO_FACTOR;
      state.slowMoTimer -= 16;
    }
    if (state.strobeTimer > 0) state.strobeTimer -= 16;
    if (state.screenFlash > 0) state.screenFlash--;

    // Level Scroll
    state.levelYOffset += GRAVITY_BRICKS * dt;

    // Input
    const gamepads = navigator.getGamepads();
    let p1InputX = 0;
    let p2InputX = 0;
    let p1Fire = false;
    let p2Fire = false;

    if (gamepads[0]) {
        p1InputX = gamepads[0].axes[0]; 
        if (gamepads[0].buttons[0].pressed || gamepads[0].buttons[7].pressed) p1Fire = true;
        setGamepadsActive(true);
    }
    if (gamepads[1]) {
        p2InputX = gamepads[1].axes[0];
        if (gamepads[1].buttons[0].pressed || gamepads[1].buttons[7].pressed) p2Fire = true;
    }

    if (keys.current['a'] || keys.current['A']) p1InputX = -1;
    if (keys.current['d'] || keys.current['D']) p1InputX = 1;
    if (keys.current['w'] || keys.current['W']) p1Fire = true;

    if (keys.current['ArrowLeft']) p2InputX = -1;
    if (keys.current['ArrowRight']) p2InputX = 1;
    if (keys.current['ArrowUp']) p2Fire = true;

    // Movement
    const speed = 12 * dt;
    state.p1.x += p1InputX * speed;
    state.p2.x += p2InputX * speed;

    state.p1.x = Math.max(0, Math.min((width / 2) - state.p1.width, state.p1.x));
    state.p2.x = Math.max(width / 2, Math.min(width - state.p2.width, state.p2.x));

    if (p1Fire) firePaddle(state.p1, 'p1', width, height);
    if (p2Fire) firePaddle(state.p2, 'p2', width, height);

    // Timers
    [state.p1, state.p2].forEach(p => {
        if (p.widthTimer > 0) {
            p.widthTimer -= 16;
            if (p.widthTimer <= 0) p.width = PADDLE_WIDTH;
        }
        if (p.stickyTimer > 0) {
            p.stickyTimer -= 16;
            if (p.stickyTimer <= 0) p.sticky = false;
        }
    });

    // Combo Timer
    if (state.comboTimer > 0) {
        state.comboTimer -= 16 * dt;
        if (state.comboTimer <= 0) state.combo = 0;
    }

    // Balls Update
    for (let i = state.balls.length - 1; i >= 0; i--) {
        const b = state.balls[i];
        if (!b.active) continue;

        if (b.caughtBy) {
            const p = b.caughtBy === 'p1' ? state.p1 : state.p2;
            b.pos.x = p.x + (b.caughtOffset || 0);
            b.pos.y = p.y - b.radius - 1;
            continue;
        }

        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;

        // Walls
        if (b.pos.x - b.radius < 0) {
            b.pos.x = b.radius;
            b.vel.x *= -1;
            if(!isMuted) soundManager.playWallHit();
        }
        if (b.pos.x + b.radius > width) {
            b.pos.x = width - b.radius;
            b.vel.x *= -1;
            if(!isMuted) soundManager.playWallHit();
        }
        if (b.pos.y - b.radius < 0) {
            b.pos.y = b.radius;
            b.vel.y *= -1;
            if(!isMuted) soundManager.playWallHit();
        }

        // Floor
        if (b.pos.y > height + 50) {
            // Remove ball
            state.balls.splice(i, 1);
            state.combo = 0; // Reset combo on miss
            if (state.balls.length === 0) {
                // Respawn penalty
                state.balls.push({
                    id: Math.random(),
                    pos: { x: width/2, y: height/2 },
                    vel: { x: 0, y: -BALL_SPEED_BASE },
                    radius: BALL_RADIUS,
                    active: true,
                    speed: BALL_SPEED_BASE,
                    isSuper: false
                });
                state.screenShake = 15;
                state.p1.score = Math.max(0, state.p1.score - 200);
                state.p2.score = Math.max(0, state.p2.score - 200);
            }
            continue;
        }

        // Paddle Collision
        [state.p1, state.p2].forEach(p => {
             if (
                b.pos.y + b.radius >= p.y &&
                b.pos.y - b.radius <= p.y + p.height &&
                b.pos.x + b.radius >= p.x &&
                b.pos.x - b.radius <= p.x + p.width
            ) {
                if (b.vel.y > 0) { 
                    if (p.sticky) {
                        b.caughtBy = p.side === 'left' ? 'p1' : 'p2';
                        b.caughtOffset = b.pos.x - p.x;
                        b.vel.x = 0;
                        b.vel.y = 0;
                    } else {
                        b.vel.y = -Math.abs(b.vel.y);
                        const center = p.x + p.width / 2;
                        const hit = (b.pos.x - center) / (p.width / 2);
                        b.vel.x = hit * 10; 
                        if(!isMuted) soundManager.playPaddleHit();
                        // Charge Super
                        p.superCharge = Math.min(100, p.superCharge + 5);
                    }
                }
            }
        });

        // Brick Collision
        for (const brick of state.bricks) {
            if (!brick.active) continue;
            const by = brick.y + state.levelYOffset;

            if (
                b.pos.x + b.radius > brick.x &&
                b.pos.x - b.radius < brick.x + brick.width &&
                b.pos.y + b.radius > by &&
                b.pos.y - b.radius < by + brick.height
            ) {
                if (!b.isSuper) {
                     const overlapX = (brick.width/2 + b.radius) - Math.abs(b.pos.x - (brick.x + brick.width/2));
                     const overlapY = (brick.height/2 + b.radius) - Math.abs(b.pos.y - (by + brick.height/2));
                     if (overlapX < overlapY) b.vel.x *= -1;
                     else b.vel.y *= -1;
                }
                
                destroyBrick(brick, by);
                if (b.isSuper) {
                    state.screenShake = 5; // More shake for super
                }
            }
        }
    }

    // Projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const proj = state.projectiles[i];
        proj.pos.y += proj.vel.y * dt;
        
        if (proj.pos.y < -50) {
            state.projectiles.splice(i, 1);
            continue;
        }

        // Brick hit
        for (const brick of state.bricks) {
            if (!brick.active) continue;
            const by = brick.y + state.levelYOffset;
            if (
                proj.pos.x + proj.width > brick.x &&
                proj.pos.x < brick.x + brick.width &&
                proj.pos.y + proj.height > by &&
                proj.pos.y < by + brick.height
            ) {
                destroyBrick(brick, by);
                if (proj.type === 'ROCKET') {
                    state.projectiles.splice(i, 1);
                    break; 
                }
                // WAVE pierces everything
            }
        }
    }

    // PowerUps
    for (let i = state.powerUps.length - 1; i >= 0; i--) {
        const pu = state.powerUps[i];
        pu.pos.y += 3 * dt;
        
        let caught = false;
        [state.p1, state.p2].forEach(p => {
            if (
                pu.pos.y + 10 > p.y &&
                pu.pos.y - 10 < p.y + p.height &&
                pu.pos.x > p.x &&
                pu.pos.x < p.x + p.width
            ) {
                caught = true;
                if(!isMuted) soundManager.playPowerUp();
                
                if (pu.type === 'ROCKET') p.ammo += 10;
                if (pu.type === 'WIDE') {
                    p.width = PADDLE_WIDTH * 1.5;
                    p.widthTimer = 10000;
                }
                if (pu.type === 'SUPER') p.superCharge = 100;
                if (pu.type === 'STICKY') {
                    p.sticky = true;
                    p.stickyTimer = 15000;
                }
                if (pu.type === 'MULTIBALL') {
                    // Spawn 2 balls at paddle
                    for(let k=0; k<2; k++) {
                        state.balls.push({
                            id: Math.random(),
                            pos: { x: p.x + p.width/2, y: p.y - 20 },
                            vel: { x: (Math.random()-0.5)*10, y: -8 },
                            radius: BALL_RADIUS,
                            active: true,
                            speed: 8,
                            isSuper: false
                        });
                    }
                }
            }
        });

        if (caught || pu.pos.y > height) state.powerUps.splice(i, 1);
    }

    // Lose Condition
    // Check if bricks reached bottom
    for (const brick of state.bricks) {
        if (brick.active && brick.y + state.levelYOffset + brick.height > height - 60) {
            state.gameOver = true;
            setWinner("THE BRICKS");
            setIsPlaying(false);
            break;
        }
    }

    // Win Condition
    if (!state.bricks.some(b => b.active) && !state.gameOver) {
        state.gameOver = true;
        setWinner("PLAYERS");
        setIsPlaying(false);
    }

    // Shake Decay
    if (state.screenShake > 0) {
        state.screenShake *= 0.9;
        if (state.screenShake < 0.5) state.screenShake = 0;
    }

    // Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.rotation += p.rotSpeed * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
  };

  const destroyBrick = (brick: Brick, yPos: number) => {
      const state = gameState.current;
      brick.active = false;
      state.screenShake = 3;
      state.screenFlash = 2;
      createExplosion(brick.x + brick.width / 2, yPos + brick.height / 2, brick.color, 20); // More particles
      spawnPowerUp(brick.x + brick.width/2, yPos + brick.height/2);
      if(!isMuted) soundManager.playBrickDestroy();
      state.bricksDestroyedTotal++;
      
      // Combo logic
      state.combo++;
      state.comboTimer = COMBO_TIMEOUT;
      const multiplier = 1 + Math.floor(state.combo / 5);

      state.p1.score += 50 * multiplier;
      state.p2.score += 50 * multiplier;
  };

  const drawMetalRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
    // Advanced metallic look with shimmer
    const time = Date.now() / 1000;
    
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#e4e4e7'); 
    grad.addColorStop(0.3, color); 
    grad.addColorStop(0.5, '#ffffff'); // Highlight
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, '#71717a'); 

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Diagonal Shimmer
    const shimmerPos = (Date.now() / 15) % (w * 3) - w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    
    const shimmerGrad = ctx.createLinearGradient(x + shimmerPos, y, x + shimmerPos + 50, y + h);
    shimmerGrad.addColorStop(0, 'rgba(255,255,255,0)');
    shimmerGrad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    shimmerGrad.addColorStop(1, 'rgba(255,255,255,0)');
    
    ctx.fillStyle = shimmerGrad;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x,y,w,h);
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const state = gameState.current;

    // BG
    ctx.fillStyle = '#09090b'; 
    ctx.fillRect(0, 0, width, height);

    if (state.strobeTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, width, height);
    }
    
    if (state.screenFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${state.screenFlash * 0.1})`;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.save();
    if (state.screenShake > 0) {
        const dx = (Math.random() - 0.5) * state.screenShake;
        const dy = (Math.random() - 0.5) * state.screenShake;
        ctx.translate(dx, dy);
    }

    // Bricks
    state.bricks.forEach(b => {
        if (!b.active) return;
        const by = b.y + state.levelYOffset;
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = b.color;
        
        const grad = ctx.createLinearGradient(b.x, by, b.x + b.width, by + b.height);
        grad.addColorStop(0, b.color);
        grad.addColorStop(0.5, '#fff'); // Metallic ridge
        grad.addColorStop(1, b.color);
        
        ctx.fillStyle = grad;
        ctx.fillRect(b.x, by, b.width, b.height);
    });

    // Paddles
    ctx.shadowBlur = 15;
    ctx.shadowColor = state.p1.color;
    drawMetalRect(ctx, state.p1.x, state.p1.y, state.p1.width, state.p1.height, state.p1.color);
    if (state.p1.sticky) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(state.p1.x, state.p1.y, state.p1.width, 4); // Sticky glue visual
    }

    ctx.shadowColor = state.p2.color;
    drawMetalRect(ctx, state.p2.x, state.p2.y, state.p2.width, state.p2.height, state.p2.color);
    if (state.p2.sticky) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(state.p2.x, state.p2.y, state.p2.width, 4);
    }

    // Balls
    state.balls.forEach(b => {
        ctx.shadowBlur = b.isSuper ? 30 : 15;
        ctx.shadowColor = b.isSuper ? '#ef4444' : '#ffffff';
        ctx.fillStyle = b.isSuper ? '#ef4444' : '#ffffff';
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Projectiles
    state.projectiles.forEach(p => {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = p.type === 'WAVE' ? '#22d3ee' : '#fff';
        ctx.fillRect(p.pos.x, p.pos.y, p.width, p.height);
    });

    // Powerups
    state.powerUps.forEach(p => {
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        if (p.type === 'ROCKET') {
            ctx.moveTo(p.pos.x, p.pos.y - 10);
            ctx.lineTo(p.pos.x + 8, p.pos.y + 10);
            ctx.lineTo(p.pos.x - 8, p.pos.y + 10);
        } else if (p.type === 'MULTIBALL') {
             ctx.arc(p.pos.x - 5, p.pos.y, 4, 0, Math.PI * 2);
             ctx.arc(p.pos.x + 5, p.pos.y, 4, 0, Math.PI * 2);
        } else if (p.type === 'STICKY') {
            ctx.rect(p.pos.x - 8, p.pos.y - 8, 16, 16);
        } else if (p.type === 'WIDE') {
            ctx.rect(p.pos.x - 12, p.pos.y - 4, 24, 8);
        } else {
            ctx.arc(p.pos.x, p.pos.y, 8, 0, Math.PI * 2);
        }
        ctx.fill();
    });

    // Particles
    state.particles.forEach(p => {
        ctx.save();
        ctx.translate(p.pos.x, p.pos.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        // Shard shape
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size, p.size);
        ctx.lineTo(-p.size, p.size);
        ctx.fill();
        ctx.restore();
    });

    ctx.restore();
    
    // UI Divider
    ctx.strokeStyle = '#3f3f46';
    ctx.beginPath();
    ctx.setLineDash([10, 10]);
    ctx.moveTo(width / 2, height - 100);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    ctx.setLineDash([]);
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
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const handleGamepad = () => setGamepadsActive(true);
    window.addEventListener('gamepadconnected', handleGamepad);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('gamepadconnected', handleGamepad);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current && canvasRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
        initGame(clientWidth, clientHeight);
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) draw(ctx, clientWidth, clientHeight);
    }
    const handleResize = () => {
        if (containerRef.current && canvasRef.current) {
            const { clientWidth, clientHeight } = containerRef.current;
            canvasRef.current.width = clientWidth;
            canvasRef.current.height = clientHeight;
        }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initGame]);

  return (
    <div className="relative w-full h-screen bg-zinc-950 flex flex-col items-center justify-center overflow-hidden">
      
      {/* HUD Layer */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none z-20 select-none">
        
        {/* P1 HUD */}
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1">
             <div className="w-2 h-8 bg-cyan-500 rounded shadow-[0_0_10px_#06b6d4]"></div>
             <h2 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white drop-shadow-md font-['Orbitron']">
               CYBER-1
             </h2>
          </div>
          <span className="text-white text-4xl font-mono tracking-widest pl-4">{gameState.current.p1.score.toString().padStart(6, '0')}</span>
          <div className="mt-2 pl-4 flex flex-col gap-1 w-48">
             <div className="flex items-center gap-2">
                <span className="text-xs text-cyan-400 w-12">AMMO</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden border border-zinc-700">
                    <div className="h-full bg-cyan-500" style={{width: `${(gameState.current.p1.ammo / 20) * 100}%`}}></div>
                </div>
             </div>
             <div className="flex items-center gap-2">
                <span className="text-xs text-yellow-400 w-12">SUPER</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden border border-zinc-700">
                    <div className="h-full bg-yellow-400" style={{width: `${gameState.current.p1.superCharge}%`}}></div>
                </div>
             </div>
             {gameState.current.p1.sticky && <span className="text-xs text-green-400 animate-pulse">MAGNET ACTIVE</span>}
          </div>
        </div>
        
        {/* CENTER COMBO HUD */}
        {gameState.current.combo > 1 && (
             <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce">
                <span className="text-4xl font-black text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.8)] font-['Bangers']">
                    {gameState.current.combo}x COMBO
                </span>
                <div className="w-32 h-2 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-yellow-500 transition-all duration-75" 
                         style={{width: `${(gameState.current.comboTimer / COMBO_TIMEOUT) * 100}%`}}></div>
                </div>
             </div>
        )}

        {/* P2 HUD */}
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1">
             <h2 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-l from-fuchsia-400 to-white drop-shadow-md font-['Orbitron']">
               NEON-2
             </h2>
             <div className="w-2 h-8 bg-fuchsia-500 rounded shadow-[0_0_10px_#d946ef]"></div>
          </div>
          <span className="text-white text-4xl font-mono tracking-widest pr-4">{gameState.current.p2.score.toString().padStart(6, '0')}</span>
          <div className="mt-2 pr-4 flex flex-col gap-1 w-48 items-end">
             <div className="flex items-center gap-2 w-full">
                <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden border border-zinc-700">
                    <div className="h-full bg-fuchsia-500" style={{width: `${(gameState.current.p2.ammo / 20) * 100}%`}}></div>
                </div>
                <span className="text-xs text-fuchsia-400 w-12 text-right">AMMO</span>
             </div>
             <div className="flex items-center gap-2 w-full">
                <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden border border-zinc-700">
                    <div className="h-full bg-yellow-400" style={{width: `${gameState.current.p2.superCharge}%`}}></div>
                </div>
                <span className="text-xs text-yellow-400 w-12 text-right">SUPER</span>
             </div>
             {gameState.current.p2.sticky && <span className="text-xs text-green-400 animate-pulse">MAGNET ACTIVE</span>}
          </div>
        </div>
      </div>

      {!isPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/85 backdrop-blur-md">
           {winner ? (
              <div className="flex flex-col items-center animate-in zoom-in duration-300">
                 <Trophy className="w-24 h-24 text-yellow-400 mb-4 animate-bounce drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]" />
                 <h1 className="text-6xl font-black text-white mb-2 font-['Bangers'] tracking-wider">{winner} WINS</h1>
                 <p className="text-zinc-400 mb-8 font-mono">FINAL SCORE: {(gameState.current.p1.score + gameState.current.p2.score)}</p>
                 <button 
                    onClick={() => {
                        if (containerRef.current) initGame(containerRef.current.clientWidth, containerRef.current.clientHeight);
                        setIsPlaying(true);
                    }}
                    className="px-8 py-3 bg-white text-black font-bold rounded hover:scale-105 transition-transform"
                 >
                    REMATCH
                 </button>
              </div>
           ) : (
             <div className="text-center">
                <h1 className="text-8xl mb-2 text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500 font-['Orbitron'] font-black italic tracking-tight drop-shadow-2xl">
                  METAL RAGE
                </h1>
                <p className="text-xl text-cyan-400 font-mono tracking-widest mb-12 uppercase drop-shadow-[0_0_10px_#06b6d4]">
                    Vertical Co-Op Defense
                </p>

                <div className="grid grid-cols-2 gap-16 mb-12 text-left">
                    <div className="space-y-4">
                        <h3 className="text-cyan-500 font-bold border-b border-zinc-700 pb-2 flex items-center gap-2"><Zap size={20}/> CYBER-1</h3>
                        <div className="flex items-center gap-4 text-zinc-400 font-mono text-sm">
                            <span className="border border-zinc-700 px-2 py-1 rounded bg-zinc-900">A / D</span> MOVE
                        </div>
                        <div className="flex items-center gap-4 text-zinc-400 font-mono text-sm">
                            <span className="border border-zinc-700 px-2 py-1 rounded bg-zinc-900">W</span> FIRE / SUPER
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-fuchsia-500 font-bold border-b border-zinc-700 pb-2 flex items-center gap-2"><Target size={20}/> NEON-2</h3>
                         <div className="flex items-center gap-4 text-zinc-400 font-mono text-sm">
                            <span className="border border-zinc-700 px-2 py-1 rounded bg-zinc-900">← / →</span> MOVE
                        </div>
                        <div className="flex items-center gap-4 text-zinc-400 font-mono text-sm">
                            <span className="border border-zinc-700 px-2 py-1 rounded bg-zinc-900">↑</span> FIRE / SUPER
                        </div>
                    </div>
                </div>

                <button 
                  onClick={() => {
                      setIsPlaying(true);
                      soundManager.playPaddleHit(); 
                  }}
                  className="relative group px-12 py-6 bg-zinc-100 text-black font-black text-2xl skew-x-[-12deg] hover:bg-white hover:scale-105 transition-all"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Play fill="black" size={24}/> INITIATE
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-white to-fuchsia-500 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                </button>
             </div>
           )}
        </div>
      )}

      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="absolute bottom-6 right-6 z-30 p-2 bg-zinc-900/50 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-700"
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      <div ref={containerRef} className="w-full h-full relative">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
      
      <div className="scanlines pointer-events-none opacity-50"></div>
    </div>
  );
};

export default RetroBreaker;