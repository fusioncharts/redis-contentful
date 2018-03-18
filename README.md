<div align="center">
 
<h1>Contentful Redis</h1>

[![npm](https://img.shields.io/npm/v/cf-redis.svg)](https://www.npmjs.com/package/cf-redis) [![license](https://img.shields.io/github/license/shreyas-a/cf-redis.svg)](https://github.com/shreyas-a/cf-redis/blob/master/LICENSE)

A tiny library to map Contentful ☁️ space into Redis ⚡️

</div>

## Installation

```sh
npm install cf-redis --save
```

## Usage

Create an instance of `cf-redis` by passing contentful space ID & access token.

```js
import cfRedis from 'cf-redis';

const client = new cfRedis({
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
    "<ContentType ID 1>": [{}, {}, {}],
    "<ContentType ID 2>": [{}]
}
```

## Redis Store

> In Redis, the keys (content types) will be prefixed with cf-redis to uniquely identify keys created by cf-redis 🤓

## License

MIT ❤
