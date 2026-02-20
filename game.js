const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let game = {
    active: true,
    width: window.innerWidth,
    height: window.innerHeight,
    score: 0,
    keys: {},
    mouse: { x: 0, y: 0, down: false },
    paused: false
};

// Resize handling
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    game.width = canvas.width;
    game.height = canvas.height;
});
canvas.width = game.width;
canvas.height = game.height;

// Input Handling
window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.repeat) togglePause();
    game.keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => game.keys[e.key.toLowerCase()] = false);
window.addEventListener('mousemove', e => {
    game.mouse.x = e.clientX;
    game.mouse.y = e.clientY;
});
window.addEventListener('mousedown', () => game.mouse.down = true);
window.addEventListener('mouseup', () => game.mouse.down = false);

// --- CLASSES ---

class Particle {
    constructor(x, y, color, velocity) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.velocity = velocity;
        this.alpha = 1;
        this.friction = 0.98;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2); // Small particles
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= 0.02; // Fade out
    }
}

class Player {
    constructor() {
        this.x = game.width / 2;
        this.y = game.height / 2;
        this.radius = 20;
        this.color = '#4a90e2';
        this.speed = 5;
        this.health = 100;
        this.bandages = 2; // Start with some bandages
        this.maxHealth = 100;
    }

