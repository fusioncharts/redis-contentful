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
    try {
      this.redisClient = Redis.createClient({
        ...(redis &&
          redis.host &&
          redis.port && { host: redis.host, port: redis.port }),
      });
      this.redisClient.select((redis && redis.database) || 0);

      this.cfClient = Contentful.createClient({
        space: contentful.space,
        accessToken: contentful.accessToken,
      });
      this.locale = contentful.locale || 'en-US';
    } catch (error) {
      return error;
    }
  }

  // Public Methods
  async sync() {
    try {
      const set = promisify(this.redisClient.set).bind(this.redisClient);
      const scan = promisify(this.redisClient.scan).bind(this.redisClient);
      const hget = promisify(this.redisClient.hget).bind(this.redisClient);
      const hset = promisify(this.redisClient.hset).bind(this.redisClient);
      const del = promisify(this.redisClient.del).bind(this.redisClient);

      const promises = [];
      const nextSyncToken = await hget('redis-contentful', 'nextSyncToken');
      const isInitial = !nextSyncToken;

      if (isInitial) {
        const flushall = promisify(this.redisClient.flushall).bind(
          this.redisClient
        );
        await flushall();
      }

      const response = await this.cfClient.sync({
        ...(isInitial && { initial: true }),
        ...(!isInitial && { nextSyncToken }),
      });

      // Adding all new entries in redis
      if (response.entries && response.entries.length) {
        response.entries.forEach(async entry => {
          const { sys } = entry;
          const contentType = sys.contentType.sys.id;
          promises.push(set(`${contentType}:${sys.id}`, JSON.stringify(entry)));
        });
      }

      // Deleting all the deleted entries from redis
      if (response.deletedEntries && response.deletedEntries.length) {
        response.deletedEntries.forEach(async entry => {
          const { sys } = entry;
          const responseKey = await scan('0', 'MATCH', `*:${sys.id}`);

          if (responseKey[1]) {
            promises.push(del(responseKey[1]));
          }
        });
      }

      await hset('redis-contentful', 'nextSyncToken', response.nextSyncToken);

      await Promise.all(promises);
      return Promise.resolve({ message: 'Sync Complete' });
    } catch (error) {
      return Promise.reject(new Error({ message: 'Sync Failed' }));
    }
  }

  async get(contentType) {
    try {
      const get = promisify(this.redisClient.get).bind(this.redisClient);
      const scan = promisify(this.redisClient.scan).bind(this.redisClient);

      const response = await scan(
        '0',
        'MATCH',
        `${contentType ? `${contentType}:*` : '*:*'}`
      );
      const keys = response[1] || [];

      const promises = keys.map(key => get(key));
      const responses = await Promise.all(promises);

      return keys.reduce((final, value, index) => {
        if (final[value.split(':').shift()]) {
          final[value.split(':').shift()].push(
            extract(JSON.parse(responses[index]), this.locale)
          );
        } else {
          final[value.split(':').shift()] = [
            extract(JSON.parse(responses[index]), this.locale),
          ];
        }
        return final;
      }, {});
    } catch (error) {
      return Promise.reject(new Error({ message: 'Get Failed' }));
    }
  }
}

module.exports = RedisContentful;
