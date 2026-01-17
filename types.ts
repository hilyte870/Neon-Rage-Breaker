export interface Vector {
  x: number;
  y: number;
}

export interface Particle {
  id: number;
  pos: Vector;
  vel: Vector;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  rotSpeed: number;
}

export type PowerUpType = 'ROCKET' | 'WIDE' | 'SUPER' | 'MULTIBALL' | 'STICKY';

export interface PowerUp {
  id: number;
  pos: Vector;
  vel: Vector;
  type: PowerUpType;
  active: boolean;
}

export interface Projectile {
  id: number;
  pos: Vector;
  vel: Vector;
  width: number;
  height: number;
  color: string;
  type: 'ROCKET' | 'WAVE'; // WAVE is the super move
  active: boolean;
}

export interface Brick {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  color: string;
  health: number;
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  color: string;
  baseColor: string;
  side: 'left' | 'right';
  ammo: number;
  widthTimer: number;
  superCharge: number; // 0 to 100
  sticky: boolean;
  stickyTimer: number;
}

export interface Ball {
  id: number;
  pos: Vector;
  vel: Vector;
  radius: number;
  active: boolean;
  speed: number;
  isSuper: boolean; // Piercing
  caughtBy?: 'p1' | 'p2';
  caughtOffset?: number;
}

export interface GameState {
  p1: Paddle;
  p2: Paddle;
  balls: Ball[];
  bricks: Brick[];
  particles: Particle[];
  powerUps: PowerUp[];
  projectiles: Projectile[];
  screenShake: number;
  screenFlash: number;
  slowMoTimer: number;
  strobeTimer: number;
  bricksDestroyedTotal: number;
  combo: number;
  comboTimer: number;
  gameOver: boolean;
  winner: string | null;
  levelYOffset: number;
}