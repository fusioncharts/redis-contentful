const { promisify } = require('util');
const Redis = require('redis');
const Contentful = require('contentful');

/**
 * A recursive function to extract meaningful
 * information from Redis.
 * @param {object} data
 * @param {string} locale
 * @returns {object}
 */
const extract = (data, locale) => {
  const { fields } = data;
  Object.keys(fields).forEach(fieldKey => {
    if (fields[fieldKey] && fields[fieldKey][locale] instanceof Array) {
      fields[fieldKey] = fields[fieldKey][locale].map(innerData =>
        extract(innerData, locale)
      );
    } else {
      fields[fieldKey] = fields[fieldKey][locale];
    }
  });

  // Removing the unwanted information
  return {
    id: data.sys.id,
    createdAt: data.sys.createdAt,
    updatedAt: data.sys.updatedAt,
    ...data.fields,
  };
};

class RedisContentful {
  constructor({ redis, contentful }) {
    this.redisClient = Redis.createClient();
    this.redisClient.select((redis && redis.database) || 0);

    this.cfClient = Contentful.createClient({
      space: contentful.space,
      accessToken: contentful.accessToken,
    });
    this.nextSyncToken = '';
    this.locale = contentful.locale || 'en-US';
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
                JSON.stringify(entry)
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
          ).map(key => extract(JSON.parse(responses[index][key]), this.locale)),
        }),
      {}
    );
  }
}

module.exports = RedisContentful;
