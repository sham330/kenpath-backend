const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const SALT_ROUNDS = 12;

const register = async ({ name, email, password }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw { status: 409, message: 'Email already in use' };

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name, email, password: hashed },
    select: { id: true, name: true, email: true, createdAt: true },
  });

  return user;
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { status: 401, message: 'Invalid credentials' };

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw { status: 401, message: 'Invalid credentials' };

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return { token, user: { id: user.id, name: user.name, email: user.email } };
};

module.exports = { register, login };
