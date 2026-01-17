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
}

export interface Brick {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  color: string;
}

export interface Paddle {
  y: number;
  height: number;
  width: number;
  score: number;
  color: string;
  side: 'left' | 'right';
}

export interface Ball {
  pos: Vector;
  vel: Vector;
  radius: number;
  active: boolean;
  speed: number;
}

export interface GameState {
  p1: Paddle;
  p2: Paddle;
  ball: Ball;
  bricks: Brick[];
  particles: Particle[];
  screenShake: number;
  slowMoTimer: number;
  strobeTimer: number;
  bricksDestroyedTotal: number;
  gameOver: boolean;
  winner: string | null;
}