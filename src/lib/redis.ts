import { RedisClient, createClient } from 'redis'

export class Redis
{
  _redis: RedisClient

  constructor( config: any )
  {
    this._redis = createClient( config )
  }

  async incrementFloat( key: string, value: any ): Promise<string>
  {
    return new Promise( ( resolve, reject ) =>
    {
      this._redis.incrbyfloat( key, value, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }

  async del( key: string )
  {
    return new Promise( ( resolve, reject ) =>
    {
      this._redis.del( key, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }

  async get( key: string )
  {
    return new Promise( ( resolve, reject ) =>
    {
      this._redis.get( key, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }

  async set( key: string, value: any )
  {
    return new Promise( ( resolve, reject ) =>
    {
      this._redis.set( key, value, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }
}