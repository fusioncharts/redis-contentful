const { expect } = require('chai');
const CFRedis = require('../src/index.js');

describe('cf-redis', () => {
  const client = new CFRedis({
    space: 'space id',
    accessToken: 'token',
  });

  it('creats an instance', () => {
    expect(client).to.be.an.instanceof(CFRedis);
  });

  describe('api', () => {
    it('should have a sync method', () => {
      expect(client.sync).to.be.a('function');
    });
    it('should have a get method', () => {
      expect(client.get).to.be.a('function');
    });
  });
});