    update() {
        // Movement
        // Movement
        let dx = 0;
        let dy = 0;

        if (game.keys['w'] || game.keys['arrowup']) dy -= 1;
        if (game.keys['s'] || game.keys['arrowdown']) dy += 1;
        if (game.keys['a'] || game.keys['arrowleft']) dx -= 1;
        if (game.keys['d'] || game.keys['arrowright']) dx += 1;

        // Apply Mobile Input
        if (mobileInput.move.active) {
            dx = mobileInput.move.x;
            dy = mobileInput.move.y;
        }

        // Normalize if diagonal (keyboard only, joystick handles itself mostly)
        // But for mixed input safety:
        if (dx !== 0 || dy !== 0) {
            // Basic normalization for keyboard to prevent fast diagonal
            if (!mobileInput.move.active && dx !== 0 && dy !== 0) {
                const len = Math.hypot(dx, dy);
                dx /= len;
                dy /= len;
            }

            this.x += dx * this.speed;
            this.y += dy * this.speed;
        }

        // Boundary checks
        this.x = Math.max(this.radius, Math.min(game.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(game.height - this.radius, this.y));

        // Use Bandage
        if (game.keys['e']) {
            this.useBandage();
            game.keys['e'] = false; // Prevent rapid fire use
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();

        // Direction indicator (gun)
        // Direction indicator (gun)
        let angle;
        if (mobileInput.aim.active) {
            angle = Math.atan2(mobileInput.aim.y, mobileInput.aim.x);
        } else {
            angle = Math.atan2(game.mouse.y - this.y, game.mouse.x - this.x);
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -5, 35, 10);
        ctx.restore();
    }

    useBandage() {
        if (this.bandages > 0 && this.health < this.maxHealth) {
            this.bandages--;
            this.health = Math.min(this.maxHealth, this.health + 25);
            updateUI();
            // Heal effect
            for (let i = 0; i < 10; i++) {
                particles.push(new Particle(this.x, this.y, '#00ff00', {
                    x: (Math.random() - 0.5) * 5,
                    y: (Math.random() - 0.5) * 5
                }));
            }
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            endGame();
        }
        updateUI();
        // Damage effect
        for (let i = 0; i < 5; i++) {
            particles.push(new Particle(this.x, this.y, '#ff0000', {
                x: (Math.random() - 0.5) * 5,
                y: (Math.random() - 0.5) * 5
            }));
        }
    }
}

class Projectile {
    constructor(x, y, targetX, targetY, isEnemy = false) {
        this.x = x;
        this.y = y;
        this.radius = 5;
        this.color = isEnemy ? '#ff4444' : '#ffff00';
        this.speed = 10;
        this.isEnemy = isEnemy;

        const angle = Math.atan2(targetY - y, targetX - x);
        this.velocity = {
            x: Math.cos(angle) * this.speed,
            y: Math.sin(angle) * this.speed
        };
        this.markedForDeletion = false;
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;

        // Remove if off screen
        if (this.x < 0 || this.x > game.width || this.y < 0 || this.y > game.height) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}

class Enemy {
    constructor() {
        // Spawn at random edge
        if (Math.random() < 0.5) {
            this.x = Math.random() < 0.5 ? -30 : game.width + 30;
            this.y = Math.random() * game.height;
        } else {
            this.x = Math.random() * game.width;
            this.y = Math.random() < 0.5 ? -30 : game.height + 30;
        }

        this.radius = 20;
        this.color = '#ff4444';
        this.speed = 1 + Math.random(); // Random speed
        this.health = 30;
        this.markedForDeletion = false;
        // Simple cooldown for shooting
        this.lastShot = Date.now();
        this.shootInterval = 2000 + Math.random() * 2000;
    }

    update() {
        // Move towards player
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;

        // Randomly shoot at player
        const now = Date.now();
        if (now - this.lastShot > this.shootInterval) {
            projectiles.push(new Projectile(this.x, this.y, player.x, player.y, true));
            this.lastShot = now;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}

// --- GAME LOGIC ---

let player;
let projectiles = [];
let enemies = [];
let particles = [];
let spawnTimer = 0;
let animationId;

function init() {
    player = new Player();
    player.lastShotTime = 0;
    projectiles = [];
    enemies = [];
    particles = [];
    game.score = 0;
    game.active = true;
    game.paused = false;
    updateUI();
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    loop();
}

function spawnEnemies() {
    spawnTimer++;
    if (spawnTimer % 100 === 0) { // Approx every 1.5 seconds (at 60fps)
        enemies.push(new Enemy());
    }
}

function checkCollisions() {
    // Projectiles
    projectiles.forEach((proj, pIndex) => {
        // Player bullets hitting enemies
        if (!proj.isEnemy) {
            enemies.forEach((enemy, eIndex) => {
                const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
                if (dist - enemy.radius - proj.radius < 1) {
                    // Hit!
                    enemy.health -= 10;

                    // Hit Effect
                    for (let i = 0; i < 3; i++) {
                        particles.push(new Particle(proj.x, proj.y, '#ff4444', {
                            x: (Math.random() - 0.5) * 8,
                            y: (Math.random() - 0.5) * 8
                        }));
                    }

                    if (enemy.health <= 0) {
                        enemy.markedForDeletion = true;
                        game.score += 100;
                        updateUI();
                        // Explosion effect
                        for (let i = 0; i < 15; i++) {
                            particles.push(new Particle(enemy.x, enemy.y, '#ff4444', {
                                x: (Math.random() - 0.5) * 10,
                                y: (Math.random() - 0.5) * 10
                            }));
                        }

                        // Chance to drop bandage
                        if (Math.random() < 0.2) {
                            player.bandages++;
                            updateUI();
                        }
                    }
                    proj.markedForDeletion = true;
                }
            });
        }
        // Enemy bullets hitting player
        else {
            const dist = Math.hypot(proj.x - player.x, proj.y - player.y);
            if (dist - player.radius - proj.radius < 1) {
                player.takeDamage(10);
                proj.markedForDeletion = true;
            }
        }
    });

    // Enemies touching player
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist - player.radius - enemy.radius < 1) {
            player.takeDamage(1); // Continuous damage
        }
    });
}

function update() {
    if (!game.active) return;

    player.update();

    // Player Shooting
    // Player Shooting
    if ((game.mouse.down || mobileInput.shooting) && game.active) {
        // Simple rate limiting (one shot per click currently, can add auto-fire later)
        // For mobile "hold to fire" might be better than tap. 
        // Current logic: `!player.isShooting` prevents spam. 
        // Let's allow auto-fire for mobile or change logic to timer-based.

        // Actually, existing logic is "one shot per click/tap".
        // Let's make it auto-fire with cooldown for better feel, or just keep as is.
        // Keeping as is for now means mobile users have to tap-tap-tap the right joystick? 
        // No, `mobileInput.shooting` stays true while holding.
        // We need a cooldown.

        const now = Date.now();
        if (now - player.lastShotTime > 200) { // 200ms fire rate
            let targetX, targetY;

            if (mobileInput.aim.active) {
                // Aim relative to player
                targetX = player.x + mobileInput.aim.x * 100;
                targetY = player.y + mobileInput.aim.y * 100;
            } else {
                targetX = game.mouse.x;
                targetY = game.mouse.y;
            }

            projectiles.push(new Projectile(player.x, player.y, targetX, targetY));
            player.lastShotTime = now;
        }
    }

    projectiles.forEach(p => p.update());
    projectiles = projectiles.filter(p => !p.markedForDeletion);

    spawnEnemies();
    enemies.forEach(e => e.update());
    enemies = enemies.filter(e => !e.markedForDeletion);

    particles.forEach((p, index) => {
        if (p.alpha <= 0) {
            particles.splice(index, 1);
        } else {
            p.update();
        }
    });

    checkCollisions();
}

function draw() {
    // Clear screen
    ctx.fillStyle = 'rgba(30, 30, 30, 0.3)'; // Trail effect
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    player.draw();
    projectiles.forEach(p => p.draw());
    enemies.forEach(e => e.draw());
    particles.forEach(p => p.draw());
}

function loop() {
    if (!game.active) return;
    update();
    draw();
    animationId = requestAnimationFrame(loop);
}

function updateUI() {
    document.getElementById('health-display').innerText = Math.ceil(player.health);
    document.getElementById('bandage-display').innerText = player.bandages;
    document.getElementById('score-display').innerText = game.score;
}

function endGame() {
    game.active = false;
    cancelAnimationFrame(animationId);
    document.getElementById('final-score').innerText = game.score;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

document.getElementById('restart-btn').addEventListener('click', () => {
    init();
});

document.getElementById('resume-btn').addEventListener('click', () => {
    togglePause();
});

function togglePause() {
    if (!game.active) return;
    game.paused = !game.paused;

    const pauseScreen = document.getElementById('pause-screen');

    if (game.paused) {
        pauseScreen.classList.remove('hidden');
        cancelAnimationFrame(animationId);
    } else {
        pauseScreen.classList.add('hidden');
        loop();
    }
}

// Start game
// --- MOBILE CONTROLS ---

const mobileInput = {
    move: { x: 0, y: 0, active: false },
    aim: { x: 0, y: 0, active: false },
    shooting: false
};

function setupMobileControls() {
    const leftZone = document.getElementById('joystick-left');
    const leftStick = leftZone.querySelector('.joystick-stick');
    const rightZone = document.getElementById('joystick-right');
    const rightStick = rightZone.querySelector('.joystick-stick');
    const healBtn = document.getElementById('mobile-heal-btn');
    const pauseBtn = document.getElementById('mobile-pause-btn');

    // Helper to handle joystick logic
    function handleJoystick(e, zone, stick, inputObj) {
        e.preventDefault();
        const touch = e.targetTouches[0];
        if (!touch) return;

        const rect = zone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const maxDist = rect.width / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.hypot(dx, dy);

        // Clamp stick visual
        const clampedDist = Math.min(dist, maxDist);
        const angle = Math.atan2(dy, dx);

        const stickX = Math.cos(angle) * clampedDist;
        const stickY = Math.sin(angle) * clampedDist;

        stick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

        // Normalize input (-1 to 1)
        inputObj.x = dx / maxDist; // Allow > 1 for deadzone logic or stick to unit circle
        inputObj.y = dy / maxDist;

        // Normalize vector if exceeding 1 (for circular movement feel)
        if (dist > maxDist) {
            inputObj.x = Math.cos(angle);
            inputObj.y = Math.sin(angle);
        }

        inputObj.active = true;
    }

    function resetJoystick(stick, inputObj) {
        stick.style.transform = `translate(-50%, -50%)`;
        inputObj.x = 0;
        inputObj.y = 0;
        inputObj.active = false;
    }

    // Left Joystick (Move)
    leftZone.addEventListener('touchstart', e => handleJoystick(e, leftZone, leftStick, mobileInput.move), { passive: false });
    leftZone.addEventListener('touchmove', e => handleJoystick(e, leftZone, leftStick, mobileInput.move), { passive: false });
    leftZone.addEventListener('touchend', e => resetJoystick(leftStick, mobileInput.move));

    // Right Joystick (Aim/Shoot)
    rightZone.addEventListener('touchstart', e => {
        handleJoystick(e, rightZone, rightStick, mobileInput.aim);
        mobileInput.shooting = true;
    }, { passive: false });
    rightZone.addEventListener('touchmove', e => handleJoystick(e, rightZone, rightStick, mobileInput.aim), { passive: false });
    rightZone.addEventListener('touchend', e => {
        resetJoystick(rightStick, mobileInput.aim);
        mobileInput.shooting = false;
    });

    // Buttons
    healBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        // Simulate 'E' key press logic
        if (player) player.useBandage();
    });

    pauseBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        togglePause();
    });
}

setupMobileControls();

// Start game logic
init();
