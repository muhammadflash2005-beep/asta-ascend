const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { Pool } = require('pg');

const ROOT = __dirname;
const PUB = ROOT;
const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const ORIGIN = process.env.APP_URL || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Refusing to start without persistent storage.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true
});

pool.on('error', err => console.error('Unexpected Neon pool error:', err.message));

function json(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

function cookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `asta_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', 'asta_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' +
    (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
}

function getToken(req) {
  return (req.headers.cookie || '')
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith('asta_session='))
    ?.slice('asta_session='.length) || '';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    let rejected = false;

    req.on('data', chunk => {
      if (rejected) return;
      s += chunk;
      if (s.length > 1e6) {
        rejected = true;
        reject(new Error('Request too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (rejected) return;
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', err => {
      if (!rejected) reject(err);
    });
  });
}

function safeText(value, max = 80) {
  return String(value || '').trim().slice(0, max);
}

function rank(level) {
  return level >= 80 ? 'S' : level >= 60 ? 'A' : level >= 40 ? 'B' :
    level >= 20 ? 'C' : level >= 10 ? 'D' : 'E';
}

function levelFromXp(xp) {
  let level = 1, need = 100, total = 0;
  while (level < 100 && xp >= total + need) {
    total += need;
    level++;
    need = 100 + level * 35;
  }
  return level;
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    coins: row.coins,
    xp: row.xp,
    level: row.level,
    rank: row.rank,
    stats: row.stats,
    focus: row.focus,
    levelChoice: row.level_choice,
    days: row.days,
    createdAt: row.created_at
  };
}

async function userFor(req) {
  const token = getToken(req);
  if (!token) return null;

  const result = await pool.query(
    `SELECT u.*
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)]
  );

  return result.rows[0] || null;
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await pool.query(
    `INSERT INTO app_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')
     ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [tokenHash, userId]
  );

  cookie(res, token);
}

async function api(req, res, url) {
  const p = url.pathname;

  if (p === '/api/health') {
    try {
      await pool.query('SELECT 1');
      return json(res, 200, {
        ok: true,
        app: 'ASTA Ascend',
        payments: !!PAYSTACK_SECRET,
        database: { status: 'connected' }
      });
    } catch (err) {
      console.error('Neon database check failed:', err.message);
      return json(res, 503, {
        ok: false,
        app: 'ASTA Ascend',
        payments: !!PAYSTACK_SECRET,
        database: { status: 'unavailable' }
      });
    }
  }
    if (p === '/api/register' && req.method === 'POST') {
    let client;
    try {
      const b = await body(req);
      const name = safeText(b.name, 60);
      const email = safeText(b.email, 160).toLowerCase();
      const password = String(b.password || '');

      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          password.length < 8 || password.length > 200) {
        return json(res, 400, { error: 'Enter a valid name, email and password of at least 8 characters.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');

      client = await pool.connect();
      await client.query('BEGIN');

            const inserted = await client.query(
        `INSERT INTO app_users (id, email, name, salt, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [crypto.randomUUID(), email, name, salt, passwordHash]
      );

      const user = inserted.rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);

      await client.query(
        `INSERT INTO app_sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [tokenHash, user.id]
      );

      await client.query('COMMIT');
      cookie(res, token);
      return json(res, 201, { user: publicUser(user) });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505') {
        return json(res, 409, { error: 'An account with this email already exists.' });
      }
      console.error('Registration failed:', err.message);
      return json(res, 500, { error: 'Could not create your account.' });
    } finally {
      if (client) client.release();
    }
  }

  if (p === '/api/login' && req.method === 'POST') {
    try {
      const b = await body(req);
      const email = safeText(b.email, 160).toLowerCase();
      const password = String(b.password || '');

      const result = await pool.query(
        'SELECT * FROM app_users WHERE lower(email) = $1',
        [email]
      );

      const user = result.rows[0];
      if (!user || password.length > 200) {
        return json(res, 401, { error: 'Invalid email or password.' });
      }

      const storedHash = Buffer.from(user.password_hash, 'hex');
      const suppliedHash = crypto.scryptSync(password, user.salt, 64);

      if (storedHash.length !== 64 ||
          !crypto.timingSafeEqual(storedHash, suppliedHash)) {
        return json(res, 401, { error: 'Invalid email or password.' });
      }

      await createSession(user.id, res);
      return json(res, 200, { user: publicUser(user) });
    } catch (err) {
      console.error('Login failed:', err.message);
      return json(res, 500, { error: 'Could not log in.' });
    }
  }

  if (p === '/api/logout' && req.method === 'POST') {
    try {
      const token = getToken(req);
      if (token) {
        await pool.query(
          'DELETE FROM app_sessions WHERE token_hash = $1',
          [hashToken(token)]
        );
      }
      clearCookie(res);
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('Logout failed:', err.message);
      return json(res, 500, { error: 'Could not log out.' });
    }
  }

  if (p === '/api/me' && req.method === 'GET') {
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      const [logsResult] = await Promise.all([
        pool.query(
          `SELECT id, log_date AS date, focus, exercises, xp, coins, notes,
                  duration, completed_at AS "completedAt"
             FROM workout_logs
            WHERE user_id = $1
            ORDER BY completed_at ASC`,
          [user.id]
        )
      ]);

      return json(res, 200, {
        user: publicUser(user),
        logs: logsResult.rows,
        schedule: user.schedule || {},
        favorites: user.favorites || [],
        reminders: user.reminders || {}
      });
    } catch (err) {
      console.error('Account loading failed:', err.message);
      return json(res, 500, { error: 'Could not load your account.' });
    }
  }

  if (p === '/api/profile' && req.method === 'PATCH') {
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      const b = await body(req);
      const sets = [];
      const values = [];
      let n = 1;

      if (Array.isArray(b.focus) && b.focus.length) {
        sets.push(`focus = $${n++}`);
        values.push(b.focus.map(x => safeText(x, 40)).filter(Boolean).slice(0, 12));

        sets.push(`level_choice = $${n++}`);
        values.push(safeText(b.levelChoice || 'Beginner', 30));

        sets.push(`days = $${n++}`);
        values.push(Math.max(1, Math.min(7, Number(b.days) || 3)));
      }

      if (b.reminders && typeof b.reminders === 'object') {
        sets.push(`reminders = $${n++}`);
        values.push(b.reminders);
      }

      if (sets.length) {
        values.push(user.id);
        await pool.query(
          `UPDATE app_users SET ${sets.join(', ')} WHERE id = $${n}`,
          values
        );
      }

      const updated = await pool.query(
        'SELECT * FROM app_users WHERE id = $1',
        [user.id]
      );

      return json(res, 200, { user: publicUser(updated.rows[0]) });
    } catch (err) {
      console.error('Profile update failed:', err.message);
      return json(res, 500, { error: 'Could not update your profile.' });
    }
                             }
    if (p === '/api/favorites' && req.method === 'POST') {
    let client;
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      const b = await body(req);
      const exerciseId = safeText(b.exerciseId, 100);
      if (!exerciseId) return json(res, 400, { error: 'Invalid exercise.' });

      client = await pool.connect();
      await client.query('BEGIN');

      const result = await client.query(
        'SELECT favorites FROM app_users WHERE id = $1 FOR UPDATE',
        [user.id]
      );

      let favorites = result.rows[0].favorites || [];
      favorites = Array.isArray(favorites) ? favorites : [];

      if (favorites.includes(exerciseId)) {
        favorites = favorites.filter(x => x !== exerciseId);
      } else {
        favorites.push(exerciseId);
      }

      await client.query(
        'UPDATE app_users SET favorites = $1 WHERE id = $2',
        [JSON.stringify(favorites), user.id]
      );

      await client.query('COMMIT');
      return json(res, 200, { favorites });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Favorites update failed:', err.message);
      return json(res, 500, { error: 'Could not update favorites.' });
    } finally {
      if (client) client.release();
    }
  }

  if (p === '/api/log' && req.method === 'POST') {
    let client;
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      const b = await body(req);
      const xp = Math.max(0, Math.min(10000, Math.floor(Number(b.xp) || 0)));
      const coins = Math.max(0, Math.min(10000, Math.floor(Number(b.coins) || 0)));
      const duration = Math.max(0, Math.min(1440, Math.floor(Number(b.duration) || 0)));
      const focus = safeText(b.focus, 80);
      const notes = safeText(b.notes, 1000);
      const exercises = Array.isArray(b.exercises) ? b.exercises.slice(0, 100) : [];

      client = await pool.connect();
      await client.query('BEGIN');

      const locked = await client.query(
        'SELECT * FROM app_users WHERE id = $1 FOR UPDATE',
        [user.id]
      );

      if (!locked.rows.length) {
        await client.query('ROLLBACK');
        return json(res, 401, { error: 'Account not found.' });
      }

      const current = locked.rows[0];
      const oldLevel = current.level;
      const newXp = current.xp + xp;
      const newLevel = Math.max(oldLevel, levelFromXp(newXp));
      const levelsGained = newLevel - oldLevel;
      const levelReward = levelsGained > 0
        ? (levelsGained >= 5 ? 100 : 25)
        : 0;
      const newCoins = current.coins + coins + levelReward;
      const logId = crypto.randomUUID();

      await client.query(
        `INSERT INTO workout_logs
          (id, user_id, log_date, focus, exercises, xp, coins, notes, duration)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)`,
        [logId, user.id, focus, JSON.stringify(exercises), xp, coins, notes, duration]
      );

      if (coins > 0) {
        await client.query(
          `INSERT INTO coin_ledger (user_id, reference, coins, source)
           VALUES ($1, $2, $3, 'workout')`,
          [user.id, `workout:${logId}`, coins]
        );
      }

      if (levelReward > 0) {
        await client.query(
          `INSERT INTO coin_ledger (user_id, reference, coins, source)
           VALUES ($1, $2, $3, 'level_up')`,
          [user.id, `levelup:${logId}`, levelReward]
        );
      }

      const stats = { ...(current.stats || {}) };
      const statKey = /strength|weight|muscle/i.test(focus) ? 'strength'
        : /run|cardio|agility/i.test(focus) ? 'agility'
        : /endurance|stamina/i.test(focus) ? 'endurance'
        : 'discipline';
      stats[statKey] = (Number(stats[statKey]) || 1) + 1;

      const updated = await client.query(
        `UPDATE app_users
            SET xp = $1, level = $2, rank = $3, coins = $4, stats = $5
          WHERE id = $6
          RETURNING *`,
        [newXp, newLevel, rank(newLevel), newCoins, JSON.stringify(stats), user.id]
      );

      const logResult = await client.query(
        `SELECT id, log_date AS date, focus, exercises, xp, coins, notes,
                duration, completed_at AS "completedAt"
           FROM workout_logs WHERE id = $1`,
        [logId]
      );

      await client.query('COMMIT');

      return json(res, 201, {
        log: logResult.rows[0],
        user: publicUser(updated.rows[0]),
        levelUp: levelsGained > 0
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Workout save failed:', err.message);
      return json(res, 500, { error: 'Could not save your workout.' });
    } finally {
      if (client) client.release();
    }
  }

  if (p === '/api/schedule' && req.method === 'PATCH') {
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      const b = await body(req);
      const schedule = b.schedule && typeof b.schedule === 'object'
        ? b.schedule : {};

      await pool.query(
        'UPDATE app_users SET schedule = $1 WHERE id = $2',
        [JSON.stringify(schedule), user.id]
      );

      return json(res, 200, { schedule });
    } catch (err) {
      console.error('Schedule update failed:', err.message);
      return json(res, 500, { error: 'Could not update your schedule.' });
    }
  }

  if (p === '/api/delete-account' && req.method === 'POST') {
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      await pool.query('DELETE FROM app_users WHERE id = $1', [user.id]);
      clearCookie(res);
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('Account deletion failed:', err.message);
      return json(res, 500, { error: 'Could not delete your account.' });
    }
  }
    if (p === '/api/payments/initialize' && req.method === 'POST') {
    let client;
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      if (!PAYSTACK_SECRET) {
        return json(res, 503, { error: 'Payments are not configured yet.' });
      }

      const b = await body(req);
      const packs = {
        500: 50000,
        1000: 100000,
        2500: 250000,
        5000: 500000
      };

      const coins = Number(b.amount);
      const amount = packs[coins];

      if (!amount) return json(res, 400, { error: 'Invalid coin pack.' });

      const reference = 'ASTA_' + crypto.randomBytes(12).toString('hex');

      await pool.query(
        `INSERT INTO app_payments
          (reference, user_id, coins, amount_kobo, currency, status)
         VALUES ($1, $2, $3, $4, 'NGN', 'initializing')`,
        [reference, user.id, coins, amount]
      );

      const response = await fetch(
        'https://api.paystack.co/transaction/initialize',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: user.email,
            amount,
            reference,
            callback_url: (ORIGIN || `${url.protocol}//${url.host}`) + '/payment-return',
            metadata: { userId: user.id, coins }
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.status || !data.data?.authorization_url) {
        await pool.query(
          `UPDATE app_payments SET status = 'failed' WHERE reference = $1`,
          [reference]
        );
        return json(res, 502, {
          error: data.message || 'Could not initialize payment.'
        });
      }

      await pool.query(
        `UPDATE app_payments SET status = 'pending' WHERE reference = $1`,
        [reference]
      );

      return json(res, 200, {
        url: data.data.authorization_url,
        reference
      });
    } catch (err) {
      console.error('Payment initialization failed:', err.message);
      return json(res, 500, { error: 'Could not initialize payment.' });
    } finally {
      if (client) client.release();
    }
  }

  if (p === '/api/payments/verify' && req.method === 'POST') {
    let client;
    try {
      const user = await userFor(req);
      if (!user) return json(res, 401, { error: 'Please log in.' });

      if (!PAYSTACK_SECRET) {
        return json(res, 503, { error: 'Payments are not configured.' });
      }

      const b = await body(req);
      const reference = safeText(b.reference, 100);

      if (!reference) {
        return json(res, 400, { error: 'Payment reference is required.' });
      }

      const paymentResult = await pool.query(
        `SELECT * FROM app_payments
          WHERE reference = $1 AND user_id = $2`,
        [reference, user.id]
      );

      const payment = paymentResult.rows[0];
      if (!payment) {
        return json(res, 404, { error: 'Payment reference not found.' });
      }

      if (payment.status === 'success') {
        const latest = await pool.query(
          'SELECT * FROM app_users WHERE id = $1',
          [user.id]
        );
        return json(res, 200, {
          ok: true,
          user: publicUser(latest.rows[0]),
          credited: true
        });
      }

      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
        }
      );

      const data = await response.json();

      if (
        !response.ok ||
        !data.status ||
        data.data?.status !== 'success' ||
        data.data?.amount !== payment.amount_kobo ||
        data.data?.currency !== 'NGN' ||
        data.data?.reference !== reference
      ) {
        return json(res, 400, {
          error: 'Payment has not been verified as successful.'
        });
      }

      client = await pool.connect();
      await client.query('BEGIN');

      const locked = await client.query(
        `SELECT * FROM app_payments
          WHERE reference = $1 AND user_id = $2
          FOR UPDATE`,
        [reference, user.id]
      );

      const lockedPayment = locked.rows[0];

      if (!lockedPayment) {
        await client.query('ROLLBACK');
        return json(res, 404, { error: 'Payment reference not found.' });
      }

      if (lockedPayment.status !== 'success') {
        const ledger = await client.query(
          `INSERT INTO coin_ledger (user_id, reference, coins, source)
           VALUES ($1, $2, $3, 'payment')
           ON CONFLICT (reference) DO NOTHING
           RETURNING id`,
          [user.id, `payment:${reference}`, lockedPayment.coins]
        );

        if (ledger.rowCount > 0) {
          await client.query(
            'UPDATE app_users SET coins = coins + $1 WHERE id = $2',
            [lockedPayment.coins, user.id]
          );
        }

        await client.query(
          `UPDATE app_payments
              SET status = 'success', verified_at = NOW()
            WHERE reference = $1`,
          [reference]
        );
      }

      const latest = await client.query(
        'SELECT * FROM app_users WHERE id = $1',
        [user.id]
      );

      await client.query('COMMIT');

      return json(res, 200, {
        ok: true,
        user: publicUser(latest.rows[0]),
        credited: true
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Payment verification failed:', err.message);
      return json(res, 500, { error: 'Could not verify payment.' });
    } finally {
      if (client) client.release();
    }
  }

  return json(res, 404, { error: 'Not found.' });
}

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      return await api(req, res, url);
    }

    let requestedPath;
    try {
      requestedPath = decodeURIComponent(url.pathname);
    } catch {
      return json(res, 400, { error: 'Invalid URL.' });
    }

    const file = path.resolve(
      PUB,
      '.' + (requestedPath === '/' ? '/index.html' : requestedPath)
    );

    if (file !== PUB && !file.startsWith(PUB + path.sep)) {
      return json(res, 403, { error: 'Forbidden.' });
    }

    let target = file;

    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      target = path.join(PUB, 'index.html');
    }

    if (!fs.existsSync(target)) {
      return json(res, 404, { error: 'File not found.' });
    }

    res.writeHead(200, {
      'Content-Type': mime[path.extname(target).toLowerCase()] ||
        'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });

    fs.createReadStream(target).pipe(res);
  } catch (err) {
    console.error('Server request failed:', err.message);
    if (!res.headersSent) {
      json(res, 500, { error: 'Server error.' });
    } else {
      res.destroy();
    }
  }
});

server.listen(PORT, () => {
  console.log(`ASTA Ascend running on port ${PORT}`);
});
