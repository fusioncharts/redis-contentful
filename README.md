<div align="center">
 
<h1>Redis Contentful</h1>

[![npm](https://img.shields.io/npm/v/redis-contentful.svg)](https://www.npmjs.com/package/redis-contentful) [![license](https://img.shields.io/github/license/shreyas-a/redis-contentful.svg)](https://github.com/shreyas-a/redis-contentful/blob/master/LICENSE)

A tiny library to map Contentful ☁️ space into Redis ⚡️

</div>

## Installation

```sh
npm install redis-contentful --save
```

## Usage

Create an instance of `redis-contentful` by passing contentful space ID & access token.

```js
import RedisContentful from 'redis-contentful';

const client = new RedisContentful({
  space: '<Space ID>',
  accessToken: '<Access Token>',
});
```

## API

### sync

Syncs the latest space content from Contentful and dumps it in your Redis server 🎉

```js
await client.sync();
```

### get

Gets all data directly from Redis 🚀

```js
const response = await client.get();
console.log(response);
```

You can also pass specific content type.

```js
const response = await client.get('about');
```

You'll get an object with your content type ID's as keys and their values as array of content objects.

```js
{
    "<awesome-key>": [{}, {}, {}],
    "<dumb-key>": [{}]
}
```

## Redis Store

> In Redis, the keys (content types) will be prefixed with redis-contentful to uniquely identify keys created by redis-contentful 🤓

## License

MIT ❤
