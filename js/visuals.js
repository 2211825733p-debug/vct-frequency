/**
 * Six ambient fields, one canvas. No sprite sheets, no dependencies.
 *
 * Every year gets its own spatial behaviour:
 *   2021 dust / 2022 embers / 2023 clockwork
 *   2024 chrome / 2025 tracers / 2026 eclipse
 */

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hexToRgba = (hex, alpha = 1) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const number = Number.parseInt(value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const random = (min, max) => min + Math.random() * (max - min);

export class SignalField {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.reducedMotion = reducedMotion;
    this.track = null;
    this.colors = {
      primary: '#ffad42',
      secondary: '#ff5b2b',
      tertiary: '#6b3210',
      ink: '#080604'
    };
    this.mode = 'eclipse';
    this.particles = [];
    this.levels = { bass: 0, mid: 0, high: 0, energy: 0 };
    this.energy = 0;
    this.clock = 0;
    this.lastFrame = 0;
    this.running = false;
    this.raf = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.center = { x: 0, y: 0 };
    this.ash = [];
    this.handleResize = this.handleResize.bind(this);
    this.frame = this.frame.bind(this);

    this.resize();
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (width === this.width && height === this.height && dpr === this.dpr) return;

    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isCompact = width < 820;
    this.center = {
      x: width * (isCompact ? 0.55 : 0.64),
      y: height * (isCompact ? 0.31 : 0.46)
    };
    this.syncCenter();

    this.buildParticles();

    if (this.reducedMotion) {
      this.drawStatic();
    }
  }

  syncCenter() {
    const mark = document.querySelector('#markButton');
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  handleResize() {
    this.resize();
  }

  setTrack(track) {
    this.track = track;
    this.colors = track.fx;
    this.mode = track.fx.mode;
    this.clock = 0;
    this.energy = 0;
    this.buildParticles();
    if (this.reducedMotion || !this.running) {
      this.drawStatic();
    }
  }

  setLevels(levels) {
    this.levels = levels;
  }

  buildParticles() {
    const count = this.mode === 'eclipse' || this.mode === 'ember'
      ? (this.width < 820 ? 58 : 96)
      : (this.width < 820 ? 34 : 64);

    this.particles = Array.from({ length: count }, () => this.createParticle());
    this.ash = Array.from({ length: this.width < 820 ? 28 : 52 }, () => this.createAsh());
  }

  createParticle() {
    const mode = this.mode;
    if (mode === 'ember') {
      return {
        x: random(0, this.width),
        y: random(this.height, this.height + 120),
        vx: random(-0.18, 0.18),
        vy: random(-0.85, -0.22),
        size: random(0.55, 2.4),
        phase: random(0, TAU),
        drift: random(0.15, 0.55),
        alpha: random(0.18, 0.8),
        life: random(0.25, 1)
      };
    }

    if (mode === 'dust') {
      return {
        x: random(0, this.width),
        y: random(-this.height * 0.3, this.height),
        vx: random(-0.08, 0.08),
        vy: random(0.08, 0.32),
        size: random(0.35, 1.5),
        phase: random(0, TAU),
        drift: random(0.05, 0.25),
        alpha: random(0.08, 0.45)
      };
    }

    if (mode === 'clock') {
      return {
        angle: random(0, TAU),
        radius: random(0.14, 0.48) * Math.min(this.width, this.height),
        speed: random(0.00018, 0.0005),
        size: random(1, 3.8),
        alpha: random(0.1, 0.42)
      };
    }

    if (mode === 'chrome') {
      return {
        x: random(-this.width * 0.2, this.width),
        y: random(-this.height * 0.2, this.height),
        vx: random(0.12, 0.55),
        vy: random(0.06, 0.28),
        length: random(12, 78),
        width: random(0.35, 1.3),
        alpha: random(0.08, 0.42),
        phase: random(0, TAU)
      };
    }

    if (mode === 'tracer') {
      return {
        angle: random(0, TAU),
        offset: random(0, 1),
        speed: random(0.00018, 0.0005),
        length: random(0.03, 0.2),
        width: random(0.5, 1.3),
        alpha: random(0.08, 0.38)
      };
    }

    return {
      x: random(0, this.width),
      y: random(-this.height * 0.2, this.height),
      vx: random(-0.1, 0.16),
      vy: random(0.05, 0.26),
      size: random(0.35, 1.35),
      phase: random(0, TAU),
      alpha: random(0.1, 0.42)
    };
  }

  createAsh() {
    return {
      x: random(0, this.width),
      y: random(-this.height * 0.2, this.height),
      vx: random(-0.12, 0.18),
      vy: random(0.12, 0.38),
      size: random(0.35, 1.5),
      phase: random(0, TAU),
      alpha: random(0.08, 0.35)
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    if (this.reducedMotion) {
      this.drawStatic();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  frame(now) {
    if (!this.running) return;
    const dt = clamp((now - this.lastFrame) / 1000, 0.001, 0.05);
    this.lastFrame = now;
    this.clock += dt;

    const target = this.levels.energy || 0;
    this.energy += (target - this.energy) * 0.08;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawAmbient(dt);
    this.updateParticles(dt);

    if (!document.hidden) {
      // The page is intentionally light on CPU; one canvas is the only loop.
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.raf = window.setTimeout(() => {
        this.lastFrame = performance.now();
        this.raf = requestAnimationFrame(this.frame);
      }, 500);
    }
  }

  drawStatic() {
    if (!this.track) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawAmbient(0);
    this.updateParticles(0);
  }

  drawAmbient(dt) {
    switch (this.mode) {
      case 'dust':
        this.drawDustAmbient(dt);
        break;
      case 'ember':
        this.drawEmberAmbient(dt);
        break;
      case 'clock':
        this.drawClockAmbient(dt);
        break;
      case 'chrome':
        this.drawChromeAmbient(dt);
        break;
      case 'tracer':
        this.drawTracerAmbient(dt);
        break;
      case 'eclipse':
      default:
        this.drawEclipseAmbient(dt);
        break;
    }
  }

  updateParticles(dt) {
    switch (this.mode) {
      case 'dust':
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        for (const particle of this.particles) {
          particle.x += particle.vx * dt * 60;
          particle.y += particle.vy * dt * 60;
          if (particle.y > this.height + 12) {
            particle.y = -12;
            particle.x = random(0, this.width);
          }
          if (particle.x < -12) particle.x = this.width + 12;
          if (particle.x > this.width + 12) particle.x = -12;
          const shimmer = 0.55 + Math.sin(this.clock * 0.6 + particle.phase) * 0.45;
          this.ctx.fillStyle = hexToRgba(this.colors.primary, particle.alpha * shimmer * (0.5 + this.energy));
          this.ctx.beginPath();
          this.ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
          this.ctx.fill();
        }
        this.ctx.restore();
        break;

      case 'ember':
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';
        for (const particle of this.particles) {
          const previousX = particle.x;
          const previousY = particle.y;
          particle.x += (particle.vx + Math.sin(this.clock * 0.7 + particle.phase) * particle.drift * 0.08) * dt * 60;
          particle.y += particle.vy * dt * 60 * (1 + this.energy * 0.5);
          particle.life -= dt * 0.12;
          if (particle.y < -20 || particle.life <= 0) {
            particle.x = random(0, this.width);
            particle.y = this.height + random(10, 110);
            particle.life = random(0.5, 1.2);
            particle.alpha = random(0.2, 0.8);
          }
          const alpha = particle.alpha * clamp(particle.life, 0, 1);
          const gradient = this.ctx.createLinearGradient(previousX, previousY, particle.x, particle.y);
          gradient.addColorStop(0, hexToRgba(this.colors.secondary, 0));
          gradient.addColorStop(1, hexToRgba(this.colors.primary, alpha));
          this.ctx.strokeStyle = gradient;
          this.ctx.lineWidth = particle.size;
          this.ctx.lineCap = 'round';
          this.ctx.beginPath();
          this.ctx.moveTo(previousX, previousY);
          this.ctx.lineTo(particle.x, particle.y);
          this.ctx.stroke();
        }
        this.ctx.restore();
        break;

      case 'clock':
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        for (const particle of this.particles) {
          particle.angle += particle.speed * (1 + this.energy * 1.8);
          const x = this.center.x + Math.cos(particle.angle) * particle.radius;
          const y = this.center.y + Math.sin(particle.angle) * particle.radius * 0.82;
          this.ctx.fillStyle = hexToRgba(
            particle.radius > Math.min(this.width, this.height) * 0.36 ? this.colors.primary : this.colors.secondary,
            particle.alpha * (0.65 + this.energy * 0.8)
          );
          this.ctx.fillRect(x, y, particle.size, Math.max(1, particle.size * 0.45));
        }
        this.ctx.restore();
        break;

      case 'chrome':
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        for (const particle of this.particles) {
          particle.x += particle.vx * dt * 60;
          particle.y += particle.vy * dt * 60;
          if (particle.y > this.height + 80 || particle.x > this.width + 80) {
            particle.x = random(-this.width * 0.35, -40);
            particle.y = random(-80, this.height * 0.45);
          }
          const alpha = particle.alpha * (0.75 + this.energy * 0.9);
          const gradient = this.ctx.createLinearGradient(
            particle.x,
            particle.y,
            particle.x - particle.length * 0.62,
            particle.y - particle.length * 0.79
          );
          gradient.addColorStop(0, hexToRgba(this.colors.secondary, alpha));
          gradient.addColorStop(0.5, hexToRgba(this.colors.primary, alpha * 0.8));
          gradient.addColorStop(1, hexToRgba(this.colors.primary, 0));
          this.ctx.strokeStyle = gradient;
          this.ctx.lineWidth = particle.width;
          this.ctx.lineCap = 'butt';
          this.ctx.beginPath();
          this.ctx.moveTo(particle.x, particle.y);
          this.ctx.lineTo(particle.x - particle.length * 0.62, particle.y - particle.length * 0.79);
          this.ctx.stroke();
        }
        this.ctx.restore();
        break;

      case 'tracer':
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        const maxRadius = Math.hypot(this.width, this.height) * 0.7;
        for (const particle of this.particles) {
          particle.offset += particle.speed * (1 + this.energy * 1.5);
          const phase = (particle.offset + this.clock * 0.035) % 1;
          const inner = maxRadius * (0.13 + phase * 0.82);
          const outer = inner + maxRadius * particle.length * (0.45 + this.energy);
          const x1 = this.center.x + Math.cos(particle.angle) * inner;
          const y1 = this.center.y + Math.sin(particle.angle) * inner;
          const x2 = this.center.x + Math.cos(particle.angle) * outer;
          const y2 = this.center.y + Math.sin(particle.angle) * outer;
          const alpha = particle.alpha * (1 - Math.abs(phase - 0.55) * 1.1) * (0.6 + this.energy);
          if (alpha <= 0.005) continue;
          this.ctx.strokeStyle = hexToRgba(particle.offset > 0.5 ? this.colors.secondary : this.colors.primary, alpha);
          this.ctx.lineWidth = particle.width;
          this.ctx.beginPath();
          this.ctx.moveTo(x1, y1);
          this.ctx.lineTo(x2, y2);
          this.ctx.stroke();
        }
        this.ctx.restore();
        break;

      case 'eclipse':
        this.drawAsh(dt);
        break;

      default:
        break;
    }
  }

  drawAsh(dt) {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    for (const particle of this.ash) {
      particle.x += (particle.vx + Math.sin(this.clock * 0.28 + particle.phase) * 0.1) * dt * 60;
      particle.y += particle.vy * (1.1 + this.energy * 0.4) * dt * 60;
      if (particle.y > this.height + 10) {
        particle.y = -10;
        particle.x = random(0, this.width);
      }
      if (particle.x < -10) particle.x = this.width + 10;
      if (particle.x > this.width + 10) particle.x = -10;
      this.ctx.fillStyle = hexToRgba(
        particle.x > this.center.x ? this.colors.primary : this.colors.secondary,
        particle.alpha * (0.6 + this.energy * 0.8)
      );
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  drawDustAmbient() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    const x = this.width * 0.67;
    const beam = this.ctx.createLinearGradient(x, 0, x - this.width * 0.15, this.height);
    beam.addColorStop(0, hexToRgba(this.colors.primary, 0.035));
    beam.addColorStop(0.45, hexToRgba(this.colors.primary, 0.018));
    beam.addColorStop(1, hexToRgba(this.colors.primary, 0));
    this.ctx.fillStyle = beam;
    this.ctx.beginPath();
    this.ctx.moveTo(x - this.width * 0.18, 0);
    this.ctx.lineTo(x + this.width * 0.1, 0);
    this.ctx.lineTo(x + this.width * 0.3, this.height);
    this.ctx.lineTo(x - this.width * 0.38, this.height);
    this.ctx.closePath();
    this.ctx.fill();

    // Three slow sonar rings: the first championship as a heartbeat.
    const radiusBase = Math.min(this.width, this.height);
    for (let i = 0; i < 3; i += 1) {
      const phase = (this.clock * 0.065 + i / 3) % 1;
      const radius = radiusBase * (0.105 + phase * 0.36);
      const alpha = (1 - phase) * (0.085 + this.energy * 0.07);
      this.ctx.strokeStyle = hexToRgba(this.colors.primary, alpha);
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(this.center.x, this.center.y, radius, 0, TAU);
      this.ctx.stroke();
    }
    this.ctx.restore();

    this.ctx.save();
    this.ctx.strokeStyle = hexToRgba(this.colors.primary, 0.08 + this.energy * 0.06);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height * 0.74);
    this.ctx.lineTo(this.width, this.height * 0.74);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawEmberAmbient() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    const glow = this.ctx.createRadialGradient(
      this.width * 0.56,
      this.height * 0.78,
      0,
      this.width * 0.56,
      this.height * 0.78,
      Math.max(this.width, this.height) * 0.55
    );
    glow.addColorStop(0, hexToRgba(this.colors.primary, 0.06 + this.energy * 0.04));
    glow.addColorStop(0.45, hexToRgba(this.colors.secondary, 0.025));
    glow.addColorStop(1, hexToRgba(this.colors.secondary, 0));
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const horizon = this.ctx.createLinearGradient(0, this.height * 0.55, 0, this.height);
    horizon.addColorStop(0, hexToRgba(this.colors.secondary, 0));
    horizon.addColorStop(1, hexToRgba(this.colors.primary, 0.04));
    this.ctx.fillStyle = horizon;
    this.ctx.fillRect(0, this.height * 0.55, this.width, this.height * 0.45);
    this.ctx.restore();
  }

  drawClockAmbient() {
    const radius = Math.min(this.width, this.height) * 0.34;
    this.ctx.save();
    this.ctx.translate(this.center.x, this.center.y);
    this.ctx.strokeStyle = hexToRgba(this.colors.primary, 0.09 + this.energy * 0.05);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, TAU);
    this.ctx.stroke();

    this.ctx.strokeStyle = hexToRgba(this.colors.secondary, 0.16);
    for (let i = 0; i < 60; i += 1) {
      const angle = (i / 60) * TAU;
      const inner = radius * (i % 5 === 0 ? 0.91 : 0.955);
      this.ctx.beginPath();
      this.ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      this.ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      this.ctx.stroke();
    }

    const sweep = this.clock * (0.09 + this.energy * 0.08);
    this.ctx.rotate(sweep);
    const wedge = this.ctx.createConicGradient
      ? this.ctx.createConicGradient(0, 0, 0)
      : null;
    if (wedge) {
      wedge.addColorStop(0, hexToRgba(this.colors.primary, 0.075));
      wedge.addColorStop(0.12, hexToRgba(this.colors.primary, 0));
      wedge.addColorStop(1, hexToRgba(this.colors.primary, 0));
      this.ctx.fillStyle = wedge;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, radius, 0, TAU);
      this.ctx.fill();
    }

    this.ctx.strokeStyle = hexToRgba(this.colors.secondary, 0.3);
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(Math.cos(-Math.PI / 2) * radius * 0.56, Math.sin(-Math.PI / 2) * radius * 0.56);
    this.ctx.stroke();
    this.ctx.restore();

    this.ctx.save();
    this.ctx.strokeStyle = hexToRgba(this.colors.primary, 0.06);
    this.ctx.setLineDash([2, 8]);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height * 0.7);
    this.ctx.lineTo(this.width, this.height * 0.7);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawChromeAmbient() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i += 1) {
      const offset = i * this.width * 0.23;
      const beam = this.ctx.createLinearGradient(offset, 0, offset + this.width * 0.34, this.height);
      beam.addColorStop(0, hexToRgba(this.colors.secondary, 0));
      beam.addColorStop(0.3, hexToRgba(this.colors.primary, 0.035 + i * 0.01));
      beam.addColorStop(0.65, hexToRgba(this.colors.secondary, 0.018));
      beam.addColorStop(1, hexToRgba(this.colors.primary, 0));
      this.ctx.fillStyle = beam;
      this.ctx.beginPath();
      this.ctx.moveTo(offset, 0);
      this.ctx.lineTo(offset + this.width * 0.08, 0);
      this.ctx.lineTo(offset + this.width * 0.42, this.height);
      this.ctx.lineTo(offset + this.width * 0.22, this.height);
      this.ctx.closePath();
      this.ctx.fill();
    }

    const reflection = this.ctx.createLinearGradient(0, this.height * 0.63, this.width, this.height * 0.68);
    reflection.addColorStop(0, hexToRgba(this.colors.primary, 0));
    reflection.addColorStop(0.5, hexToRgba(this.colors.secondary, 0.055 + this.energy * 0.03));
    reflection.addColorStop(1, hexToRgba(this.colors.primary, 0));
    this.ctx.fillStyle = reflection;
    this.ctx.fillRect(0, this.height * 0.63, this.width, 1.5);
    this.ctx.restore();
  }

  drawTracerAmbient() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    const radius = Math.min(this.width, this.height) * 0.25;
    this.ctx.translate(this.center.x, this.center.y);

    this.ctx.strokeStyle = hexToRgba(this.colors.primary, 0.12 + this.energy * 0.12);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, TAU);
    this.ctx.stroke();

    this.ctx.strokeStyle = hexToRgba(this.colors.secondary, 0.18);
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (TAU / 4) + this.clock * 0.04;
      this.ctx.beginPath();
      this.ctx.moveTo(Math.cos(angle) * radius * 0.92, Math.sin(angle) * radius * 0.92);
      this.ctx.lineTo(Math.cos(angle) * radius * 1.12, Math.sin(angle) * radius * 1.12);
      this.ctx.stroke();
    }

    this.ctx.rotate(-0.28);
    this.ctx.strokeStyle = hexToRgba(this.colors.secondary, 0.06);
    for (let i = -3; i <= 3; i += 1) {
      const y = i * 36 + Math.sin(this.clock * 0.25 + i) * 5;
      this.ctx.beginPath();
      this.ctx.moveTo(-this.width * 0.45, y);
      this.ctx.lineTo(this.width * 0.65, y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawEclipseAmbient() {
    const { x, y } = this.center;
    const base = Math.min(this.width, this.height);
    const core = base * 0.235;
    const glow = this.ctx.createRadialGradient(x, y, core * 0.78, x, y, base * 0.72);
    glow.addColorStop(0, hexToRgba(this.colors.primary, 0.085 + this.energy * 0.04));
    glow.addColorStop(0.26, hexToRgba(this.colors.primary, 0.045));
    glow.addColorStop(0.58, hexToRgba(this.colors.secondary, 0.018));
    glow.addColorStop(1, hexToRgba(this.colors.secondary, 0));

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // A dark body of the sun, with a thin burning rim.
    const body = this.ctx.createRadialGradient(
      x - core * 0.18,
      y - core * 0.18,
      0,
      x,
      y,
      core * (0.94 + this.energy * 0.03)
    );
    body.addColorStop(0, 'rgba(6, 4, 3, 0.94)');
    body.addColorStop(0.72, 'rgba(7, 5, 3, 0.94)');
    body.addColorStop(0.94, hexToRgba(this.colors.tertiary, 0.24));
    body.addColorStop(1, hexToRgba(this.colors.primary, 0));
    this.ctx.fillStyle = body;
    this.ctx.beginPath();
    this.ctx.arc(x, y, core * (1 + this.energy * 0.04), 0, TAU);
    this.ctx.fill();

    this.ctx.translate(x, y);
    this.ctx.rotate(this.clock * 0.012);
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (TAU / 4) + 0.35;
      this.ctx.strokeStyle = hexToRgba(i % 2 ? this.colors.secondary : this.colors.primary, 0.3 + this.energy * 0.2);
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, core * (1.055 + i * 0.016), angle, angle + 0.32);
      this.ctx.stroke();
    }

    this.ctx.strokeStyle = hexToRgba(this.colors.primary, 0.2);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, core * 0.78, 0, TAU);
    this.ctx.stroke();
    this.ctx.restore();
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
  }
}
