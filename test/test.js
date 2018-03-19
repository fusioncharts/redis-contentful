const { expect } = require('chai');
const RedisContentful = require('../src/index.js');

describe('redis-contentful', () => {
  const client = new RedisContentful({
    space: 'space id',
    accessToken: 'token',
  });

  it('creats an instance', () => {
    expect(client).to.be.an.instanceof(RedisContentful);
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
