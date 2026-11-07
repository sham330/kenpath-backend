module.exports = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  glucoseReading: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};
