# Contentful Redis

A tiny library to map Contentful ☁️ space into Redis ⚡️

## Installation

```sh
npm i -S cf-redis
```

## Usage

```js
import cfRedis from "cf-redis";

const client = new cfRedis({
  space: "<Space ID>",
  accessToken: "<Access Token>"
});

(async () => {
  // Gets the latest space content from Contentful and dumps it in your Redis server 🎉
  await client.sync();

  // Gets all data directly from Redis 🚀
  const response = await client.get();
  console.log(response);
})();
```


```js
// You'll get an object with your content type ID's as keys and their values as array of content objects. The keys (content types) will be prefixed with cf-redis for uniquely identify keys created by cf-redis 🤓
{
    "cf-redis:<Your ContentType ID>": [{}, {}, {}]
}
```

License
----

MIT