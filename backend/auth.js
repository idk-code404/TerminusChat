const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const users = new Map(); // username -> { passwordHash, meta }

async function register(username, password){
  if(users.has(username)) throw new Error('exists');
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  users.set(username, { passwordHash: hash, meta: { created: Date.now() }});
  return true;
}

async function authenticate(username, password){
  const u = users.get(username);
  if(!u) return null;
  const ok = await bcrypt.compare(password, u.passwordHash);
  if(!ok) return null;
  const token = jwt.sign({ sub: username }, SECRET, { expiresIn: '8h' });
  return token;
}

function verifyToken(token){
  try{ return jwt.verify(token, SECRET); }catch(e){ return null; }
}

module.exports = { register, authenticate, verifyToken };
