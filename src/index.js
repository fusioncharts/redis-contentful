const { promisify } = require('util');
const redis = require('redis');
const contentful = require('contentful');

class RedisContentful {
  constructor(details) {
    this.nextSyncToken = '';

    this.cfClient = contentful.createClient({
      space: details.space,
      accessToken: details.accessToken,
    });

    this.redisClient = redis.createClient();
    this.local = details.local || 'en-US';
  }

  // Public Methods
  async sync() {
    const isInitial = this.nextSyncToken === '';

    const response = await this.cfClient.sync({
      ...(isInitial && { initial: true }),
      ...(!isInitial && { nextSyncToken: this.nextSyncToken }),
    });

    this.nextSyncToken = response.nextSyncToken;

    if (response.entries && response.entries.length) {
      const promises = [];
      response.entries.forEach(async entry => {
        const metadata = entry.sys;
        const contentType = metadata.contentType.sys.id;

        switch (metadata.type) {
          case 'Entry': {
            const hset = promisify(this.redisClient.hset).bind(
              this.redisClient
            );
            promises.push(
              hset(
                `redis-contentful:${contentType}`,
                metadata.id,
                JSON.stringify(entry.fields)
              )
            );
            break;
          }
          case 'Delete': {
            const hdel = promisify(this.redisClient.hdel).bind(
              this.redisClient
            );
            promises.push(hdel(`redis-contentful:${contentType}`, metadata.id));
            break;
          }
          default:
            break;
        }
      });

      await Promise.all(promises);
    }
    return Promise.resolve({ message: 'Sync Complete' });
  }

  async get(contentType) {
    const scan = promisify(this.redisClient.scan).bind(this.redisClient);
    const hgetall = promisify(this.redisClient.hgetall).bind(this.redisClient);
    const response = await scan(
      '0',
      'MATCH',
      `redis-contentful:${contentType || '*'}`
    );
    const hashes = response[1] || [];

    const promises = hashes.map(hash => hgetall(hash));
    const responses = await Promise.all(promises);

    return hashes.reduce(
      (final, value, index) =>
        Object.assign(final, {
          [value.split('redis-contentful:').pop()]: Object.keys(
            responses[index]
          ).map(key => {
            const parsed = JSON.parse(responses[index][key]);

            Object.keys(parsed).forEach(fieldKey => {
              parsed[fieldKey] = parsed[fieldKey][this.local];
            });

            return parsed;
          }),
        }),
      {}
    );
  }
}

module.exports = RedisContentful;
