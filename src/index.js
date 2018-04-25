const { promisify } = require('util');
const Redis = require('redis');
const Contentful = require('contentful');

/**
 * A recursive function to extract meaningful
 * information from Redis.
 * @param {object} data
 * @param {string} field
 * @param {string} locale
 * @returns {object}
 */
const extract = (data, field, locale) => {
  if (data && data.fields) {
    const { fields } = data;
    if (field && typeof field === 'string') {
      // Deleting any other fields if specific field is provided
      Object.keys(fields).forEach(fieldKey => {
        if (field !== fieldKey) delete fields[fieldKey];
      });

      // If the field given is of primitive data type
      if (
        typeof fields[field][locale] === 'string' ||
        typeof fields[field][locale] === 'number'
      ) {
        fields[field] = fields[field][locale];
      } else if (fields[field][locale] instanceof Array) {
        fields[field] = fields[field][locale].map(innerData =>
          extract(innerData, '', locale)
        );
      } else if (fields[field][locale] instanceof Object) {
        fields[field] = extract(fields[field][locale], '', locale);
      }
    } else {
      Object.keys(fields).forEach(fieldKey => {
        if (fields[fieldKey] && fields[fieldKey][locale] instanceof Array) {
          fields[fieldKey] = fields[fieldKey][locale].map(innerData =>
            extract(innerData, '', locale)
          );
        } else if (
          fields[fieldKey] &&
          fields[fieldKey][locale] instanceof Object &&
          fields[fieldKey][locale].fields
        ) {
          fields[fieldKey] = extract(fields[fieldKey][locale], '', locale);
        } else {
          fields[fieldKey] = fields[fieldKey][locale];
        }
      });
    }

    // Removing the unwanted information
    return {
      id: data.sys.id,
      ...(data.sys.contentType &&
        data.sys.contentType.sys &&
        data.sys.contentType.sys.id && { type: data.sys.contentType.sys.id }),
      createdAt: data.sys.createdAt,
      updatedAt: data.sys.updatedAt,
      ...data.fields,
    };
  } else if (typeof data === 'string' || typeof data === 'number') {
    return data;
  }

  return undefined;
};

class RedisContentful {
  constructor({ redis, contentful }) {
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
    this.identifier = contentful.identifier;
  }

  // Public Methods
  async sync(shouldReset) {
    try {
      const set = promisify(this.redisClient.set).bind(this.redisClient);
      const scan = promisify(this.redisClient.scan).bind(this.redisClient);
      const hget = promisify(this.redisClient.hget).bind(this.redisClient);
      const hset = promisify(this.redisClient.hset).bind(this.redisClient);
      const del = promisify(this.redisClient.del).bind(this.redisClient);

      const promises = [];

      let isInitial;
      let nextSyncToken;
      if (shouldReset) {
        isInitial = true;
      } else {
        nextSyncToken = await hget('redis-contentful', 'nextSyncToken');
        isInitial = !nextSyncToken;
      }

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
        response.entries.forEach(entry => {
          const { sys } = entry;
          const contentType = sys.contentType.sys.id;
          promises.push(
            set(
              `${contentType}:${(entry.fields &&
                entry.fields[this.identifier] &&
                entry.fields[this.identifier][this.locale]) ||
                ''}:${sys.id}`,
              JSON.stringify(entry)
            )
          );
        });
      }

      // Deleting all the deleted entries from redis
      if (response.deletedEntries && response.deletedEntries.length) {
        // eslint-disable-next-line no-restricted-syntax
        for (const entry of response.deletedEntries) {
          const { sys } = entry;
          // eslint-disable-next-line no-await-in-loop
          const responseKey = await scan('0', 'MATCH', `*:*:${sys.id}`);

          if (responseKey[1]) {
            promises.push(del(responseKey[1]));
          }
        }
      }

      await hset('redis-contentful', 'nextSyncToken', response.nextSyncToken);

      await Promise.all(promises);
      return { message: 'Sync Complete' };
    } catch (error) {
      return new Error({ message: 'Sync Failed' });
    }
  }

  async get(details) {
    let field = '';
    let response = [];
    let keys = [];
    const get = promisify(this.redisClient.get).bind(this.redisClient);
    const scan = promisify(this.redisClient.scan).bind(this.redisClient);

    if (typeof details === 'string') {
      response = await scan('0', 'MATCH', `${details}:*:*`, 'COUNT', '10000');
      keys = response[1] || [];
    } else if (details instanceof Array) {
      const keyPromises = details.map(type =>
        scan(
          '0',
          'MATCH',
          `${type || '*'}:${details.search || '*'}:*`,
          'COUNT',
          '10000'
        )
      );
      const keyResponses = await Promise.all(keyPromises);
      const keysArray = keyResponses.map(keyResponse => keyResponse[1]);
      keys = Array.prototype.concat(...keysArray);
    } else if (details instanceof Object) {
      field = { details };
      if (typeof details.type === 'string') {
        response = await scan(
          '0',
          'MATCH',
          `${details.type || '*'}:${details.search || '*'}:*`,
          'COUNT',
          '10000'
        );
        keys = response[1] || [];
      } else if (details.type instanceof Array) {
        const keyPromises = details.type.map(type =>
          scan(
            '0',
            'MATCH',
            `${type || '*'}:${details.search || '*'}:*`,
            'COUNT',
            '10000'
          )
        );
        const keyResponses = await Promise.all(keyPromises);
        const keysArray = keyResponses.map(keyResponse => keyResponse[1]);
        keys = Array.prototype.concat(...keysArray);
      }
    }

    const promises = keys.map(key => get(key));
    const responses = await Promise.all(promises);

    return keys.reduce((final, value, index) => {
      if (final[value.split(':').shift()]) {
        final[value.split(':').shift()].push(
          extract(JSON.parse(responses[index]), field, this.locale)
        );
      } else {
        final[value.split(':').shift()] = [
          extract(JSON.parse(responses[index]), field, this.locale),
        ];
      }
      return final;
    }, {});
  }

  async close() {
    this.redisClient.quit();
  }
}

module.exports = RedisContentful;
